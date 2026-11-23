import {createClient} from '@supabase/supabase-js'
import {TRANSCRIBE_BUCKET,TranscriptionError,validOwnedPath,transcribeMedia} from '../server/knowledge-transcription.js'
export const config={api:{bodyParser:{sizeLimit:'8kb'}},maxDuration:180}
const ORIGIN='https://phoenix-one-ai.vercel.app'
const URL=process.env.VITE_SUPABASE_URL,KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ROLES=new Set(['owner','admin','editor'])
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'})
 if(req.headers.origin!==ORIGIN||(req.headers['x-forwarded-host']||req.headers.host)!=='phoenix-one-ai.vercel.app')return res.status(403).json({error:'origin_not_allowed'})
 const jwt=String(req.headers.authorization||'').replace(/^Bearer /,'')
 if(jwt.length<40||!URL||!KEY)return res.status(401).json({error:'unauthorized'})
 const path=req.body?.path
 const language=req.body?.language
 const model=req.body?.model||'gpt-transcribe'
 if(req.body?.consent!==true||!['auto','pt'].includes(language)||!['gpt-transcribe','whisper-1'].includes(model)||typeof path!=='string')return res.status(400).json({error:'invalid_transcription_request'})
 let storage=null,canCleanup=false
 try{
  const supa=createClient(URL,KEY,{
   auth:{persistSession:false,autoRefreshToken:false},
   global:{headers:{Authorization:'Bearer '+jwt}}
  })
  const {data:{user},error}=await supa.auth.getUser(jwt)
  if(error||!user)return res.status(401).json({error:'unauthorized'})
  const extension=validOwnedPath(path,user.id)
  if(!extension)return res.status(400).json({error:'invalid_media_path'})
  const permission=await fetch(URL+'/functions/v1/phoenix-one-core',{
   method:'POST',
   headers:{Authorization:'Bearer '+jwt,apikey:KEY,Origin:ORIGIN,'Content-Type':'application/json'},
   body:JSON.stringify({action:'bootstrap'}),signal:AbortSignal.timeout(8000),cache:'no-store'
  })
  if(!permission.ok)return res.status(403).json({error:'not_phoenix_one_admin'})
  const state=await permission.json().catch(()=>({}))
  if(!ROLES.has(state.role))return res.status(403).json({error:'forbidden'})
  storage=supa.storage.from(TRANSCRIBE_BUCKET)
  canCleanup=true
  const {data:media,error:downloadError}=await storage.download(path)
  if(downloadError||!media)throw new TranscriptionError('media_not_found')
  const result=await transcribeMedia(media,{
   filename:'recording.'+extension,
   apiKey:process.env.OPENAI_API_KEY,
   language,
   model
  })
  // Text is returned for manual editing; it is NOT automatically saved or
  // published. The original media is removed in finally, success or failure.
  return res.status(200).json({...result,reviewRequired:true,published:false,temporaryMedia:true})
 }catch(e){
  const code=e instanceof TranscriptionError?e.message:'transcription_unavailable'
  const status=e instanceof TranscriptionError?e.status:503
  console.warn('phoenix_transcription_error',JSON.stringify({reason:code,...(e instanceof TranscriptionError&&e.details?e.details:{})}))
  return res.status(status).json({error:code})
 }finally{
  if(canCleanup&&storage){
   try{
    const {error}=await storage.remove([path])
    if(error)console.warn('phoenix_transcription_cleanup',JSON.stringify({reason:'storage_delete_failed'}))
   }catch{console.warn('phoenix_transcription_cleanup',JSON.stringify({reason:'storage_delete_failed'}))}
  }
 }
}
