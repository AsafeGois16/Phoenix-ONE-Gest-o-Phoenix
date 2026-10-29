import {createClient} from 'npm:@supabase/supabase-js@2.49.10'
import postgres from 'npm:postgres@3.4.5'
const url=Deno.env.get('SUPABASE_URL')||''
const anon=Deno.env.get('SUPABASE_ANON_KEY')||''
const dbUrl=Deno.env.get('SUPABASE_DB_URL')||''
const pg=postgres(dbUrl,{max:2,prepare:false,connect_timeout:8,idle_timeout:12})
const origin='https://phoenix-one-ai.vercel.app'
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}
const out=(status,body)=>new Response(JSON.stringify(body),{status,headers})
const err=(code,message)=>out(code,{error:message})
const validAgent=a=>['clara','murilo'].includes(a)
const isUid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const clean=s=>String(s||'').trim()
const stringUnder=(s,len)=>typeof s==='string'&&s.length<=len
const can=(role,cap)=>{
 if(role==='owner'||role==='admin')return true
 if(role==='editor')return ['agents','documents','learning:create'].includes(cap)
 if(role==='reviewer')return ['documents:review','learning:review','learning:create'].includes(cap)
 return false
}
function chunks(text,max=1250,overlap=130){
 const t=text.replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').trim()
 const items=[]
 for(let i=0;i<t.length;i+=max-overlap){let part=t.slice(i,i+max).trim();if(part)items.push(part);if(i+max>=t.length)break}
 return items
}
const anonymize=s=>s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[EMAIL]') .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,'[CPF]') .replace(/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g,'[CONTATO]')
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return req.headers.get('origin')===origin?new Response(null,{status:204,headers}):err(403,'origin_not_allowed')
 if(req.method!=='POST')return err(405,'method_not_allowed')
 if(req.headers.get('origin')!==origin)return err(403,'origin_not_allowed')
 const tok=(req.headers.get('authorization')||'').replace(/^Bearer /,'')
 if(tok.length<40)return err(401,'unauthorized')
 try{
  const supa=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authErr}=await supa.auth.getUser(tok)
  if(authErr||!user)return err(401,'invalid_session')
  const auth=await pg.unsafe('select role,permissions from phoenix_one.admin_users where user_id=$1::uuid',[user.id])
  if(!auth.length)return err(403,'not_phoenix_one_admin')
  const role=auth[0].role
  const isAdmin=role==='owner'||role==='admin'
  const body=await req.json().catch(()=>({}))
  const action=body.action
  if(action==='bootstrap'){
    const [agents,docs,learning,stats]=await Promise.all([
      pg.unsafe('select a.id,a.name,a.role,a.status,v.id as prompt_id,v.version,v.system_prompt,v.tone,v.policy,v.created_at as prompt_date from phoenix_one.agents a left join phoenix_one.agent_versions v on v.agent_id=a.id and v.active=true order by a.id'),
      pg.unsafe("select d.id,d.title,d.source_kind,d.category,d.status,d.sensitivity,d.valid_until,d.version,d.storage_path,d.created_at,d.reviewed_at,coalesce(array_agg(da.agent_id) filter(where da.agent_id is not null),'{}') as agents,coalesce((select count(*) from phoenix_one.knowledge_chunks kc where kc.document_id=d.id),0) as chunks from phoenix_one.knowledge_documents d left join phoenix_one.document_agents da on d.id=da.document_id where ($1::boolean or d.sensitivity<>'restricted') group by d.id order by d.created_at desc limit 200",[isAdmin]),
      pg.unsafe("select c.id,c.proposed_title,c.sanitized_summary,c.proposed_procedure,c.status,c.created_at,c.reviewed_at,c.rejection_reason,t.external_ticket_id,t.category,coalesce(array_agg(a.agent_id) filter(where a.agent_id is not null),'{}') as agents from phoenix_one.learning_candidates c join phoenix_one.external_ticket_refs t on t.id=c.ticket_ref_id left join phoenix_one.learning_agents a on a.candidate_id=c.id group by c.id,t.external_ticket_id,t.category order by c.created_at desc limit 150"),
      pg.unsafe("select (select count(*) from phoenix_one.knowledge_documents) as documents,(select count(*) from phoenix_one.knowledge_documents where status='published') as published,(select count(*) from phoenix_one.knowledge_chunks) as chunks,(select count(*) from phoenix_one.learning_candidates where status='pending') as pending,(select count(*) from phoenix_one.learning_candidates where status='approved') as approved")
    ])
    return out(200,{role,permissions:auth[0].permissions,agents,documents:docs,learning,stats:stats[0],management:'junior_only',rag:'text_retrieval',mode:'persistent'})
  }
  if(action==='save_agent'){
    if(!can(role,'agents'))return err(403,'forbidden')
    const agent=body.agent
    const prompt=clean(body.prompt)
    const tone=clean(body.tone).slice(0,400)
    if(!validAgent(agent)||prompt.length<80||prompt.length>65000||!stringUnder(body.name||'',150)||!stringUnder(body.role||'',200))return err(400,'invalid_agent_data')
    let version=0
    await pg.begin(async tx=>{
      const prev=await tx.unsafe("select coalesce(max(version),0) as last from phoenix_one.agent_versions where agent_id=$1",[agent])
      version=Number(prev[0].last)+1
      await tx.unsafe("update phoenix_one.agent_versions set active=false where agent_id=$1",[agent])
      await tx.unsafe("insert into phoenix_one.agent_versions(agent_id,version,system_prompt,tone,policy,active) values($1,$2,$3,$4,$5::jsonb,true)",[agent,version,prompt,tone,JSON.stringify({source:'user_editor',management:'junior_only',review:'manual'})])
      await tx.unsafe('update phoenix_one.agents set name=$2,role=$3,status=$4,updated_at=now() where id=$1',[agent,clean(body.name)||agent,clean(body.role)||'', 'testing'])
      await tx.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id,metadata) values($1::uuid,'prompt_version_published','agent',$2,$3::jsonb)",[user.id,agent,JSON.stringify({version})])
    })
    return out(200,{saved:true,version})
  }
  if(action==='agent_versions'){
    if(!validAgent(body.agent))return err(400,'unknown_agent')
    const rows=await pg.unsafe('select version,active,created_at,left(system_prompt,160) as excerpt from phoenix_one.agent_versions where agent_id=$1 order by version desc limit 30',[body.agent])
    return out(200,{versions:rows})
  }
  if(action==='create_document'){
    if(!can(role,'documents'))return err(403,'forbidden')
    const title=clean(body.title),text=clean(body.content),category=clean(body.category)||'Geral'
    const audience=Array.isArray(body.agents)?[...new Set(body.agents)]:[]
    if(body.sensitivity==='restricted'&&!isAdmin)return err(403,'restricted_document_admin_only')
    if(!title||title.length>180||text.length<30||text.length>150000||category.length>100||(body.sensitivity!=='restricted'&&!audience.length)||audience.some(a=>!validAgent(a))||!['public','internal','restricted'].includes(body.sensitivity))return err(400,'invalid_document')
    const slice=chunks(text);if(slice.length>160)return err(400,'document_too_large')
    let doc
    await pg.begin(async tx=>{
      const res=await tx.unsafe("insert into phoenix_one.knowledge_documents(title,source_kind,category,status,sensitivity) values($1,'text',$2,'review',$3) returning id",[title,category,body.sensitivity])
      doc=res[0].id
      for(const a of (body.sensitivity==='restricted'?[]:audience))await tx.unsafe('insert into phoenix_one.document_agents(document_id,agent_id) values($1::uuid,$2)',[doc,a])
      for(const [i,part] of slice.entries())await tx.unsafe('insert into phoenix_one.knowledge_chunks(document_id,chunk_index,content,token_count) values($1::uuid,$2,$3,$4)',[doc,i,part,Math.ceil(part.length/4)])
      await tx.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id,metadata) values($1::uuid,'document_added','knowledge',$2,$3::jsonb)",[user.id,doc,JSON.stringify({title,agents:audience})])
    })
    return out(200,{created:true,id:doc,chunks:slice.length,status:'review'})
  }
  if(action==='document_detail'){
    if(!can(role,'documents')&&!can(role,'documents:review'))return err(403,'forbidden')
    if(!isUid(body.id))return err(400,'invalid_document_id')
    const docs=await pg.unsafe('select id,title,status,category,sensitivity,version from phoenix_one.knowledge_documents where id=$1::uuid',[body.id])
    if(!docs.length)return err(404,'document_not_found')
    if(docs[0].sensitivity==='restricted'&&!isAdmin)return err(403,'restricted_document_admin_only')
    const parts=await pg.unsafe('select chunk_index,content from phoenix_one.knowledge_chunks where document_id=$1::uuid order by chunk_index limit 250',[body.id])
    return out(200,{document:docs[0],parts})
  }
  if(action==='update_document'){
    if(!can(role,'documents'))return err(403,'forbidden')
    if(!isUid(body.id)||!['public','internal','restricted'].includes(body.sensitivity)||!stringUnder(body.category,100)||!Array.isArray(body.agents)||(body.sensitivity!=='restricted'&&!body.agents.length)||body.agents.some(a=>!validAgent(a)))return err(400,'invalid_document')
    const existing=await pg.unsafe('select sensitivity from phoenix_one.knowledge_documents where id=$1::uuid',[body.id])
    if(!existing.length)return err(404,'document_not_found')
    if(!isAdmin&&(existing[0].sensitivity==='restricted'||body.sensitivity==='restricted'))return err(403,'restricted_document_admin_only')
    await pg.begin(async tx=>{
      await tx.unsafe("update phoenix_one.knowledge_documents set category=$2,sensitivity=$3,status='review',version=version+1,updated_at=now() where id=$1::uuid",[body.id,body.category,body.sensitivity])
      await tx.unsafe('delete from phoenix_one.document_agents where document_id=$1::uuid',[body.id])
      for(const a of (body.sensitivity==='restricted'?[]:[...new Set(body.agents)]))await tx.unsafe('insert into phoenix_one.document_agents(document_id,agent_id) values($1::uuid,$2)',[body.id,a])
      await tx.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id) values($1::uuid,'document_permissions_changed','knowledge',$2)",[user.id,body.id])
    })
    return out(200,{saved:true,status:'review'})
  }
  if(action==='publish_document'){
    if(!can(role,'documents:review'))return err(403,'reviewer_required')
    if(!isUid(body.id)||!['published','review','archived'].includes(body.status))return err(400,'invalid_publish')
    const current=await pg.unsafe('select sensitivity from phoenix_one.knowledge_documents where id=$1::uuid',[body.id])
    if(!current.length)return err(404,'document_not_found')
    if(current[0].sensitivity==='restricted'&&!isAdmin)return err(403,'restricted_document_admin_only')
    await pg.unsafe('update phoenix_one.knowledge_documents set status=$2,reviewer_id=$3::uuid,reviewed_at=now(),updated_at=now() where id=$1::uuid',[body.id,body.status,user.id])
    await pg.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id,metadata) values($1::uuid,'document_reviewed','knowledge',$2,$3::jsonb)",[user.id,body.id,JSON.stringify({status:body.status})])
    return out(200,{saved:true,status:body.status})
  }
  if(action==='search'){
    if(!validAgent(body.agent)||typeof body.query!=='string'||!body.query.trim()||body.query.length>800)return err(400,'invalid_query')
    // Pesquisa natural primeiro. Perguntas longas podem exigir TODAS as palavras,
    // por isso fazemos um segundo passe de termos relevantes quando não há fontes.
    // Nunca relaxar os filtros de documento publicado, sensibilidade ou permissão por agente.
    let result=await pg.unsafe("select d.id as document_id,d.title as source,c.chunk_index,c.content,ts_rank_cd(to_tsvector('portuguese',c.content),websearch_to_tsquery('portuguese',$1)) as rank from phoenix_one.knowledge_chunks c join phoenix_one.knowledge_documents d on d.id=c.document_id join phoenix_one.document_agents da on da.document_id=d.id and da.agent_id=$2 where d.status='published' and d.sensitivity in ('public','internal') and (d.valid_until is null or d.valid_until>=current_date) and to_tsvector('portuguese',c.content) @@ websearch_to_tsquery('portuguese',$1) order by rank desc limit 6",[body.query,body.agent])
    if(!result.length){
      result=await pg.unsafe("with terms as (select replace(plainto_tsquery('portuguese',$1)::text,' & ',' | ')::tsquery as q) select d.id as document_id,d.title as source,c.chunk_index,c.content,ts_rank_cd(to_tsvector('portuguese',c.content),terms.q) + case when d.title ilike '%Backoffice%' and $1 ~* '(exclus|inclus|moviment|dependen|beneficiar|junior|backoffice)' then 0.5 else 0 end as rank from phoenix_one.knowledge_chunks c join phoenix_one.knowledge_documents d on d.id=c.document_id join phoenix_one.document_agents da on da.document_id=d.id and da.agent_id=$2 cross join terms where d.status='published' and d.sensitivity in ('public','internal') and (d.valid_until is null or d.valid_until>=current_date) and to_tsvector('portuguese',c.content) @@ terms.q order by rank desc limit 6",[body.query,body.agent])
    }
    return out(200,{matches:result,method:'PostgreSQL FTS + ACL',vectorIndexed:false})
  }
  if(action==='create_learning'){
    if(!can(role,'learning:create'))return err(403,'forbidden')
    const ticket=clean(body.ticket),title=clean(body.title),summary=clean(body.summary),procedure=clean(body.procedure),agents=Array.isArray(body.agents)?[...new Set(body.agents)]:[]
    if(ticket.length<2||ticket.length>100||title.length<5||title.length>180||summary.length<30||summary.length>6000||procedure.length<40||procedure.length>13000||!agents.length||agents.some(a=>!validAgent(a)))return err(400,'invalid_learning')
    const safeSummary=anonymize(summary),safeProcedure=anonymize(procedure)
    let id
    await pg.begin(async tx=>{
      await tx.unsafe("insert into phoenix_one.external_ticket_refs(source_system,external_ticket_id,status) values('junior_management',$1,'resolved') on conflict(source_system,external_ticket_id) do update set seen_at=now()",[ticket])
      const ref=await tx.unsafe("select id from phoenix_one.external_ticket_refs where source_system='junior_management' and external_ticket_id=$1",[ticket])
      const row=await tx.unsafe("insert into phoenix_one.learning_candidates(ticket_ref_id,proposed_title,sanitized_summary,proposed_procedure,risk_flags) values($1::uuid,$2,$3,$4,$5::jsonb) returning id",[ref[0].id,title,safeSummary,safeProcedure,JSON.stringify(['pending_privacy_review'])])
      id=row[0].id
      for(const a of agents)await tx.unsafe('insert into phoenix_one.learning_agents(candidate_id,agent_id) values($1::uuid,$2)',[id,a])
      await tx.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id) values($1::uuid,'learning_proposed','learning',$2)",[user.id,id])
    })
    return out(200,{created:true,id,status:'pending'})
  }
  if(action==='review_learning'){
    if(!can(role,'learning:review'))return err(403,'reviewer_required')
    if(!isUid(body.id)||!['approved','rejected'].includes(body.decision))return err(400,'invalid_review')
    let published=null
    await pg.begin(async tx=>{
      const current=await tx.unsafe("select id,proposed_title,proposed_procedure,status from phoenix_one.learning_candidates where id=$1::uuid for update",[body.id])
      if(!current.length||current[0].status!=='pending')throw Error('already_reviewed')
      if(body.decision==='approved'){
       const agents=await tx.unsafe('select agent_id from phoenix_one.learning_agents where candidate_id=$1::uuid',[body.id])
       const doc=await tx.unsafe("insert into phoenix_one.knowledge_documents(title,source_kind,category,status,sensitivity,reviewer_id,reviewed_at) values($1,'ticket_learning','Aprendizado supervisionado','published','internal',$2::uuid,now()) returning id",[current[0].proposed_title,user.id])
       published=doc[0].id
       for(const a of agents)await tx.unsafe('insert into phoenix_one.document_agents(document_id,agent_id) values($1::uuid,$2)',[published,a.agent_id])
       const contents=chunks(current[0].proposed_procedure)
       for(let j=0;j<contents.length;j++)await tx.unsafe('insert into phoenix_one.knowledge_chunks(document_id,chunk_index,content) values($1::uuid,$2,$3)',[published,j,contents[j]])
      }
      await tx.unsafe('update phoenix_one.learning_candidates set status=$2,reviewed_by=$3::uuid,reviewed_at=now(),published_document_id=$4::uuid where id=$1::uuid',[body.id,body.decision,user.id,published])
      await tx.unsafe("insert into phoenix_one.audit_events(actor_id,action,entity_kind,entity_id,metadata) values($1::uuid,'learning_reviewed','learning',$2,$3::jsonb)",[user.id,body.id,JSON.stringify({decision:body.decision,published})])
    })
    return out(200,{reviewed:true,decision:body.decision,documentId:published})
  }
  return err(400,'invalid_action')
 }catch(e){console.error('phoenix-core:',e?.code||e?.name||'unknown');return err(500,e?.message==='already_reviewed'?'already_reviewed':'operation_failed')}
})
