import {createClient} from '@supabase/supabase-js'
const ORIGIN='https://phoenix-one-ai.vercel.app'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const respond=(res,status,body)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(body)}
export const config={maxDuration:10}
export default async function handler(req,res){
 if(req.method!=='POST')return respond(res,405,{error:'method_not_allowed'})
 if(req.headers.origin!==ORIGIN||(req.headers['x-forwarded-host']||req.headers.host)!=='phoenix-one-ai.vercel.app')return respond(res,403,{error:'origin_not_allowed'})
 const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'')
 const {conversation_id}=req.body||{}
 if(!UUID.test(conversation_id||''))return respond(res,400,{error:'invalid_conversation_id'})
 const supa=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY
 if(!supa||!key)return respond(res,503,{error:'phoenix_auth_not_configured'})
 try{
  const sb=createClient(supa,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await sb.auth.getUser(bearer)
  if(error||!user)return respond(res,401,{error:'invalid_session'})
  const checker=await fetch(supa+'/functions/v1/phoenix-one-admin',{method:'POST',headers:{Authorization:'Bearer '+bearer,apikey:key,Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({action:'status'})})
  if(!checker.ok)return respond(res,403,{error:'not_phoenix_one_admin'})
  const data=await checker.json()
  if(!['owner','admin'].includes(data.role))return respond(res,403,{error:'admin_permission_required'})
  const base=process.env.JUNIOR_MANAGEMENT_API_URL,token=process.env.PHOENIX_ONE_API_TOKEN
  if(!base||!token)return respond(res,503,{error:'junior_api_credentials_pending'})
  const url=new URL(base)
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.includes('.'))return respond(res,503,{error:'junior_api_url_invalid'})
  const target=new URL(url.pathname.replace(/\/+$/,'')+'/contacts/resolve?conversation_id='+encodeURIComponent(conversation_id),url.origin)
  const reply=await fetch(target,{method:'GET',redirect:'error',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}})
  if(reply.status===401||reply.status===403)return respond(res,200,{ok:false,error:'junior_auth_rejected'})
  if(reply.status===404)return respond(res,200,{ok:false,error:'conversation_not_open'})
  if(!reply.ok)return respond(res,200,{ok:false,error:'junior_api_unavailable',httpStatus:reply.status})
  return respond(res,200,{ok:true,checked:'contacts:resolve',note:'API do Junior autorizou a consulta do protocolo informado. Nenhum dado de cliente foi exibido.'})
 }catch(e){return respond(res,503,{error:e?.name==='TimeoutError'?'junior_timeout':'junior_api_connection_failed'})}
}