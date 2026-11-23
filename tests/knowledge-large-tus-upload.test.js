import test from 'node:test'
import assert from 'node:assert/strict'
import {createLargeTusUpload,ensureUploadLocation,validateUpload,TUS_CHUNK_BYTES} from '../src/large-tus-upload.js'
const uid='11111111-1111-4111-8111-111111111111'
const fid='22222222-2222-4222-8222-222222222222'
const origin='https://cxyxrhmpjehrqhwihxul.storage.supabase.co'
const endpoint=origin+'/storage/v1/upload/resumable'
const location=endpoint+'/upload-fixture'
const file={name:'treinamento.mp4',size:14*1024*1024,lastModified:15,slice:(from,to)=>new Blob([new Uint8Array(to-from)])}
const store=()=>{const m=new Map();return {getItem:key=>m.get(key)||null,setItem:(key,val)=>m.set(key,val),removeItem:key=>m.delete(key),_map:m}}
test('validate path, size and storage origin',()=>{
 assert.equal(TUS_CHUNK_BYTES,6*1024*1024)
 assert.equal(validateUpload({file,userId:uid,storageUrl:origin,accessToken:'token',apikey:'key'}).origin,origin)
 assert.throws(()=>validateUpload({file:{...file,size:501000000},userId:uid,storageUrl:origin,accessToken:'token',apikey:'key'}),/invalid_large_media/)
 assert.throws(()=>validateUpload({file,userId:uid,storageUrl:'https://evil.example',accessToken:'token',apikey:'key'}),/invalid_storage_origin/)
 assert.throws(()=>ensureUploadLocation('https://evil.example/storage/v1/upload/resumable/u',origin),/invalid_upload_location/)
})
test('TUS chunks are 6 MiB, progress reflects confirmed offsets',async()=>{
 const requests=[];let offset=0;const states=[];const progress=[]
 const fetcher=async(url,opts)=>{
  requests.push({url,method:opts.method,headers:opts.headers,body:opts.body})
  if(opts.method==='POST')return {ok:true,headers:new Headers({Location:location})}
  if(opts.method==='PATCH'){
   assert.equal(opts.headers['Upload-Offset'],String(offset))
   offset+=opts.body.size
   return {ok:true,headers:new Headers({'Upload-Offset':String(offset)})}
  }
  throw Error('unexpected')
 }
 const obj=createLargeTusUpload({file,userId:uid,storageUrl:origin,accessToken:'token',apikey:'key',store:store(),fetcher,uuid:()=>fid,onProgress:(n,total)=>progress.push([n,total]),onState:s=>states.push(s)})
 const result=await obj.start()
 assert.equal(result.path,uid+'/'+fid+'.mp4')
 assert.equal(result.status,'uploaded_only')
 assert.equal(offset,file.size)
 assert.deepEqual(requests.map(r=>r.method),['POST','PATCH','PATCH','PATCH'])
 assert.equal(requests[1].body.size,TUS_CHUNK_BYTES)
 assert.equal(progress.at(-1)[0],file.size)
 assert.equal(states.at(-1),'uploaded')
 assert.equal(requests[0].headers.authorization,'Bearer token')
 assert.ok(requests[0].headers['Upload-Metadata'].includes('bucketName '))
})
test('interrupted upload resumes using HEAD offset',async()=>{
 const storage=store();const saveKey='phoenix-v2-tus:'+uid+':'+file.name+':'+file.size+':'+file.lastModified
 storage.setItem(saveKey,JSON.stringify({url:location,path:uid+'/'+fid+'.mp4',createdAt:Date.now()}))
 const methods=[];let offset=6*1024*1024
 const fetcher=async(url,opts)=>{
  methods.push(opts.method)
  if(opts.method==='HEAD')return {ok:true,headers:new Headers({'Upload-Offset':String(offset)})}
  if(opts.method==='PATCH'){offset+=opts.body.size;return {ok:true,headers:new Headers({'Upload-Offset':String(offset)})}}
  throw Error('unexpected')
 }
 const result=await createLargeTusUpload({file,userId:uid,storageUrl:origin,accessToken:'token',apikey:'key',store:storage,fetcher,uuid:()=>fid}).start()
 assert.equal(result.bytes,file.size)
 assert.deepEqual(methods,['HEAD','PATCH','PATCH'])
 assert.equal(storage.getItem(saveKey),null)
})
