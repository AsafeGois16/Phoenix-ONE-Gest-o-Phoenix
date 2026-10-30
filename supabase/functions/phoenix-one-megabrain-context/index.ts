import postgres from 'npm:postgres@3.4.5'
import {createClient} from 'npm:@supabase/supabase-js@2.49.10'

/** Sidecar independente: não participa do roteamento ou geração de respostas. */
const pg=postgres(Deno.env.get('SUPABASE_DB_URL')||'',{max:2,prepare:false,connect_timeout:7,idle_timeout:10})
const origin='https://phoenix-one-ai.vercel.app'
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}
const output=(code,body)=>new Response(JSON.stringify(body),{status:code,headers})
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s)
const ticket=s=>typeof s==='string'&&/^\d{8}-\d{4}$/.test(s)
const enums={
 agent:['clara','murilo'],
 topic:['cotacao','inclusao','exclusao','boleto','reembolso','sinistro','rede_credenciada','alteracao_cadastral','nao_identificado'],
 product:['odontologico','saude','vida','auto','residencial','empresarial','viagem','nao_identificado'],
 next_step:['acompanhar_encaminhamento','validar_titular','aguardar_cliente','continuar_atendimento'],
 pending:['encaminhamento_proposto','validacao_pendente','resposta_pendente','nao_identificada'],
 facts:['assunto_identificado','produto_mencionado']
}
async function isBridgeToken(token){
 if(!token||token.length<40||token.length>200)return false
 const rows=await pg.unsafe("select token_sha256 from phoenix_one.bridge_auth where id='vercel_bridge' and active=true")
 if(!rows.length)return false
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))
 const actual=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('')
 const expected=rows[0].token_sha256
 if(actual.length!==expected.length)return false
 let diff=0
 for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i)
 return diff===0
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return req.headers.get('origin')===origin?new Response(null,{status:204,headers}):output(403,{error:'origin_not_allowed'})
 if(req.method!=='POST')return output(405,{error:'method_not_allowed'})
 try{
  const bearer=req.headers.get('authorization')||''
  const token=bearer.startsWith('Bearer ')?bearer.slice(7):''
  const body=await req.json().catch(()=>null)
  if(!body||typeof body!=='object')return output(400,{error:'invalid_request'})
  if(body.action==='observe'){
   // Apenas o servidor de atendimento autenticado pode registrar observação.
   if(!await isBridgeToken(token))return output(401,{error:'unauthorized'})
   const observation=body.observation
   if(!ticket(body.protocolo)||!uuid(body.conversationId)||!observation||typeof observation!=='object')return output(400,{error:'invalid_protocol'})
   if(!Object.entries({agent:observation.agent,topic:observation.topic,product:observation.product,next_step:observation.next_step,pending:observation.pending}).every(([field,value])=>enums[field].includes(value)))return output(400,{error:'invalid_observation'})
   if(observation.confidence!=='inferido'||observation.source!=='mensagem_cliente'||!Array.isArray(observation.facts)||observation.facts.length>2||observation.facts.some(x=>!enums.facts.includes(x)))return output(400,{error:'invalid_facts'})
   const observed=new Date(observation.observed_at)
   if(Number.isNaN(observed.getTime())||Math.abs(Date.now()-observed.getTime())>180000)return output(400,{error:'stale_observation'})
   const state=await pg.unsafe("select conversation_id::text as conversation,expires_at,stage from phoenix_one.protocol_agent_state where source_system='junior_management' and external_ticket_id=$1 and expires_at>now() limit 1",[body.protocolo])
   // Não assumir identidade nem vincular a um protocolo que não foi verificado.
   if(!state.length||state[0].conversation.toLowerCase()!==body.conversationId.toLowerCase()||['assigned','resolved'].includes(state[0].stage))return output(409,{error:'protocol_not_observable'})
   await pg.unsafe(
    "insert into phoenix_one.megabrain_context_observations(source_system,external_ticket_id,conversation_id,source_agent,topic,product,next_step,pending,facts,observed_at,expires_at) values('junior_management',$1,$2::uuid,$3,$4,$5,$6,$7,$8::text[],$9::timestamptz,least($10::timestamptz,now()+interval '7 days')) on conflict(source_system,external_ticket_id) do update set source_agent=excluded.source_agent,topic=excluded.topic,product=excluded.product,next_step=excluded.next_step,pending=excluded.pending,facts=excluded.facts,observed_at=excluded.observed_at,expires_at=excluded.expires_at,updated_at=now() where phoenix_one.megabrain_context_observations.conversation_id=excluded.conversation_id and phoenix_one.megabrain_context_observations.observed_at<=excluded.observed_at",
    [body.protocolo,body.conversationId,observation.agent,observation.topic,observation.product,observation.next_step,observation.pending,observation.facts,observed.toISOString(),state[0].expires_at]
   )
   return output(200,{accepted:true,mode:'shadow',reply_unchanged:true})
  }
  if(body.action==='snapshot'){
   if(req.headers.get('origin')!==origin)return output(403,{error:'origin_not_allowed'})
   if(token.length<40)return output(401,{error:'unauthorized'})
   const auth=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}})
   const {data:{user},error}=await auth.auth.getUser(token)
   if(error||!user)return output(401,{error:'invalid_session'})
   const admins=await pg.unsafe("select role from phoenix_one.admin_users where user_id=$1::uuid",[user.id])
   if(!admins.length||!['owner','admin'].includes(admins[0].role))return output(403,{error:'megabrain_admin_only'})
   const rows=await pg.unsafe(
    "select o.external_ticket_id as protocolo,o.source_agent as agent,o.topic,o.product,o.next_step,o.pending,o.facts,o.confidence,o.source,o.updated_at,o.expires_at from phoenix_one.megabrain_context_observations o join phoenix_one.protocol_agent_state s on s.source_system=o.source_system and s.external_ticket_id=o.external_ticket_id and s.conversation_id=o.conversation_id where o.expires_at>now() and s.expires_at>now() order by o.updated_at desc limit 60"
   )
   return output(200,{version:'megabrain-v2-shadow',readonly:true,scope:'non_sensitive_categories_only',enabled_for_agents:false,observations:rows,observed_count:rows.length})
  }
  return output(400,{error:'invalid_action'})
 }catch(error){
  console.error('megabrain_v2_request_failed',error?.name||'unexpected')
  return output(503,{error:'megabrain_context_unavailable'})
 }
})
