import postgres from 'npm:postgres@3.4.5'
const database=Deno.env.get('SUPABASE_DB_URL')||''
const pg=postgres(database,{max:2,prepare:false,connect_timeout:7,idle_timeout:10})
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}})
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x)
const agentOk=x=>x==='clara'||x==='murilo'
const eventsAllowed=new Set(['ticket.assigned.v1','ticket.updated.v1','ticket.returned_to_agent.v1','ticket.resolved.v1'])
const cleanString=(s,n)=>typeof s==='string'?s.slice(0,n):''
function redact(s){
 return s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gi,'[EMAIL]')
 .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[DOCUMENTO]')
 .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,'[DOCUMENTO]')
 .replace(/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g,'[CONTATO]')
 .replace(/\b\d{8,}\b/g,'[IDENTIFICADOR]')
}
async function authenticate(token){
 if(!token||token.length<40||token.length>200)return false
 const r=await pg.unsafe("select token_sha256 from phoenix_one.bridge_auth where id='vercel_bridge' and active=true")
 if(!r.length)return false
 const encoded=new TextEncoder().encode(token)
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))
 const actual=Array.from(digest).map(x=>x.toString(16).padStart(2,'0')).join('')
 const expected=r[0].token_sha256
 if(actual.length!==expected.length)return false
 let difference=0
 for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i)
 return difference===0
}
async function openAgentState(data){
 const ticket=data.protocolo,conversation=data.conversationId,intent=data.intent,suggested=data.suggestedAgent||data.agent
 if(!uuid(conversation)||typeof ticket!=='string'||!/^\d{8}-\d{4}$/.test(ticket)||!['neutral','service','sales'].includes(intent)||!agentOk(suggested))
   return {blocked:true,reason:'invalid_agent_state'}
 return pg.begin(async tx=>{
   await tx.unsafe('select pg_advisory_xact_lock(hashtext($1))',['phoenix-one:'+ticket])
   // A stale pause must not lock a renewed ticket indefinitely.
   await tx.unsafe("delete from phoenix_one.protocol_agent_state where source_system='junior_management' and external_ticket_id=$1 and expires_at<=now()",[ticket])
   const prev=await tx.unsafe("select conversation_id::text as conversation_id,last_agent,last_intent,stage from phoenix_one.protocol_agent_state where source_system='junior_management' and external_ticket_id=$1 and expires_at>now()",[ticket])
   const current=prev[0]
   if(current&&current.conversation_id!==conversation)return {blocked:true,reason:'protocol_conversation_mismatch'}
   if(['assigned','resolved'].includes(current?.stage))return {blocked:true,reason:current.stage==='assigned'?'assigned_to_human':'protocol_resolved'}
   // Fresh explicit intent wins. For neutral follow-ups, preserve prior active agent.
   const agent=intent==='neutral'&&agentOk(current?.last_agent)&&current?.last_intent!=='neutral'?current.last_agent:suggested
   const savedIntent=intent==='neutral'&&['sales','service'].includes(current?.last_intent)?current.last_intent:intent
   const updated=await tx.unsafe("insert into phoenix_one.protocol_agent_state(source_system,external_ticket_id,conversation_id,last_agent,last_intent,stage,expires_at) values('junior_management',$1,$2::uuid,$3,$4,'with_agent',now()+interval '7 days') on conflict(source_system,external_ticket_id) do update set conversation_id=excluded.conversation_id,last_agent=excluded.last_agent,last_intent=excluded.last_intent,updated_at=now(),expires_at=excluded.expires_at where phoenix_one.protocol_agent_state.stage not in ('assigned','resolved') returning last_agent,last_intent,stage",[ticket,conversation,agent,savedIntent])
   if(!updated.length)return {blocked:true,reason:'assigned_to_human'}
   return {blocked:false,agent:updated[0].last_agent,intent:updated[0].last_intent,stage:updated[0].stage,changed:agentOk(current?.last_agent)&&current.last_agent!==agent}
 })
}
Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'})
 const rawAuth=request.headers.get('authorization')||''
 const token=rawAuth.startsWith('Bearer ')?rawAuth.slice(7):''
 try{
  if(!await authenticate(token))return reply(401,{error:'bridge_unauthorized'})
  const data=await request.json().catch(()=>null)
  if(!data||typeof data!=='object')return reply(400,{error:'invalid_json'})
  if(data.action==='intro_status'){
   const ticket=data.protocolo,conversation=data.conversationId
   if(!uuid(conversation)||typeof ticket!=='string'||!/^\d{8}-\d{4}$/.test(ticket)||
      typeof data.observedClara!=='boolean'||typeof data.observedMurilo!=='boolean')
     return reply(400,{error:'invalid_intro_status'})
   const result=await pg.begin(async tx=>{
     await tx.unsafe('select pg_advisory_xact_lock(hashtext($1))',['phoenix-one:'+ticket])
     await tx.unsafe("delete from phoenix_one.protocol_agent_state where source_system='junior_management' and external_ticket_id=$1 and expires_at<=now()",[ticket])
     const prev=await tx.unsafe("select conversation_id::text as conversation_id,stage from phoenix_one.protocol_agent_state where source_system='junior_management' and external_ticket_id=$1",[ticket])
     if(prev[0]&&prev[0].conversation_id!==conversation)return {blocked:true,reason:'protocol_conversation_mismatch'}
     if(['assigned','resolved'].includes(prev[0]?.stage))return {blocked:true,reason:'protocol_not_with_agent'}
     // Confirmation comes from OUTBOUND agent messages observed by the Junior.
     // Proposal-only messages in Sugestão mode do not set these flags.
     const saved=await tx.unsafe("insert into phoenix_one.protocol_agent_state(source_system,external_ticket_id,conversation_id,clara_apresentada,murilo_apresentado,expires_at) values('junior_management',$1,$2::uuid,$3,$4,now()+interval '7 days') on conflict(source_system,external_ticket_id) do update set clara_apresentada=phoenix_one.protocol_agent_state.clara_apresentada or excluded.clara_apresentada,murilo_apresentado=phoenix_one.protocol_agent_state.murilo_apresentado or excluded.murilo_apresentado,updated_at=now(),expires_at=now()+interval '7 days' returning clara_apresentada,murilo_apresentado",[ticket,conversation,data.observedClara,data.observedMurilo])
     return {blocked:false,clara_apresentada:saved[0].clara_apresentada,murilo_apresentado:saved[0].murilo_apresentado}
   })
   return reply(200,result)
  }
  if(data.action==='prompt_only'){
   const state=data.conversationId?await openAgentState(data):{agent:data.agent}
   if(state.blocked)return reply(409,{error:state.reason})
   const agent=state.agent
   if(!agentOk(agent))return reply(400,{error:'invalid_agent'})
   const active=await pg.unsafe("select v.version,v.system_prompt from phoenix_one.agent_versions v where v.agent_id=$1 and v.active=true limit 1",[agent])
   if(!active.length)return reply(409,{error:'agent_prompt_not_available'})
   return reply(200,{agent,version:active[0].version,prompt:active[0].system_prompt,sources:[]})
  }
  if(data.action==='context'){
   const state=data.conversationId?await openAgentState(data):{agent:data.agent}
   if(state.blocked)return reply(409,{error:state.reason})
   const agent=state.agent,query=cleanString(data.query,850)
   if(!agentOk(agent)||!query.trim())return reply(400,{error:'invalid_context'})
   const agents=await pg.unsafe("select v.version,v.system_prompt from phoenix_one.agent_versions v where v.agent_id=$1 and v.active=true limit 1",[agent])
   if(!agents.length)return reply(409,{error:'agent_prompt_not_available'})
   let matches=await pg.unsafe("select d.title as source,c.chunk_index,c.content,ts_rank_cd(to_tsvector('portuguese',c.content),websearch_to_tsquery('portuguese',$1)) as rank from phoenix_one.knowledge_chunks c join phoenix_one.knowledge_documents d on d.id=c.document_id join phoenix_one.document_agents da on da.document_id=d.id and da.agent_id=$2 where d.status='published' and d.sensitivity in ('internal','public') and (d.valid_until is null or d.valid_until >= current_date) and to_tsvector('portuguese',c.content) @@ websearch_to_tsquery('portuguese',$1) order by rank desc limit 6",[query,agent])
   if(!matches.length){
     // Segundo passe para perguntas naturais. Escopos de agente e publicação são preservados.
     matches=await pg.unsafe("with terms as (select replace(plainto_tsquery('portuguese',$1)::text,' & ',' | ')::tsquery as q) select d.title as source,c.chunk_index,c.content,ts_rank_cd(to_tsvector('portuguese',c.content),terms.q) + case when d.title ilike '%Backoffice%' and $1 ~* '(exclus|inclus|moviment|dependen|beneficiar|junior|backoffice)' then 0.5 else 0 end as rank from phoenix_one.knowledge_chunks c join phoenix_one.knowledge_documents d on d.id=c.document_id join phoenix_one.document_agents da on da.document_id=d.id and da.agent_id=$2 cross join terms where d.status='published' and d.sensitivity in ('internal','public') and (d.valid_until is null or d.valid_until >= current_date) and to_tsvector('portuguese',c.content) @@ terms.q order by rank desc limit 6",[query,agent])
   }
   return reply(200,{agent,version:agents[0].version,prompt:agents[0].system_prompt,sources:matches.map(x=>({title:x.source,chunk_index:x.chunk_index,content:x.content.slice(0,1300)}))})
  }
  if(data.action==='identity_context'){
   const conversationId=data.conversationId,protocolo=data.protocolo
   if(!uuid(conversationId)||typeof protocolo!=='string'||!/^\d{8}-\d{4}$/.test(protocolo))return reply(400,{error:'invalid_identity_request'})
   const doc=typeof data.document==='string'?data.document:'',typ=data.documentType
   if(!((typ==='cpf'&&/^\d{11}$/.test(doc))||(typ==='cnpj'&&/^\d{14}$/.test(doc))))return reply(400,{error:'invalid_document_format'})
   const proof=data.proof
   let verifiedProof=null
   if(proof!==undefined&&proof!==null){
    if(typeof proof!=='object'||Array.isArray(proof)||Object.keys(proof).length!==1)return reply(400,{error:'invalid_proof'})
    if(typ==='cpf'&&typeof proof.birth_date==='string'&&/^(19|20)\d{2}-\d{2}-\d{2}$/.test(proof.birth_date)){
      const s=proof.birth_date,y=Number(s.slice(0,4)),m=Number(s.slice(5,7)),d=Number(s.slice(8,10)),dt=new Date(Date.UTC(y,m-1,d))
      if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==m||dt.getUTCDate()!==d||dt>new Date())return reply(400,{error:'invalid_proof'})
      verifiedProof={birth_date:s}
    }else if(typ==='cnpj'&&typeof proof.cep==='string'&&/^\d{8}$/.test(proof.cep)){
      verifiedProof={cep:proof.cep}
    }else return reply(400,{error:'invalid_proof'})
   }
   const conn=await pg.unsafe("select api_base_url,granted_scopes from phoenix_one.integration_connections where provider='junior_management'")
   const endpoint=conn[0]?.api_base_url||''
   if(!Array.isArray(conn[0]?.granted_scopes)||!conn[0].granted_scopes.includes('identity:resolve'))return reply(200,{status:'unavailable'})
   if(!endpoint)return reply(200,{status:'unavailable'})
   let url
   try{
    url=new URL(endpoint)
    if(url.protocol!=='https:'||!(/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname))||url.username||url.password||url.search||url.hash||!/^\/functions\/v1\/phoenix-one-api\/v1\/?$/.test(url.pathname))return reply(200,{status:'unavailable'})
   }catch{return reply(200,{status:'unavailable'})}
   const stored=await pg.unsafe("select decrypted_secret from vault.decrypted_secrets where name='phoenix_one_junior_api_token' limit 1")
   const token=stored[0]?.decrypted_secret||''
   if(!token)return reply(200,{status:'unavailable'})
   const target=endpoint.replace(/\/+$/,'')+'/identity/resolve'
   let response
   try{
    response=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5500),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({conversation_id:conversationId,protocolo,document_type:typ,document:doc,purpose:'policies_and_installments',...(verifiedProof?{proof:verifiedProof}:{})})
    })
   }catch{return reply(200,{status:'unavailable'})}
   let junior
   try{const raw=await response.text();if(raw.length>128000)return reply(200,{status:'unavailable'});junior=JSON.parse(raw)}catch{return reply(200,{status:'unavailable'})}
   // Não revelar diferenças internas de documento: status apenas para fluxo do agente.
   const allowed=new Set(['verification_required','verification_failed','not_found','invalid_document','too_many_attempts','protocol_not_open','multiple_matches'])
   let status=junior?.status
   if(response.status===429)status='too_many_attempts'
   if(response.status===404)status='protocol_not_open'
   if(response.status===400&&!allowed.has(status))status='invalid_document'
   if(!response.ok&&![400,404,429].includes(response.status))return reply(200,{status:'unavailable'})
   if(status!=='verified'){
    if(!allowed.has(status))return reply(200,{status:'unavailable'})
    const proofMethod=junior?.verification?.method
    const method=['birth_date','cep','human'].includes(proofMethod)?proofMethod:null
    const remaining=junior?.verification?.attempts_left
    return reply(200,{status,verification:{
      method,attempts_left:Number.isInteger(remaining)&&remaining>=0&&remaining<=3?remaining:null
    }})
   }
   // Status verificado deve vir da API autenticada do Junior e estar ligado ao documento solicitado.
   // O backend da gestão assume a confirmação, aplica os limites e liga a verificação ao protocolo.
   if(junior.document_last4!==doc.slice(-4)||
     (junior.conversation_id&&junior.conversation_id!==conversationId)||
     (junior.protocolo&&junior.protocolo!==protocolo)||
     (junior.document_type&&junior.document_type!==typ)||
     (junior.verification&&junior.verification.status!=='verified'))
     return reply(200,{status:'verification_required',verification:{method:'human',attempts_left:0}})
   const policies=conn[0].granted_scopes.includes('policies:read')&&Array.isArray(junior.policies)?junior.policies.slice(0,12).map(p=>({
    numero:cleanString(p?.numero,60),ramo:cleanString(p?.ramo,60),seguradora:cleanString(p?.seguradora,90),fim_vigencia:cleanString(p?.fim_vigencia,30),linha:cleanString(p?.linha,60),
    premio_total:typeof p?.premio_total==='number'&&Number.isFinite(p.premio_total)&&p.premio_total>=0?p.premio_total:null,
    premio_mensal:typeof p?.premio_mensal==='number'&&Number.isFinite(p.premio_mensal)&&p.premio_mensal>=0?p.premio_mensal:null,
    capital_segurado:typeof p?.capital_segurado==='number'&&Number.isFinite(p.capital_segurado)&&p.capital_segurado>=0?p.capital_segurado:null,
    status:cleanString(p?.status,45),
    coberturas:Array.isArray(p?.coberturas)?p.coberturas.slice(0,30).map(c=>{
     if(typeof c==='string')return {nome:cleanString(c,140),capital_segurado:null,franquia:null}
     if(!c||typeof c!=='object'||Array.isArray(c))return null
     const validMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null
     return {nome:cleanString(c.nome,140),capital_segurado:validMoney(c.capital_segurado),franquia:validMoney(c.franquia)}
    }).filter(c=>c&&c.nome):[]
   })):[]
   const installments=conn[0].granted_scopes.includes('installments:read')&&Array.isArray(junior.installments)?junior.installments.slice(0,12).map(i=>({
    apolice:cleanString(i?.apolice,60),ramo:cleanString(i?.ramo,50),vencimento:cleanString(i?.vencimento,30),
    valor:typeof i?.valor==='number'&&Number.isFinite(i.valor)?i.valor:null,vencida:i?.vencida===true
   })):[]
   // Pendências são fornecidas exclusivamente pela API do Junior após verificação.
   // Nunca pesquisar documentos ou valores a partir do número do WhatsApp.
   const pending=conn[0].granted_scopes.includes('clients:read')&&Array.isArray(junior.pending)?junior.pending.slice(0,8).map(p=>({
    description:cleanString(p?.descricao??p?.description,200),
    status:cleanString(p?.situacao??p?.status,45),
    due_date:cleanString(p?.prazo??p?.due_date,30)
   })).filter(p=>p.description):[]
   return reply(200,{status:'verified',policies,installments,pending})
  }
  if(data.action==='event'){
   const v=data.event
   if(!v||!uuid(v.event_id)||!eventsAllowed.has(v.event_type)||!v.ticket||!uuid(v.ticket.conversation_id)||typeof v.ticket.id!=='string'||!/^\d{8}-\d{4}$/.test(v.ticket.id))return reply(400,{error:'invalid_event'})
   const category=cleanString(v.ticket.category,80).replace(/[^a-zA-Z0-9_.-]/g,'_')
   const department=cleanString(v.ticket.department,40).replace(/[^a-zA-Z0-9_.-]/g,'_')
   const status= v.event_type==='ticket.resolved.v1'?'resolved':v.event_type==='ticket.returned_to_agent.v1'?'with_agent':v.event_type==='ticket.assigned.v1'?'assigned':cleanString(v.ticket.status,30)||'queued'
   const staffId= v.event_type==='ticket.assigned.v1'&&v.ticket.assigned_to?.type==='user'&&typeof v.ticket.assigned_to.id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v.ticket.assigned_to.id)?v.ticket.assigned_to.id:null
   let duplicate=false,createdCandidate=false
   await pg.begin(async tx=>{
     const inserted=await tx.unsafe("insert into phoenix_one.integration_events(provider,external_event_id,event_type,processing_status) values('junior_management',$1,$2,'processing') on conflict(provider,external_event_id) do nothing returning id",[v.event_id,v.event_type])
     if(!inserted.length){duplicate=true;return}
     const ref=await tx.unsafe("insert into phoenix_one.external_ticket_refs(source_system,external_ticket_id,category,department,status,resolved_at,assigned_to_user_id) values('junior_management',$1,$2,$3,$4,$5::timestamptz,$6) on conflict(source_system,external_ticket_id) do update set category=excluded.category,department=excluded.department,status=excluded.status,resolved_at=excluded.resolved_at,assigned_to_user_id=excluded.assigned_to_user_id,seen_at=now() returning id",[v.ticket.id,category,department,status,status==='resolved'?new Date().toISOString():null,staffId])

     // Keep only non-sensitive, per-protocol orchestration metadata. Later events
     // must not be overwritten by delayed earlier signed webhook deliveries.
     const occurred=typeof v.occurred_at==='string'&&!Number.isNaN(Date.parse(v.occurred_at))?v.occurred_at:new Date().toISOString()
     const eventAgent=agentOk(v.ticket.agent)?v.ticket.agent:null
     await tx.unsafe("insert into phoenix_one.protocol_agent_state(source_system,external_ticket_id,conversation_id,last_agent,last_intent,stage,last_event_at,expires_at) values('junior_management',$1,$2::uuid,$3,'neutral',$4,$5::timestamptz,case when $4='resolved' then now()+interval '1 day' else now()+interval '7 days' end) on conflict(source_system,external_ticket_id) do update set conversation_id=excluded.conversation_id,last_agent=coalesce(excluded.last_agent,phoenix_one.protocol_agent_state.last_agent),stage=excluded.stage,last_event_at=excluded.last_event_at,updated_at=now(),expires_at=excluded.expires_at where phoenix_one.protocol_agent_state.last_event_at is null or excluded.last_event_at >= phoenix_one.protocol_agent_state.last_event_at",[v.ticket.id,v.ticket.conversation_id,eventAgent,['assigned','resolved','queued','reopened','with_agent'].includes(status)?status:'queued',occurred])
     if(status==='resolved'){
      const raw=cleanString(v.ticket.resolution_summary,4000)
      const summary=redact(raw).trim()
      if(summary.length>=15){
       const title='Avaliar procedimento: '+(category||department||'atendimento')
       const candidate=await tx.unsafe("insert into phoenix_one.learning_candidates(ticket_ref_id,proposed_title,sanitized_summary,proposed_procedure,risk_flags) values($1::uuid,$2,$3,$4,$5::jsonb) returning id",[ref[0].id,title,summary,summary,JSON.stringify(['requires_privacy_review','not_approved','external_ticket'])])
       const agent=agentOk(v.ticket.agent)?v.ticket.agent:'clara'
       await tx.unsafe("insert into phoenix_one.learning_agents(candidate_id,agent_id) values($1::uuid,$2) on conflict do nothing",[candidate[0].id,agent])
       createdCandidate=true
      }
     }
     await tx.unsafe("update phoenix_one.integration_events set processing_status='processed',processed_at=now() where provider='junior_management' and external_event_id=$1",[v.event_id])
   })
   return reply(200,{accepted:true,duplicate,learningReviewQueued:createdCandidate})
  }
  return reply(400,{error:'unknown_action'})
 }catch(e){console.error('phoenix-bridge',e?.code||e?.name||'runtime');return reply(503,{error:'bridge_unavailable'})}
})