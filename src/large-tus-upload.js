/**
 * Supabase Storage TUS 1.0 client for staged Knowledge Hub V2 uploads.
 * No credentials persisted; resume record stores an upload URL only.
 * Use only in the private, authorized Phoenix ONE client.
 */
export const LARGE_BUCKET='phoenix-hub-large-media-temp'
export const TUS_CHUNK_BYTES=6*1024*1024
export const LARGE_MAX_BYTES=500_000_000
const VALID_EXT=/\.(mp4|webm|mov|m4a|mp3|wav)$/i
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIME={mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav'}
const b64=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text)))
const keyFor=(uid,file)=>'phoenix-v2-tus:'+uid+':'+file.name+':'+file.size+':'+file.lastModified
const error=(code)=>Object.assign(new Error(code),{code})
export function validateUpload({file,userId,storageUrl,accessToken,apikey}){
 if(!file||!VALID_EXT.test(file.name)||!Number.isSafeInteger(file.size)||file.size<1000||file.size>LARGE_MAX_BYTES)throw error('invalid_large_media')
 if(!UUID.test(userId||'')||!accessToken||!apikey)throw error('unauthorized')
 const parsed=new URL(storageUrl)
 if(parsed.protocol!=='https:'||!/^https:\/\/[a-z0-9-]+\.storage\.supabase\.co$/.test(parsed.origin))throw error('invalid_storage_origin')
 return {origin:parsed.origin,extension:file.name.split('.').pop().toLowerCase()}
}
export function ensureUploadLocation(location,origin){
 const parsed=new URL(location,origin)
 if(parsed.protocol!=='https:'||parsed.origin!==origin||!parsed.pathname.startsWith('/storage/v1/upload/resumable/'))throw error('invalid_upload_location')
 return parsed.href
}
async function send(fetcher,request){
 let response
 try{response=await fetcher(request.url,request.init)}catch(e){
  if(request.signal?.aborted)throw error('upload_paused')
  throw error('upload_network_failure')
 }
 return response
}
export function createLargeTusUpload({file,userId,storageUrl,accessToken,apikey,onProgress=()=>{},onState=()=>{},fetcher=fetch,store=localStorage,uuid=()=>crypto.randomUUID()}){
 const {origin,extension}=validateUpload({file,userId,storageUrl,accessToken,apikey})
 const endpoint=origin+'/storage/v1/upload/resumable'
 const storageKey=keyFor(userId,file)
 const baseHeaders={authorization:'Bearer '+accessToken,apikey,'Tus-Resumable':'1.0.0'}
 let uploadUrl=null,controller=null,stopped=false,path=null
 const doRequest=(url,init)=>send(fetcher,{url,init,signal:init.signal})
 const waitRetry=async(fn)=>{
  const delays=[0,1000,2500,5000]
  let last
  for(const delay of delays){
   if(stopped)throw error('upload_paused')
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay))
   if(stopped)throw error('upload_paused')
   try{return await fn()}catch(e){
    last=e
    if(e.code==='upload_paused'||e.code==='invalid_upload_location'||e.code==='unauthorized')throw e
   }
  }
  throw last||error('upload_network_failure')
 }
 const resumeOffset=async()=>{
  const r=await doRequest(uploadUrl,{method:'HEAD',headers:baseHeaders,signal:controller.signal})
  if(!r.ok)throw error('upload_resume_failed')
  const offset=Number(r.headers.get('Upload-Offset'))
  if(!Number.isSafeInteger(offset)||offset<0||offset>file.size)throw error('upload_offset_invalid')
  return offset
 }
 const create=async()=>{
  path=userId+'/'+uuid()+'.'+extension
  if(!UUID.test(path.split('/')[1].split('.')[0]))throw error('invalid_generated_path')
  const meta=[
   ['bucketName',LARGE_BUCKET],['objectName',path],['contentType',MIME[extension]],
   ['cacheControl','0']
  ].map(([k,v])=>k+' '+b64(v)).join(',')
  const r=await doRequest(endpoint,{method:'POST',headers:{...baseHeaders,'Upload-Length':String(file.size),'Upload-Metadata':meta},signal:controller.signal})
  if(!r.ok)throw error('upload_create_failed')
  uploadUrl=ensureUploadLocation(r.headers.get('Location'),origin)
  store.setItem(storageKey,JSON.stringify({url:uploadUrl,path,createdAt:Date.now()}))
  return 0
 }
 const start=async()=>{
  if(controller)throw error('upload_already_running')
  stopped=false;controller=new AbortController()
  try{
   onState('connecting')
   let offset=0
   const saved=store.getItem(storageKey)
   if(saved){
    try{
     const record=JSON.parse(saved)
     if(!record||!UUID.test(record.path?.split('/')[1]?.split('.')[0])||!record.path.startsWith(userId+'/'))throw Error('invalid_record')
     // Supabase resumable URLs expire within 24 hours.
     if(Date.now()-record.createdAt>23*60*60*1000)throw Error('expired')
     uploadUrl=ensureUploadLocation(record.url,origin);path=record.path
     offset=await resumeOffset()
    }catch(e){
     if(e.code==='upload_paused')throw e
     store.removeItem(storageKey);uploadUrl=null;path=null
    }
   }
   if(!uploadUrl)offset=await waitRetry(create)
   onState('uploading');onProgress(offset,file.size)
   while(offset<file.size){
    if(stopped)throw error('upload_paused')
    const end=Math.min(file.size,offset+TUS_CHUNK_BYTES)
    const data=file.slice(offset,end)
    await waitRetry(async()=>{
     const r=await doRequest(uploadUrl,{method:'PATCH',headers:{...baseHeaders,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},body:data,signal:controller.signal})
     if(r.status===409||r.status===423){
      offset=await resumeOffset()
      throw error('upload_retry_offset')
     }
     if(!r.ok)throw error('upload_chunk_failed')
     const next=Number(r.headers.get('Upload-Offset'))
     if(!Number.isSafeInteger(next)||next<offset||next>end)throw error('upload_offset_invalid')
     offset=next;onProgress(offset,file.size)
    })
   }
   store.removeItem(storageKey)
   onState('uploaded')
   return {path,bytes:file.size,bucket:LARGE_BUCKET,status:'uploaded_only'}
  }catch(e){onState(e.code==='upload_paused'?'paused':'failed');throw e}finally{controller=null}
 }
 return {start,pause:()=>{stopped=true;controller?.abort()},get path(){return path},get running(){return !!controller}}
}
