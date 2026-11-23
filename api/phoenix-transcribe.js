import {createClient} from '@supabase/supabase-js'
export const config={api:{bodyParser:false},maxDuration:60}
const SUPABASE_URL=process.env.VITE_SUPABASE_URL
const KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ORIGIN='https://phoenix-one-ai.vercel.app'
const ROLES=new Set(['owner','admin','editor'])
const MAX_BYTES=4*1024*1024
const ALLOWED=/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i
function reject(res,status,error){return res.status(status).json({error})}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 if(req.method!=='POST')return reject(res,405,'method_not_allowed')
 if(req.headers.origin!==ORIGIN||(req.headers['x-forwarded-host']||req.headers.host)!=='phoenix-one-ai.vercel.app')return reject(res,403,'origin_not_allowed')
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'')
 if(token.length<40||!SUPABASE_URL||!KEY)return reject(res,401,'unauthorized')
 if(!process.env.OPENAI_API_KEY)return reject(res,503,'transcription_not_configured')
 const name=String(req.headers['x-file-name']||'').trim()
 if(!name||name.length>180||!ALLOWED.test(name))return reject(res,400,'unsupported_media_format')
 const declared=Number(req.headers['content-length']||0)
 if(!Number.isFinite(declared)||declared>MAX_BYTES)return reject(res,413,'media_too_large')
 try{
  const supa=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await supa.auth.getUser(token)
  if(error||!user)return reject(res,401,'unauthorized')
  const permission=await fetch(SUPABASE_URL+'/functions/v1/phoenix-one-core',{
   method:'POST',headers:{Authorization:'Bearer '+token,apikey:KEY,Origin:ORIGIN,'Content-Type':'application/json'},
   body:JSON.stringify({action:'bootstrap'}),signal:AbortSignal.timeout(8000),cache:'no-store'
  })
  if(!permission.ok)return reject(res,403,'not_phoenix_one_admin')
  const state=await permission.json().catch(()=>({}))
  if(!ROLES.has(state.role))return reject(res,403,'forbidden')
  const pieces=[]
  let length=0
  for await(const piece of req){
   length+=piece.length
   if(length>MAX_BYTES)return reject(res,413,'media_too_large')
   pieces.push(piece)
  }
  if(length<100)return reject(res,400,'empty_media')
  const media=Buffer.concat(pieces)
  // Read-only transformation: no audio/video bytes are persisted here.
  const form=new FormData()
  form.append('file',new Blob([media],{type:'application/octet-stream'}),name.replace(/[^a-zA-Z0-9._-]/g,'_'))
  form.append('model','whisper-1')
  form.append('response_format','json')
  const upstream=await fetch('https://api.openai.com/v1/audio/transcriptions',{
   method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:AbortSignal.timeout(50000)
  })
  if(!upstream.ok){console.warn('phoenix_transcribe_upstream',upstream.status);return reject(res,502,'transcription_provider_failed')}
  const result=await upstream.json()
  const transcript=String(result.text||'').replace(/\u0000/g,'').trim()
  if(transcript.length<30)return reject(res,422,'transcription_empty')
  if(transcript.length>110000)return reject(res,413,'transcription_too_long')
  const content=[
   'FONTE: arquivo de mídia enviado localmente ('+name+')',
   'TIPO DE FONTE: transcrição automática de áudio por Whisper; pode conter erros',
   'DATA DE IMPORTAÇÃO (UTC): '+new Date().toISOString(),
   'ATENÇÃO: revisar fidelidade, nomes, dados pessoais e orientações antes de publicar.',
   '---','TRANSCRIÇÃO:',transcript
  ].join('\n')
  return res.status(200).json({title:'Transcrição — '+name,content,kind:'media_transcript',reviewRequired:true,published:false})
 }catch(e){
  console.warn('phoenix_transcription',e?.name||'error')
  return reject(res,503,'transcription_unavailable')
 }
}
