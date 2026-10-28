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
  if(data.action==='context'){
   const agent=data.agent,query=cleanString(data.query,850)
   if(!agentOk(agent)||!query.trim())return reply(400,{error:'invalid_context'})
   const agents=await pg.unsafe("select v.version,v.system_prompt from phoenix_one.agent_versions v where v.agent_id=$1 and v.active=true limit 1",[agent])
   if(!agents.length)return reply(409,{error:'agent_prompt_not_available'})
   const matches=await pg.unsafe("select d.title as source,c.chunk_index,c.content,ts_rank_cd(to_tsvector('portuguese',c.content),websearch_to_tsquery('portuguese',$1)) as rank from phoenix_one.knowledge_chunks c join phoenix_one.knowledge_documents d on d.id=c.document_id join phoenix_one.document_agents da on da.document_id=d.id and da.agent_id=$2 where d.status='published' and d.sensitivity in ('internal','public') and (d.valid_until is null or d.valid_until >= current_date) and to_tsvector('portuguese',c.content) @@ websearch_to_tsquery('portuguese',$1) order by rank desc limit 6",[query,agent])
   return reply(200,{agent,version:agents[0].version,prompt:agents[0].system_prompt,sources:matches.map(x=>({title:x.source,chunk_index:x.chunk_index,content:x.content.slice(0,1300)}))})
  }
  if(data.action==='junior_context'){
   const conversationId=data.conversationId
   if(!uuid(conversationId))return reply(400,{error:'invalid_conversation_id'})
   const conn=await pg.unsafe("select api_base_url from phoenix_one.integration_connections where provider='junior_management'")
   const endpoint=conn[0]?.api_base_url||''
   if(!endpoint)return reply(200,{available:false})
   let url
   try{
    url=new URL(endpoint)
    if(url.protocol!=='https:'||!(/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname))||url.username||url.password||url.search||url.hash||!/^\/functions\/v1\/phoenix-one-api\/v1\/?$/.test(url.pathname))return reply(200,{available:false})
   }catch{return reply(200,{available:false})}
   const sec=await pg.unsafe("select decrypted_secret from vault.decrypted_secrets where name='phoenix_one_junior_api_token' limit 1")
   const bearer=sec[0]?.decrypted_secret||''
   if(!bearer)return reply(200,{available:false})
   let response
   try{
    response=await fetch(endpoint.replace(/\/+$/,'')+'/conversations/'+encodeURIComponent(conversationId)+'/context',{
     method:'GET',redirect:'error',signal:AbortSignal.timeout(4500),headers:{Authorization:'Bearer '+bearer,Accept:'application/json'}
    })
   }catch{return reply(200,{available:false})}
   if(!response.ok)return reply(200,{available:false})
   let body
   try{const raw=await response.text();if(raw.length>32000)return reply(200,{available:false});body=JSON.parse(raw)}catch{return reply(200,{available:false})}
   const policies=Array.isArray(body.policies)?body.policies.slice(0,8).map(p=>({
     numero:cleanString(p?.numero,60),ramo:cleanString(p?.ramo,60),seguradora:cleanString(p?.seguradora,90),fim_vigencia:cleanString(p?.fim_vigencia,30),linha:cleanString(p?.linha,60)
   })):[]
   const installments=Array.isArray(body.installments)?body.installments.slice(0,12).map(i=>({
     apolice:cleanString(i?.apolice,60),ramo:cleanString(i?.ramo,50),parcela:i?.parcela,vencimento:cleanString(i?.vencimento,30),valor:i?.valor,vencida:!!i?.vencida
   })):[]
   return reply(200,{available:true,policies,installments})
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