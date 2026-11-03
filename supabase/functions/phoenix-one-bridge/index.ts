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
   // New contract is explicitly OFF until joint homologation.
   const v4=data.v4===true&&Deno.env.get('PHOENIX_ONE_V4_VERIFIED_CONTEXT')==='true'
   const ref=v4&&typeof data.verificationRef==='string'&&/^[a-f0-9]{48}$/i.test(data.verificationRef)?data.verificationRef:null
   if(!ref&&!((typ==='cpf'&&/^\d{11}$/.test(doc))||(typ==='cnpj'&&/^\d{14}$/.test(doc))))return reply(400,{error:'invalid_document_format'})
   if(ref&&(doc||data.proof))return reply(400,{error:'ambiguous_verification_request'})
   const allowedPurposes=['service','quote','assistance','policies_and_installments']
   const allowedProducts=['auto','moto','frota','residencial','empresarial','vida','ap','saude','odonto','vida_grupo','previdencia','viagem','pet','bike','fianca','garantia','rc','outros']
   const purpose=v4?data.purpose:'policies_and_installments'
   if(v4&&!allowedPurposes.includes(purpose))return reply(400,{error:'invalid_purpose'})
   const productCode=v4&&allowedProducts.includes(data.productCode)?data.productCode:null
   const policyNumber=v4&&typeof data.numero==='string'&&/^[\p{L}\p{N} .\/()-]{1,60}$/u.test(data.numero)?data.numero:null
   if(v4&&purpose==='quote'&&!productCode&&!policyNumber)return reply(400,{error:'product_filter_required'})

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
      body:JSON.stringify({conversation_id:conversationId,protocolo,
       ...(ref?{verification_ref:ref}:{document_type:typ,document:doc}),
       purpose,...(productCode?{product_code:productCode}:{}),...(policyNumber?{numero:policyNumber}:{}),
       ...(!ref&&verifiedProof?{proof:verifiedProof}:{})})
    })
   }catch{return reply(200,{status:'unavailable'})}
   let junior
   try{const raw=await response.text();if(raw.length>128000)return reply(200,{status:'unavailable'});junior=JSON.parse(raw)}catch{return reply(200,{status:'unavailable'})}
   // Não revelar diferenças internas de documento: status apenas para fluxo do agente.
   const allowed=new Set(['verification_required','verification_expired','verification_failed','not_found','invalid_document','too_many_attempts','protocol_not_open','multiple_matches'])
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
   const verifiedBinding=ref?
     // Token replay is accepted ONLY for the exact conversation and protocol,
     // with a future expiration and a verified status from Junior.
     junior.conversation_id===conversationId&&junior.protocolo===protocolo&&
     typeof junior.expires_at==='string'&&Number.isFinite(Date.parse(junior.expires_at))&&Date.parse(junior.expires_at)>Date.now()&&
     (!junior.verification||junior.verification.status==='verified'):
     junior.document_last4===doc.slice(-4)&&
     (!junior.conversation_id||junior.conversation_id===conversationId)&&
     (!junior.protocolo||junior.protocolo===protocolo)&&
     (!junior.document_type||junior.document_type===typ)&&
     (!junior.verification||junior.verification.status==='verified')
   if(!verifiedBinding)return reply(200,{status:'verification_required',verification:{method:'human',attempts_left:0}})
   const scopes=v4&&Array.isArray(junior.field_scopes)?junior.field_scopes.filter(x=>typeof x==='string'&&x.length<=70).slice(0,40):[]
   const canProfile=scopes.includes('profile.basic')||scopes.includes('verified_profile')||scopes.includes('profile:read')
   // Junior's actual OpenAPI grants product-specific scopes. In phase 1,
   // release only Auto risk data after risk.auto.read, never by a generic flag.
   const canAutoRisk=scopes.includes('risk.auto.read')||scopes.includes('risk_summary')||scopes.includes('risk:read')
   const safeName=x=>typeof x==='string'&&/^[\p{L}\p{M}][\p{L}\p{M} .'’\\-]{0,69}$/u.test(x.trim())?x.trim():null
   const profile=canProfile&&junior.verified_profile?.relacao_com_contrato==='titular'&&safeName(junior.verified_profile?.nome_tratamento)?{
    nome_tratamento:safeName(junior.verified_profile.nome_tratamento),
    tipo_pessoa:['pf','pj','PF','PJ'].includes(junior.verified_profile.tipo_pessoa)?junior.verified_profile.tipo_pessoa.toLowerCase():null,
    perfil_atualizado_em:typeof junior.verified_profile.perfil_atualizado_em==='string'&&Number.isFinite(Date.parse(junior.verified_profile.perfil_atualizado_em))?junior.verified_profile.perfil_atualizado_em:null,
    relacao_com_contrato:'titular'
   }:null
   const label=x=>typeof x==='string'&&/^[\p{L}\p{M}\p{N} .\/()\\-]{1,80}$/u.test(x.trim())?x.trim():null
   const modelYear=x=>Number.isInteger(x)&&x>=1970&&x<=new Date().getFullYear()+2?x:null
   const safeVehicle=raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
    const v=raw.vehicle
    if(!v||typeof v!=='object'||Array.isArray(v))return null
    return {vehicle:{
      marca:label(v.marca),modelo:label(v.modelo),marca_modelo:label(v.marca_modelo),
      versao:label(v.versao),ano_modelo:modelYear(v.ano_modelo),
      ano_fabricacao:modelYear(v.ano_fabricacao),zero_km:typeof v.zero_km==='boolean'?v.zero_km:null
    }}
   }
   const validV4=v4&&typeof junior.verified_at==='string'&&Number.isFinite(Date.parse(junior.verified_at))&&
      typeof junior.expires_at==='string'&&Date.parse(junior.expires_at)>Date.now()&&Array.isArray(junior.field_scopes)
   if(v4&&!validV4)return reply(200,{status:'unavailable'})

   const rawPolicies=Array.isArray(junior.policies)?junior.policies:[]
   // Defense in depth: quote never leaks a full portfolio if the
   // management system accidentally ignores its product_code filter.
   const limitedPolicies=v4&&purpose==='quote'?
    rawPolicies.filter(p=>productCode?p?.product_code===productCode:p?.numero===policyNumber):rawPolicies
   const policies=conn[0].granted_scopes.includes('policies:read')&&(!v4||scopes.includes('policies.read'))?limitedPolicies.slice(0,12).map(p=>({
    numero:cleanString(p?.numero,60),ramo:cleanString(p?.ramo,60),seguradora:cleanString(p?.seguradora,90),fim_vigencia:cleanString(p?.fim_vigencia,30),linha:cleanString(p?.linha,60),
    premio_total:typeof p?.premio_total==='number'&&Number.isFinite(p.premio_total)&&p.premio_total>=0?p.premio_total:null,
    premio_mensal:typeof p?.premio_mensal==='number'&&Number.isFinite(p.premio_mensal)&&p.premio_mensal>=0?p.premio_mensal:null,
    capital_segurado:typeof p?.capital_segurado==='number'&&Number.isFinite(p.capital_segurado)&&p.capital_segurado>=0?p.capital_segurado:null,
    status:cleanString(p?.status,45),
    // Campos opcionais de veículo somente após identity/resolve=verified.
    // Jamais encaminhar placa, Renavam, chassi ou identificação de terceiros.
    // Preserve the EXACT V1 response when V4 is not explicitly enabled.
    ...(v4?{
     product_code:allowedProducts.includes(p?.product_code)?p.product_code:null,
     risk_summary:canAutoRisk&&p?.product_code==='auto'?safeVehicle(p?.risk_summary):null
    }:{}),
    veiculo:(!v4||canAutoRisk)&&p?.veiculo&&typeof p.veiculo==='object'&&!Array.isArray(p.veiculo)?{
     marca:cleanString(p.veiculo.marca,60),
     modelo:cleanString(p.veiculo.modelo,60),
     ano_modelo:(Number.isInteger(p.veiculo.ano_modelo)&&p.veiculo.ano_modelo>=1970&&p.veiculo.ano_modelo<=2100)?p.veiculo.ano_modelo:null,
     ano_fabricacao:(Number.isInteger(p.veiculo.ano_fabricacao)&&p.veiculo.ano_fabricacao>=1970&&p.veiculo.ano_fabricacao<=2100)?p.veiculo.ano_fabricacao:null
    }:null,
    coberturas:Array.isArray(p?.coberturas)?p.coberturas.slice(0,30).map(c=>{
     if(typeof c==='string')return {nome:cleanString(c,140),capital_segurado:null,franquia:null}
     if(!c||typeof c!=='object'||Array.isArray(c))return null
     const validMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null
     return {nome:cleanString(c.nome,140),capital_segurado:validMoney(c.capital_segurado),franquia:validMoney(c.franquia)}
    }).filter(c=>c&&c.nome):[]
   })):[]
   const installments=purpose!=='quote'&&conn[0].granted_scopes.includes('installments:read')&&(!v4||scopes.includes('installments.read'))&&Array.isArray(junior.installments)?junior.installments.slice(0,12).map(i=>({
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
   // V4 is opt-in; never send the opaque ref to an LLM or WhatsApp.
   const v4Context=v4?{
    verified_profile:profile,
    verification_ref:typeof junior.verification_ref==='string'&&/^[a-f0-9]{48}$/i.test(junior.verification_ref)?junior.verification_ref:null,
    verified_at:junior.verified_at,
    expires_at:junior.expires_at,
    field_scopes:scopes,
    data_freshness:junior.data_freshness&&typeof junior.data_freshness==='object'&&!Array.isArray(junior.data_freshness)?
     Object.fromEntries(Object.entries(junior.data_freshness).filter(([k,v])=>
      ['profile','policies','risk_summary','benefits'].includes(k)&&v&&typeof v==='object'&&!Array.isArray(v)&&
      v.source==='cadastro_gestao'&&typeof v.updated_at==='string'&&Number.isFinite(Date.parse(v.updated_at)))
      .slice(0,4).map(([k,v])=>[k,{source:'cadastro_gestao',updated_at:v.updated_at}])):null
   }:{}
   return reply(200,{status:'verified',policies,installments,pending,...v4Context})
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