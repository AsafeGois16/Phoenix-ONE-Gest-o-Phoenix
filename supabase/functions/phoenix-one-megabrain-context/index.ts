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
 topic:['cotacao','inclusao','exclusao','boleto','reembolso','sinistro','rede_credenciada','alteracao_cadastral','nao_identificado','consulta_apolices','coberturas','assistencia'],
 subtopic:['nao_identificado','guincho'],
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
   if(!Object.entries({agent:observation.agent,topic:observation.topic,subtopic:observation.subtopic??'nao_identificado',product:observation.product,next_step:observation.next_step,pending:observation.pending}).every(([field,value])=>enums[field].includes(value)))return output(400,{error:'invalid_observation'})
   if(observation.confidence!=='inferido'||observation.source!=='mensagem_cliente'||!Array.isArray(observation.facts)||observation.facts.length>2||observation.facts.some(x=>!enums.facts.includes(x)))return output(400,{error:'invalid_facts'})
   const observed=new Date(observation.observed_at)
   if(Number.isNaN(observed.getTime())||Math.abs(Date.now()-observed.getTime())>180000)return output(400,{error:'stale_observation'})
   // FAIL-CLOSED: observar somente após autorização ADMIN ativa para esta conversa.
   // O INSERT SELECT impede gravação se o protocolo tiver sido encerrado,
   // transferido, substituído, revogado ou expirado entre chamadas.
   const writes=await pg.unsafe(
    "insert into phoenix_one.megabrain_context_observations(source_system,external_ticket_id,conversation_id,source_agent,topic,subtopic,product,next_step,pending,facts,observed_at,expires_at) select 'junior_management',s.external_ticket_id,s.conversation_id,$3,$4,$10,$5,$6,$7,$8::text[],$9::timestamptz,least(s.expires_at,g.expires_at) from phoenix_one.protocol_agent_state s join phoenix_one.megabrain_protocol_grants g on g.source_system=s.source_system and g.external_ticket_id=s.external_ticket_id and g.conversation_id=s.conversation_id where s.source_system='junior_management' and s.external_ticket_id=$1 and s.conversation_id=$2::uuid and s.stage='with_agent' and s.expires_at>now() and g.enabled=true and g.revoked_at is null and g.expires_at>now() and $9::timestamptz>=g.granted_at-interval '2 seconds' on conflict(source_system,external_ticket_id) do update set source_agent=excluded.source_agent,topic=excluded.topic,subtopic=excluded.subtopic,product=excluded.product,next_step=excluded.next_step,pending=excluded.pending,facts=excluded.facts,observed_at=excluded.observed_at,expires_at=excluded.expires_at,updated_at=now() where phoenix_one.megabrain_context_observations.conversation_id=excluded.conversation_id and phoenix_one.megabrain_context_observations.observed_at<=excluded.observed_at returning external_ticket_id",
    [body.protocolo,body.conversationId,observation.agent,observation.topic,observation.product,observation.next_step,observation.pending,observation.facts,observed.toISOString(),observation.subtopic||'nao_identificado']
   )
   return output(200,{accepted:writes.length>0,mode:'shadow',reply_unchanged:true})
  }
  if(['grant','revoke','control_status','snapshot'].includes(body.action)){
   if(req.headers.get('origin')!==origin)return output(403,{error:'origin_not_allowed'})
   if(token.length<40)return output(401,{error:'unauthorized'})
   const auth=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}})
   const {data:{user},error}=await auth.auth.getUser(token)
   if(error||!user)return output(401,{error:'invalid_session'})
   const admins=await pg.unsafe("select role from phoenix_one.admin_users where user_id=$1::uuid",[user.id])
   if(!admins.length||!['owner','admin'].includes(admins[0].role))return output(403,{error:'megabrain_admin_only'})
   if(body.action!=='snapshot'){
    if(!ticket(body.protocolo))return output(400,{error:'invalid_protocol'})
    if(body.action==='control_status'){
     const rows=await pg.unsafe(
      "select s.stage,s.expires_at as protocol_expires_at,g.enabled,g.granted_at,g.expires_at as grant_expires_at,g.revoked_at,o.updated_at as last_observation_at from phoenix_one.protocol_agent_state s left join phoenix_one.megabrain_protocol_grants g on g.source_system=s.source_system and g.external_ticket_id=s.external_ticket_id and g.conversation_id=s.conversation_id left join phoenix_one.megabrain_context_observations o on o.source_system=s.source_system and o.external_ticket_id=s.external_ticket_id and o.conversation_id=s.conversation_id where s.source_system='junior_management' and s.external_ticket_id=$1 and s.expires_at>now() limit 1",
      [body.protocolo]
     )
     if(!rows.length)return output(404,{error:'protocol_not_available'})
     const row=rows[0]
     return output(200,{version:'megabrain-v21',protocolo:body.protocolo,stage:row.stage,can_authorize:row.stage==='with_agent',active:Boolean(row.enabled&&row.grant_expires_at&&new Date(row.grant_expires_at)>new Date()&&!row.revoked_at&&row.stage==='with_agent'),grant_expires_at:row.grant_expires_at,last_observation_at:row.last_observation_at,mode:'test_only'})
    }
    if(body.action==='grant'){
     if(body.confirm!=='AUTORIZAR_TESTE')return output(400,{error:'explicit_confirmation_required'})
     const granted=await pg.unsafe(
      "insert into phoenix_one.megabrain_protocol_grants(source_system,external_ticket_id,conversation_id,enabled,granted_by,granted_at,expires_at,revoked_at) select 'junior_management',s.external_ticket_id,s.conversation_id,true,$2::uuid,now(),least(now()+interval '30 minutes',s.expires_at),null from phoenix_one.protocol_agent_state s where s.source_system='junior_management' and s.external_ticket_id=$1 and s.stage='with_agent' and s.expires_at>now() on conflict(source_system,external_ticket_id) do update set conversation_id=excluded.conversation_id,enabled=true,granted_by=excluded.granted_by,granted_at=excluded.granted_at,expires_at=excluded.expires_at,revoked_at=null,updated_at=now() returning expires_at",
      [body.protocolo,user.id]
     )
     if(!granted.length)return output(409,{error:'protocol_not_eligible'})
     return output(200,{enabled:true,expires_at:granted[0].expires_at,mode:'test_only'})
    }
    if(body.action==='revoke'){
     const removed=await pg.unsafe(
      "update phoenix_one.megabrain_protocol_grants set enabled=false,revoked_at=now(),updated_at=now() where source_system='junior_management' and external_ticket_id=$1 and enabled=true returning external_ticket_id",
      [body.protocolo]
     )
     return output(200,{enabled:false,revoked:removed.length>0})
    }
   }
   // snapshot preserves existing response contract.
   const rows=await pg.unsafe(
    "select o.external_ticket_id as protocolo,o.source_agent as agent,o.topic,o.subtopic,o.product,o.next_step,o.pending,o.facts,o.confidence,o.source,o.updated_at,o.expires_at from phoenix_one.megabrain_context_observations o join phoenix_one.protocol_agent_state s on s.source_system=o.source_system and s.external_ticket_id=o.external_ticket_id and s.conversation_id=o.conversation_id where o.expires_at>now() and s.expires_at>now() order by o.updated_at desc limit 60"
   )
   return output(200,{version:'megabrain-v2-shadow',readonly:true,scope:'non_sensitive_categories_only',enabled_for_agents:false,observations:rows,observed_count:rows.length})
  }
  return output(400,{error:'invalid_action'})
 }catch(error){
  console.error('megabrain_v2_request_failed',error?.name||'unexpected')
  return output(503,{error:'megabrain_context_unavailable'})
 }
})
