import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {segmentPlan,ffprobeArgs,ffmpegSegmentArgs,transcribeLargeLocalFile,WorkerError} from '../server/large-media-worker.mjs'

test('plans 12-minute chunks with 3-second overlap without skipping time',()=>{
 const p=segmentPlan(1460)
 assert.deepEqual(p.map(x=>[x.index,x.startSec,x.endSec]),[
  [0,0,720],[1,717,1440],[2,1437,1460]
 ])
 assert.throws(()=>segmentPlan(8*60*60),/invalid_media_duration/)
 assert.throws(()=>segmentPlan(100,30),/invalid_segment_length/)
 assert.throws(()=>segmentPlan(100,60,60),/invalid_overlap/)
})
test('FFmpeg uses explicit audio extraction and never shell concatenation',()=>{
 const args=ffmpegSegmentArgs('/trusted/source.mp4',{startSec:717,endSec:1440},'/temp/part.mp3')
 assert.ok(args.includes('-vn'))
 assert.ok(args.includes('libmp3lame'))
 assert.ok(args.includes('48000')===false)
 assert.ok(args.includes('48k'))
 assert.ok(args.includes('0:a:0'))
 assert.ok(args.includes('-nostdin'))
 assert.equal(args.at(-1),'/temp/part.mp3')
 assert.ok(ffprobeArgs('source.mp4').includes('-of'))
})
test('worker converts and transcribes segments in order and cleans scratch files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'phoenix-worker-test-'))
 const source=join(root,'sample.mp4')
 await writeFile(source,Buffer.alloc(2048))
 const calls=[],seen=[],progress=[]
 const run=async(command,args)=>{
  calls.push({command,args})
  if(command==='ffprobe')return JSON.stringify({format:{duration:'1450'}})
  await writeFile(args.at(-1),Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2000)]))
  return ''
 }
 let count=0
 const transcribe=async(blob,{filename,apiKey})=>{
  seen.push({size:blob.size,filename,apiKey})
  return {text:'Texto de teste da Phoenix Insurance no segmento '+(++count)+'.'}
 }
 try{
  const out=await transcribeLargeLocalFile(source,{apiKey:'local-test-key',runCommand:run,transcribe,
   workspaceRoot:root,onProgress:x=>progress.push(x)})
  assert.equal(out.segments,3)
  assert.equal(out.published,false)
  assert.equal(out.reviewRequired,true)
  assert.ok(out.text.indexOf('segmento 1')<out.text.indexOf('segmento 2'))
  assert.equal(calls.filter(x=>x.command==='ffmpeg').length,3)
  assert.equal(seen.length,3)
  assert.ok(progress.some(x=>x.completed===3))
  assert.deepEqual((await readdir(root)).sort(),['sample.mp4'])
 }finally{await rm(root,{recursive:true,force:true})}
})
test('worker deletes intermediate files on transcription failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'phoenix-worker-fail-'))
 const source=join(root,'bad.mp4')
 await writeFile(source,Buffer.alloc(2048))
 try{
  await assert.rejects(transcribeLargeLocalFile(source,{apiKey:'mock',workspaceRoot:root,
   runCommand:async(command,args)=>{
    if(command==='ffprobe')return JSON.stringify({format:{duration:'700'}})
    await writeFile(args.at(-1),Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2000)]))
   },transcribe:async()=>{throw new WorkerError('transcription_provider_error')}}),/transcription_provider_error/)
  assert.deepEqual(await readdir(root),['bad.mp4'])
 }finally{await rm(root,{recursive:true,force:true})}
})
