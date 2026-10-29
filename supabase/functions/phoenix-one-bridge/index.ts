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
Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'})
 const rawAuth=request.headers.get('authorization')||''
 const token=rawAuth.startsWith('Bearer ')?rawAuth.slice(7):''
 try{
  if(!await authenticate(token))return reply(401,{error:'bridge_unauthorized'})
  const data=await request.json().catch(()=>null)
  if(!data||typeof data!=='object')return reply(400,{error:'invalid_json'})
  if(data.action==='prompt_only'){
   const agent=data.agent
   if(!agentOk(agent))return reply(400,{error:'invalid_agent'})
   const active=await pg.unsafe("select v.version,v.system_prompt from phoenix_one.agent_versions v where v.agent_id=$1 and v.active=true limit 1",[agent])
   if(!active.length)return reply(409,{error:'agent_prompt_not_available'})
   return reply(200,{agent,version:active[0].version,prompt:active[0].system_prompt,sources:[]})
  }
  if(data.action==='context'){
   const agent=data.agent,query=cleanString(data.query,850)
   if(!agentOk(agent)||!query.trim())return reply(400,{error:'invalid_context'})
   const agents=await pg.unsafe("select v.version,v.system_prompt from phoenix_one.agent_versions v where v.agent_id=$1 and v.active=true limit 1",[agent])
   if(!agents.length)return reply(409,{error:'agent_prompt_not_available'})
   const matches=await pg.unsafe("select d.title as source,c.chunk_index,c.content,ts_rank_cd(to_tsvector('portuguese',c.content),websearch_to_tsquery('portuguese',$1)) as rank from phoenix_one.knowledge_chunks c join phoenix_one.knowledge_documents d on d.id=c.document_id join phoenix_one.document_agents da on da.document_id=d.id and da.agent_id=$2 where d.status='published' and d.sensitivity in ('internal','public') and (d.valid_until is null or d.valid_until >= current_date) and to_tsvector('portuguese',c.content) @@ websearch_to_tsquery('portuguese',$1) order by rank desc limit 6",[query,agent])
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
   try{const raw=await response.text();if(raw.length>32000)return reply(200,{status:'unavailable'});junior=JSON.parse(raw)}catch{return reply(200,{status:'unavailable'})}
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
   const policies=Array.isArray(junior.policies)?junior.policies.slice(0,12).map(p=>({
    numero:cleanString(p?.numero,60),ramo:cleanString(p?.ramo,60),seguradora:cleanString(p?.seguradora,90),fim_vigencia:cleanString(p?.fim_vigencia,30),linha:cleanString(p?.linha,60)
   })):[]
   const installments=Array.isArray(junior.installments)?junior.installments.slice(0,12).map(i=>({
    apolice:cleanString(i?.apolice,60),ramo:cleanString(i?.ramo,50),vencimento:cleanString(i?.vencimento,30),
    valor:typeof i?.valor==='number'&&Number.isFinite(i.valor)?i.valor:null,vencida:i?.vencida===true
   })):[]
   return reply(200,{status:'verified',policies,installments})
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