import {createClient} from 'npm:@supabase/supabase-js@2.49.10'
import postgres from 'npm:postgres@3.4.5'

const ROOT='https://phoenix-one-ai.vercel.app'
const H={'Access-Control-Allow-Origin':ROOT,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'}
const URL=Deno.env.get('SUPABASE_URL')||''
const ANON=Deno.env.get('SUPABASE_ANON_KEY')||''
const DB=Deno.env.get('SUPABASE_DB_URL')||''
const pg=postgres(DB,{max:2,prepare:false,connect_timeout:8,idle_timeout:12})
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const formats=/^(mp4|webm|mov|m4a|mp3|wav)$/
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:H})
const err=(status,reason)=>response(status,{error:reason})
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return request.headers.get('origin')===ROOT?new Response(null,{status:204,headers:H}):err(403,'origin_not_allowed')
 if(request.method!=='POST')return err(405,'method_not_allowed')
 if(request.headers.get('origin')!==ROOT)return err(403,'origin_not_allowed')
 if(!DB||!URL||!ANON)return err(503,'service_unavailable')
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'')
 if(token.length<40)return err(401,'unauthorized')
 try{
  const client=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await client.auth.getUser(token)
  if(authError||!user||!uid.test(user.id))return err(401,'unauthorized')
  const roles=await pg.unsafe('select role from phoenix_one.admin_users where user_id=$1::uuid',[user.id])
  if(!roles.length||!['owner','admin','editor'].includes(roles[0].role))return err(403,'forbidden')
  const body=await request.json().catch(()=>null)
  if(!body||typeof body!=='object')return err(400,'invalid_request')
  const action=body.action
  if(action==='enqueue'){
   if(body.consent!==true)return err(400,'consent_required')
   const path=body.path
   if(typeof path!=='string'||path.length>140)return err(400,'invalid_media_path')
   const match=path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(mp4|webm|mov|m4a|mp3|wav)$/i)
   if(!match||!uid.test(match[1])||!uid.test(match[2])||match[1].toLowerCase()!==user.id.toLowerCase()||!formats.test(match[3].toLowerCase()))return err(400,'invalid_media_path')
   const name=body.name
   if(typeof name!=='string'||name.length>180||!name.trim()||!/\.(mp4|webm|mov|m4a|mp3|wav)$/i.test(name))return err(400,'invalid_media_name')
   const language=['auto','pt'].includes(body.language)?body.language:'auto'
   const objects=await pg.unsafe("select (metadata->>'size')::bigint as bytes from storage.objects where bucket_id='phoenix-hub-large-media-temp' and name=$1 limit 1",[path])
   const bytes=Number(objects[0]?.bytes)
   if(!Number.isSafeInteger(bytes)||bytes<1000||bytes>500000000)return err(404,'uploaded_media_not_found')
   const limits=await pg.unsafe("select (select count(*) from phoenix_one.large_media_jobs where owner_id=$1::uuid and status in ('uploaded','extracting','chunking','transcribing','assembling')) as active,(select count(*) from phoenix_one.large_media_jobs where owner_id=$1::uuid and created_at>now()-interval '24 hours') as daily",[user.id])
   if(Number(limits[0].active)>=2||Number(limits[0].daily)>=10)return err(429,'queue_limit_reached')
   const created=await pg.unsafe("insert into phoenix_one.large_media_jobs(owner_id,storage_path,original_name,bytes,language,consent_at,status) values($1::uuid,$2,$3,$4,$5,now(),'uploaded') on conflict(owner_id,storage_path) do nothing returning id,status",[user.id,path,name.trim(),bytes,language])
   if(!created.length)return err(409,'media_already_queued')
   return response(201,{jobId:created[0].id,status:'uploaded',bytes,queued:true,published:false})
  }
  if(action==='status'||action==='cancel'){
   if(typeof body.jobId!=='string'||!uid.test(body.jobId))return err(400,'invalid_job_id')
   if(action==='cancel'){
    const cancel=await pg.unsafe("update phoenix_one.large_media_jobs set status=case when status='uploaded' then 'cancelled' else 'cancel_requested' end,updated_at=now() where id=$1::uuid and owner_id=$2::uuid and status in ('uploaded','extracting','chunking','transcribing','assembling') returning id,status",[body.jobId,user.id])
    if(!cancel.length)return err(409,'job_not_cancellable')
    return response(200,{jobId:cancel[0].id,status:cancel[0].status})
   }
   const rows=await pg.unsafe("select id,status,stage_completed,stage_total,error_code,case when status='review_ready' then transcript else null end as transcript,created_at,updated_at,expires_at from phoenix_one.large_media_jobs where id=$1::uuid and owner_id=$2::uuid",[body.jobId,user.id])
   if(!rows.length)return err(404,'job_not_found')
   const row=rows[0]
   return response(200,{jobId:row.id,status:row.status,completed:row.stage_completed,total:row.stage_total,error:row.error_code||null,text:row.transcript||null,reviewRequired:true,published:false,createdAt:row.created_at,updatedAt:row.updated_at,expiresAt:row.expires_at})
  }
  if(action==='list'){
   const rows=await pg.unsafe("select id,status,stage_completed,stage_total,created_at,updated_at from phoenix_one.large_media_jobs where owner_id=$1::uuid order by created_at desc limit 15",[user.id])
   return response(200,{jobs:rows})
  }
  return err(400,'unknown_action')
 }catch(e){
  console.warn('phoenix_large_media_queue_error',e?.code||e?.name||'error')
  return err(503,'queue_unavailable')
 }
})
