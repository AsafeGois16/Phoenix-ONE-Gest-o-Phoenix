import {createClient} from '@supabase/supabase-js'
export const config={api:{bodyParser:{sizeLimit:'4mb'}}}
const URL=process.env.VITE_SUPABASE_URL,KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,ORIGIN='https://phoenix-one-ai.vercel.app'
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'})
 if(req.headers.origin!==ORIGIN||(req.headers['x-forwarded-host']||req.headers.host)!=='phoenix-one-ai.vercel.app')return res.status(403).json({error:'origin_not_allowed'})
 const jwt=String(req.headers.authorization||'').replace(/^Bearer /,'')
 if(!jwt||!URL||!KEY)return res.status(401).json({error:'unauthorized'})
 try{
  const client=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await client.auth.getUser(jwt)
  if(error||!user)return res.status(401).json({error:'unauthorized'})
  const auth=await fetch(URL+'/functions/v1/phoenix-one-core',{method:'POST',headers:{Authorization:'Bearer '+jwt,apikey:KEY,Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({action:'bootstrap'})})
  if(!auth.ok)return res.status(403).json({error:'no_phoenix_one_permission'})
  const {name,content}=req.body||{}
  if(typeof name!=='string'||!/\.(pdf|docx)$/i.test(name)||typeof content!=='string'||content.length>3600000)return res.status(400).json({error:'unsupported_file'})
  const bytes=Buffer.from(content,'base64')
  if(bytes.length>2700000)return res.status(413).json({error:'file_too_large'})
  let text=''
  if(/\.pdf$/i.test(name)){
    const parser=(await import('pdf-parse')).default
    const data=await parser(bytes)
    text=data?.text||''
  }else{
    const mammoth=(await import('mammoth')).default
    const data=await mammoth.extractRawText({buffer:bytes})
    text=data?.value||''
  }
  text=text.replace(/\u0000/g,'').trim()
  if(text.length<30)return res.status(422).json({error:'no_extractable_text'})
  if(text.length>150000)return res.status(413).json({error:'document_too_long'})
  return res.status(200).json({text})
 }catch(e){console.error('phoenix-extract',e?.name);return res.status(500).json({error:'file_extraction_failed'})}
}
