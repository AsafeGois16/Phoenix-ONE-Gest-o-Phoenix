import {createClient} from 'npm:@supabase/supabase-js@2.49.10'
import postgres from 'npm:postgres@3.4.5'

const url=Deno.env.get('SUPABASE_URL')||''
const anon=Deno.env.get('SUPABASE_ANON_KEY')||''
const dbUrl=Deno.env.get('SUPABASE_DB_URL')||''
const sql=postgres(dbUrl,{max:1,prepare:false,connect_timeout:8,idle_timeout:10})
const allowedOrigin='https://phoenix-one-ai.vercel.app'
const CORS={
 'Access-Control-Allow-Origin':allowedOrigin,
 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Cache-Control':'no-store',
 'Vary':'Origin',
 'Content-Type':'application/json; charset=utf-8'
}
const respond=(status,data)=>new Response(JSON.stringify(data),{status,headers:CORS})
const scopesAllowed=new Set(['contacts:resolve','identity:resolve','clients:read','policies:read','installments:read','tickets:read','tickets:create','tickets:transfer','tickets:comment','users:capabilities','tickets:resolved'])
const goodURL=input=>{
 if(typeof input!=='string'||input.length>255)return false
 try{
  const u=new URL(input)
  const host=u.hostname.toLowerCase()
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||u.pathname.includes('..'))return false
  if(['localhost','127.0.0.1','::1','0.0.0.0','169.254.169.254'].includes(host)||host.endsWith('.local')||host.endsWith('.internal'))return false
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(':')||host.length<4)return false
  return true
 }catch{return false}
}
const isJuniorEndpoint=input=>{
 if(!goodURL(input))return false
 try{
  const u=new URL(input)
  return /^[a-z0-9-]+\.supabase\.co$/i.test(u.hostname)&&/^\/functions\/v1\/phoenix-one-api\/v1\/?$/.test(u.pathname)
 }catch{return false}
}
const credentialName='phoenix_one_junior_api_token'
Deno.serve(async req=>{
 if(req.method==='OPTIONS'){
   if(req.headers.get('origin')!==allowedOrigin)return respond(403,{error:'origin_not_allowed'})
   return new Response(null,{status:204,headers:CORS})
 }
 if(req.method!=='POST')return respond(405,{error:'method_not_allowed'})
 if(req.headers.get('origin')!==allowedOrigin)return respond(403,{error:'origin_not_allowed'})
 const auth=req.headers.get('authorization')||''
 const jwt=auth.startsWith('Bearer ')?auth.slice(7):''
 if(jwt.length<40)return respond(401,{error:'unauthorized'})
 try{
   const supa=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}})
   const {data:{user},error}=await supa.auth.getUser(jwt)
   if(error||!user)return respond(401,{error:'invalid_session'})
   const matched=await sql.unsafe('select role from phoenix_one.admin_users where user_id=$1::uuid limit 1',[user.id])
   if(matched.length===0)return respond(403,{error:'not_phoenix_one_admin'})
   if(!['admin','owner'].includes(matched[0].role))return respond(403,{error:'admin_permission_required'})
   const request=await req.json().catch(()=>({}))
   const action=request.action
   if(action==='status'){
     const list=await sql.unsafe("select provider,state,api_base_url,granted_scopes,last_sync_at,updated_at from phoenix_one.integration_connections where provider='junior_management'")
     const rec=list[0]||{}
     const secrets=await sql.unsafe('select id from vault.secrets where name=$1 limit 1',[credentialName])
     return respond(200,{admin:true,role:matched[0].role,connection:{provider:'junior_management',state:rec.state||'disabled',apiBaseUrl:rec.api_base_url||'',scopes:rec.granted_scopes||[],lastTestAt:rec.last_sync_at||null,updatedAt:rec.updated_at||null},secretConfigured:secrets.length>0,secretStorage:'supabase_vault'})
   }
   if(action==='save'){
     const endpoint=typeof request.apiBaseUrl==='string'?request.apiBaseUrl.trim().replace(/\/+$/,''):''
     const selected=Array.isArray(request.scopes)?[...new Set(request.scopes)]:[]
     const token=typeof request.apiToken==='string'?request.apiToken.trim():''
     if(endpoint&&!isJuniorEndpoint(endpoint))return respond(400,{error:'invalid_junior_endpoint'})
     if(selected.length>15||selected.some(s=>typeof s!=='string'||!scopesAllowed.has(s)))return respond(400,{error:'invalid_scopes'})
     if(token&&(!/^[^\s]{24,2048}$/.test(token)))return respond(400,{error:'invalid_api_token'})
     if(token&&!endpoint)return respond(400,{error:'api_url_missing'})
     await sql.begin(async tx=>{
       if(token){
         await tx.unsafe('select pg_advisory_xact_lock(hashtext($1))',[credentialName])
         const existing=await tx.unsafe('select id from vault.secrets where name=$1',[credentialName])
         if(existing.length)await tx.unsafe('select vault.update_secret($1::uuid,$2)',[existing[0].id,token])
         else await tx.unsafe('select vault.create_secret($1,$2,$3)',[token,credentialName,'Token da API de gestão do Junior para o Phoenix ONE'])
       }
       await tx.unsafe("update phoenix_one.integration_connections set api_base_url=$1,granted_scopes=CASE WHEN $2='' THEN '{}'::text[] ELSE string_to_array($2,',') END,state='disabled',last_sync_at=null,updated_at=now() where provider='junior_management'",[endpoint||null,selected.join(',')])
       await tx.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id,metadata) values ($1::uuid,'management_connection_updated','integration','junior_management',$2::jsonb)",[user.id,JSON.stringify({api_host:endpoint?new URL(endpoint).hostname:null,scopes:selected,credential_updated:!!token})])
     })
     return respond(200,{saved:true,state:'disabled',note:'Configuração salva no Phoenix ONE. A chave foi armazenada no Supabase Vault, sem exibir o valor.'})
   }
   if(action==='probe'){
     const conversationId=typeof request.conversationId==='string'?request.conversationId.trim():''
     if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId))return respond(400,{error:'invalid_conversation_id'})
     const connection=await sql.unsafe("select api_base_url from phoenix_one.integration_connections where provider='junior_management'")
     const endpoint=connection[0]?.api_base_url||''
     if(!endpoint)return respond(200,{ok:false,reason:'api_url_missing'})
     if(!isJuniorEndpoint(endpoint))return respond(200,{ok:false,reason:'invalid_junior_endpoint'})
     const secrets=await sql.unsafe('select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1',[credentialName])
     const token=secrets[0]?.decrypted_secret||''
     if(!token)return respond(200,{ok:false,reason:'server_secret_missing'})
     const target=endpoint+'/contacts/resolve?conversation_id='+encodeURIComponent(conversationId)
     let response
     try{
       response=await fetch(target,{method:'GET',redirect:'error',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}})
     }catch{return respond(200,{ok:false,reason:'connection_unavailable'})}
     if(response.status===401||response.status===403)return respond(200,{ok:false,reason:'access_denied'})
     if(response.status===404)return respond(200,{ok:false,reason:'conversation_not_open'})
     if(!response.ok)return respond(200,{ok:false,reason:'junior_api_unavailable',httpStatus:response.status})
     await sql.unsafe("update phoenix_one.integration_connections set state='testing',last_sync_at=now(),updated_at=now() where provider='junior_management'")
     await sql.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id,metadata) values($1::uuid,'junior_api_probe_ok','integration','junior_management','{}'::jsonb)",[user.id])
     return respond(200,{ok:true,state:'testing',note:'Consulta de protocolo autorizada pela API do Junior. Nenhuma mensagem enviada nem dados retornados ao navegador.'})
   }
   return respond(400,{error:'unknown_action'})
 }catch(err){console.error('phoenix-one-admin',err?.name||'runtime_error');return respond(500,{error:'integration_service_unavailable'})}
})
