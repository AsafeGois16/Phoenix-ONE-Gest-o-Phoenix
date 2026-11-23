/**
 * Knowledge Hub V2 FFmpeg transcription engine — standalone worker library.
 * Not exposed through the Vercel web process. Do not call from public APIs.
 * The caller is responsible for authenticated download, queue leasing,
 * cancellation authorization, persistence, and temporary-object cleanup.
 */
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,extname} from 'node:path'
import {transcribeMedia} from './knowledge-transcription.js'
import {assembleTranscript,MAX_LARGE_MEDIA_BYTES,MAX_SEGMENTS} from './knowledge-large-media.js'

export const SEGMENT_SECONDS=720
export const SEGMENT_OVERLAP_SECONDS=3
export const MAX_DURATION_SECONDS=6*60*60
export const SEGMENT_MAX_BYTES=15_000_000
export const ALLOWED_INPUT_EXTENSIONS=new Set(['.mp4','.webm','.mov','.m4a','.mp3','.wav'])
export class WorkerError extends Error{
 constructor(code){super(code);this.name='WorkerError';this.code=code}
}
export function segmentPlan(duration,seconds=SEGMENT_SECONDS,overlap=SEGMENT_OVERLAP_SECONDS){
 if(!Number.isFinite(duration)||duration<=0||duration>MAX_DURATION_SECONDS)throw new WorkerError('invalid_media_duration')
 if(!Number.isInteger(seconds)||seconds<60||seconds>900)throw new WorkerError('invalid_segment_length')
 if(!Number.isInteger(overlap)||overlap<0||overlap>=seconds)throw new WorkerError('invalid_overlap')
 const plan=[]
 for(let start=0;start<duration;start+=seconds){
  const end=Math.min(duration,start+seconds)
  plan.push({index:plan.length,startSec:Math.max(0,start-(start?overlap:0)),endSec:end})
  if(plan.length>MAX_SEGMENTS)throw new WorkerError('too_many_segments')
 }
 return plan
}
function spawnBinary(command,args,{timeoutMs=180000,signal,run=spawn}={}){
 return new Promise((resolve,reject)=>{
  const proc=run(command,args,{shell:false,stdio:['ignore','pipe','pipe'],signal,windowsHide:true})
  let stdout='',stderr='',settled=false
  const timer=setTimeout(()=>{proc.kill('SIGKILL');complete(new WorkerError('ffmpeg_timeout'))},timeoutMs)
  function complete(error,output){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(output)}
  proc.stdout?.on('data',data=>{if(stdout.length<64000)stdout+=String(data).slice(0,64000-stdout.length)})
  proc.stderr?.on('data',data=>{if(stderr.length<2000)stderr+=String(data).slice(0,2000-stderr.length)})
  proc.once('error',()=>complete(new WorkerError('media_process_unavailable')))
  proc.once('close',code=>complete(code===0?null:new WorkerError('media_process_failed'),stdout))
 })
}
export function ffprobeArgs(file){
 return ['-v','error','-show_entries','format=duration','-of','json',file]
}
export function ffmpegSegmentArgs(file,segment,destination){
 return ['-nostdin','-hide_banner','-loglevel','error','-y','-ss',String(segment.startSec),'-i',file,
  '-t',String(segment.endSec-segment.startSec),'-vn','-map','0:a:0','-ac','1','-ar','16000',
  '-c:a','libmp3lame','-b:a','48k','-f','mp3',destination]
}
export async function transcribeLargeLocalFile(file,{
 apiKey,language='auto',signal,onProgress=()=>{},runCommand=spawnBinary,
 transcribe=transcribeMedia,workspaceRoot=tmpdir()
}={}){
 if(!apiKey)throw new WorkerError('transcription_not_configured')
 if(!ALLOWED_INPUT_EXTENSIONS.has(extname(file).toLowerCase()))throw new WorkerError('invalid_media_format')
 const meta=await stat(file).catch(()=>{throw new WorkerError('media_not_found')})
 if(!meta.isFile()||meta.size<1000||meta.size>MAX_LARGE_MEDIA_BYTES)throw new WorkerError('invalid_media_size')
 let work=null
 try{
  if(signal?.aborted)throw new WorkerError('job_cancelled')
  const probeText=await runCommand('ffprobe',ffprobeArgs(file),{timeoutMs:60000,signal})
  let duration
  try{duration=Number(JSON.parse(probeText).format.duration)}catch{throw new WorkerError('invalid_probe_output')}
  const plan=segmentPlan(duration)
  work=await mkdtemp(join(workspaceRoot,'phoenix-media-'))
  await onProgress({stage:'chunking',completed:0,total:plan.length})
  const parts=[]
  for(const seg of plan){
   if(signal?.aborted)throw new WorkerError('job_cancelled')
   const dest=join(work,'segment-'+String(seg.index).padStart(4,'0')+'.mp3')
   await runCommand('ffmpeg',ffmpegSegmentArgs(file,seg,dest),{timeoutMs:180000,signal})
   const bytes=await readFile(dest)
   if(bytes.length<1000||bytes.length>SEGMENT_MAX_BYTES)throw new WorkerError('segment_size_invalid')
   await onProgress({stage:'transcribing',completed:seg.index,total:plan.length})
   const result=await transcribe(new Blob([bytes],{type:'audio/mpeg'}),{
    filename:'segment.mp3',apiKey,language
   })
   if(typeof result?.text!=='string'||result.text.trim().length<10)throw new WorkerError('segment_transcription_empty')
   parts.push({index:seg.index,startMs:Math.round(seg.startSec*1000),endMs:Math.round(seg.endSec*1000),text:result.text})
   await onProgress({stage:'transcribing',completed:seg.index+1,total:plan.length})
  }
  const text=assembleTranscript(parts)
  return {text,segments:parts.length,durationSeconds:duration,reviewRequired:true,published:false,
   overlapNotice:'Segmentos têm sobreposição de 3 segundos. Verifique possíveis repetições nos limites antes de publicar.'}
 }finally{if(work)await rm(work,{recursive:true,force:true}).catch(()=>{})}
}
