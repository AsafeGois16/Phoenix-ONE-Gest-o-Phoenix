import {createClient} from 'npm:@supabase/supabase-js@2.49.10'
import postgres from 'npm:postgres@3.4.5'

/**
 * MegaBrain V1 — leitura administrativa independente.
 * NÃO participa da rota de respostas, não altera memória nem conversa com
 * Junior. Não envia mensagens, documentos, resumos ou informações pessoais.
 */
const origin='https://phoenix-one-ai.vercel.app'
const headers={
 'Access-Control-Allow-Origin':origin,
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Content-Type':'application/json',
 'Cache-Control':'no-store',
 'Vary':'Origin',
}
const output=(status,data)=>new Response(JSON.stringify(data),{status,headers})
const supabaseUrl=Deno.env.get('SUPABASE_URL')||''
const anonKey=Deno.env.get('SUPABASE_ANON_KEY')||''
const dbUrl=Deno.env.get('SUPABASE_DB_URL')||''
const pg=postgres(dbUrl,{max:2,prepare:false,connect_timeout:8,idle_timeout:12})

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return request.headers.get('origin')===origin
  ?new Response(null,{status:204,headers}):output(403,{error:'origin_not_allowed'})
 if(request.method!=='POST')return output(405,{error:'method_not_allowed'})
 if(request.headers.get('origin')!==origin)return output(403,{error:'origin_not_allowed'})
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'')
 if(token.length<40)return output(401,{error:'unauthorized'})
 try{
  const supa=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await supa.auth.getUser(token)
  if(error||!user)return output(401,{error:'invalid_session'})
  const auth=await pg.unsafe(
   'select role from phoenix_one.admin_users where user_id=$1::uuid',[user.id]
  )
  if(!auth.length||!['owner','admin'].includes(auth[0].role))
   return output(403,{error:'megabrain_admin_only'})
  const body=await request.json().catch(()=>({}))
  if(body.action!=='snapshot')return output(400,{error:'invalid_action'})
  // Todas as consultas são SELECT, dentro do schema privado.
  // Nenhuma consulta ao CRM LEADS nem ao banco operacional do Junior.
  const [counts,rows]=await Promise.all([
   pg.unsafe(
    "select count(*)::int as total, count(*) filter(where stage='with_agent')::int as with_agent, count(*) filter(where stage='assigned')::int as assigned, count(*) filter(where stage='resolved')::int as resolved, count(*) filter(where last_agent='clara')::int as clara, count(*) filter(where last_agent='murilo')::int as murilo from phoenix_one.protocol_agent_state where expires_at>now()"
   ),
   pg.unsafe(
    "select external_ticket_id as protocolo,last_agent as agent,last_intent as intent,stage,clara_apresentada,murilo_apresentado,updated_at,last_event_at,expires_at from phoenix_one.protocol_agent_state where source_system='junior_management' and expires_at>now() order by updated_at desc limit 60"
   )
  ])
  return output(200,{
   version:'megabrain-v1',
   readonly:true,
   data_origin:'phoenix_one.protocol_agent_state',
   fetched_at:new Date().toISOString(),
   counts:counts[0],
   protocols:rows,
   scope:'metadata_only',
   note:'Não contém conteúdo de mensagens, documento, número de contato ou identificação do cliente.',
  })
 }catch(error){
  // Nunca retornar detalhes de SQL, token ou dados pessoais.
  console.error('phoenix_megabrain_snapshot_failed',error?.name||'unexpected')
  return output(503,{error:'megabrain_unavailable'})
 }
})
