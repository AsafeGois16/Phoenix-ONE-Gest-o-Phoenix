/**
 * Standalone Phoenix ONE video worker (NOT a Vercel Function).
 * Private credentials are supplied at runtime by the worker hosting platform.
 * Do not deploy without secure secret injection and a single active replica initially.
 */
import postgres from 'postgres'
import {createClient} from '@supabase/supabase-js'
import {mkdtemp,open,rm,stat} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {Readable,Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {transcribeLargeLocalFile,WorkerError} from '../server/large-media-worker.mjs'

const DB=process.env.SUPABASE_DB_URL
const URL=process.env.SUPABASE_URL
const SR=process.env.SUPABASE_SERVICE_ROLE_KEY
const API=process.env.OPENAI_API_KEY
const BUCKET='phoenix-hub-large-media-temp'
const LIMIT=500_000_000
const ERROR_CODES=new Set([
 'media_not_found','invalid_media_size','invalid_media_format','invalid_media_duration',
 'invalid_probe_output','ffmpeg_timeout','media_process_unavailable','media_process_failed',
 'too_many_segments','segment_size_invalid','segment_transcription_empty','job_cancelled',
 'transcription_not_configured','transcription_provider_error','transcription_provider_unauthorized',
 'transcription_rate_limited','transcription_timeout','transcription_empty','transcription_service_unavailable',
 'transcription_invalid_response','transcription_too_long','invalid_segment','invalid_segments'
])
if(!DB||!URL||!SR||!API)throw Error('missing_worker_configuration')
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL))throw Error('invalid_supabase_url')
const pg=postgres(DB,{max:2,prepare:false,connect_timeout:10,idle_timeout:20})
const storage=createClient(URL,SR,{auth:{persistSession:false,autoRefreshToken:false}})
let terminating=false
process.on('SIGTERM',()=>{terminating=true})
process.on('SIGINT',()=>{terminating=true})

const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const pathUrl=p=>p.split('/').map(encodeURIComponent).join('/')
async function claimJob(){
 return pg.begin(async tx=>{
  const rows=await tx.unsafe(
   "select id,owner_id,storage_path,bytes,language,attempts from phoenix_one.large_media_jobs where (status='uploaded' or (status in ('extracting','chunking','transcribing','assembling') and lease_until<now())) and attempts<3 and expires_at>now() order by created_at asc limit 1 for update skip locked"
  )
  if(!rows.length)return null
  const job=rows[0]
  const updated=await tx.unsafe(
   "update phoenix_one.large_media_jobs set status='extracting',lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',attempts=attempts+1,updated_at=now() where id=$1::uuid returning lease_token",
   [job.id]
  )
  return {...job,leaseToken:updated[0].lease_token}
 })
}
async function isStillOwned(job){
 const rows=await pg.unsafe(
  "select status from phoenix_one.large_media_jobs where id=$1::uuid and lease_token=$2::uuid",
  [job.id,job.leaseToken]
 )
 return rows[0]?.status
}
async function setStage(job,status,completed=0,total=0){
 const rows=await pg.unsafe(
  "update phoenix_one.large_media_jobs set status=$3,stage_completed=$4,stage_total=$5,lease_until=now()+interval '15 minutes',updated_at=now() where id=$1::uuid and lease_token=$2::uuid and status not in ('cancel_requested','cancelled','expired') returning id",
  [job.id,job.leaseToken,status,completed,total]
 )
 if(!rows.length)throw new WorkerError('job_cancelled')
}
async function downloadMedia(job,dest,signal){
 const response=await fetch(URL+'/storage/v1/object/authenticated/'+BUCKET+'/'+pathUrl(job.storage_path),{
  headers:{Authorization:'Bearer '+SR,apikey:SR},signal
 })
 if(!response.ok||!response.body)throw new WorkerError('media_not_found')
 const size=Number(response.headers.get('content-length')||0)
 if(size>LIMIT)throw new WorkerError('invalid_media_size')
 let bytes=0
 const limiter=new Transform({
  transform(chunk,_enc,cb){
   bytes+=chunk.length
   if(bytes>LIMIT||bytes>Number(job.bytes))cb(new WorkerError('invalid_media_size'))
   else cb(null,chunk)
  }
 })
 await pipeline(Readable.fromWeb(response.body),limiter,createWriteStream(dest,{flags:'wx'}),{signal})
 if(bytes!==Number(job.bytes))throw new WorkerError('invalid_media_size')
}
async function cleanupStorage(path){
 const {error}=await storage.storage.from(BUCKET).remove([path])
 if(error)throw new Error('cleanup_failed')
}
async function work(job){
 const root=await mkdtemp(join(tmpdir(),'phoenix-job-'))
 const ext=job.storage_path.split('.').pop()
 const file=join(root,'input.'+ext)
 const controller=new AbortController()
 let beatInFlight=false
 let completed=false
 const heartbeat=setInterval(async()=>{
  if(beatInFlight)return
  beatInFlight=true
  try{
   const rows=await pg.unsafe(
    "update phoenix_one.large_media_jobs set lease_until=now()+interval '15 minutes',updated_at=now() where id=$1::uuid and lease_token=$2::uuid and status in ('extracting','chunking','transcribing','assembling') returning status",
    [job.id,job.leaseToken]
   )
   if(!rows.length)controller.abort()
  }catch{controller.abort()}finally{beatInFlight=false}
 },20000)
 heartbeat.unref?.()
 try{
  await downloadMedia(job,file,controller.signal)
  const result=await transcribeLargeLocalFile(file,{
   apiKey:API,language:job.language,signal:controller.signal,
   onProgress:async({stage,completed,total})=>{
    if(controller.signal.aborted)throw new WorkerError('job_cancelled')
    if(!['chunking','transcribing'].includes(stage))throw new WorkerError('invalid_stage')
    await setStage(job,stage,completed,total)
   }
  })
  if(controller.signal.aborted)throw new WorkerError('job_cancelled')
  await setStage(job,'assembling',result.segments,result.segments)
  if(result.text.length>150000)throw new WorkerError('transcription_too_long')
  const done=await pg.unsafe(
   "update phoenix_one.large_media_jobs set status='review_ready',transcript=$3,segment_count=$4,duration_seconds=$5,stage_completed=$4,stage_total=$4,lease_token=null,lease_until=null,updated_at=now() where id=$1::uuid and lease_token=$2::uuid and status='assembling' returning id",
   [job.id,job.leaseToken,result.text,result.segments,result.durationSeconds]
  )
  if(!done.length)throw new WorkerError('job_cancelled')
  completed=true
 }catch(e){
  const cancellation=controller.signal.aborted||(await isStillOwned(job))==='cancel_requested'||e?.code==='job_cancelled'
  const reason=cancellation?'job_cancelled':ERROR_CODES.has(e?.code||e?.message)?(e.code||e.message):'processing_failed'
  await pg.unsafe(
   "update phoenix_one.large_media_jobs set status=$3,error_code=$4,transcript=null,lease_token=null,lease_until=null,updated_at=now() where id=$1::uuid and lease_token=$2::uuid and status not in ('review_ready','cancelled','expired')",
   [job.id,job.leaseToken,cancellation?'cancelled':'failed',reason]
  ).catch(()=>{})
 }finally{
  clearInterval(heartbeat)
  await rm(root,{recursive:true,force:true}).catch(()=>{})
  try{await cleanupStorage(job.storage_path)}
  catch{console.warn('phoenix_worker_cleanup_required',job.id)}
  if(completed)console.log('phoenix_job_review_ready',job.id)
 }
}
async function expireJobs(){
 // Stop indefinitely abandoned workers after three leases and process cancelled stale leases.
 await pg.unsafe("update phoenix_one.large_media_jobs set status='failed',error_code='worker_retries_exhausted',lease_token=null,lease_until=null,updated_at=now() where status in ('extracting','chunking','transcribing','assembling') and lease_until<now() and attempts>=3")
 await pg.unsafe("update phoenix_one.large_media_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where status='cancel_requested' and (lease_until<now() or lease_until is null)")
 const rows=await pg.unsafe(
  "select id,storage_path from phoenix_one.large_media_jobs where (expires_at<now() or status='cancelled') and status not in ('expired','extracting','chunking','transcribing','assembling','cancel_requested') limit 20"
 )
 for(const j of rows){
  try{
   await cleanupStorage(j.storage_path)
   await pg.unsafe("update phoenix_one.large_media_jobs set status='expired',transcript=null,updated_at=now() where id=$1::uuid and status not in ('extracting','chunking','transcribing','assembling','cancel_requested')",[j.id])
  }catch{console.warn('phoenix_worker_sweep_failed',j.id)}
 }
}
try{
 console.log('phoenix_one_worker_started')
 while(!terminating){
  try{
   await expireJobs()
   const job=await claimJob()
   if(job)await work(job)
   else await sleep(5000)
  }catch{console.warn('phoenix_worker_cycle_failed');await sleep(15000)}
 }
}finally{await pg.end({timeout:5})}
