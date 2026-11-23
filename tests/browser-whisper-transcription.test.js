import test from 'node:test'
import assert from 'node:assert/strict'
import {validateBrowserMedia,segmentFileNames,assembleBrowserTranscript,MAX_BROWSER_INPUT_BYTES,SEGMENT_SECONDS} from '../src/browser-audio-segmentation.js'
import {transcribeMedia,TranscriptionError} from '../server/knowledge-transcription.js'

test('browser media validation accepts known audio/video up to 500MB',()=>{
 assert.equal(MAX_BROWSER_INPUT_BYTES,500_000_000)
 assert.equal(validateBrowserMedia({name:'palestra.mp4',size:250_000_000}),'mp4')
 assert.throws(()=>validateBrowserMedia({name:'palestra.exe',size:10000}),/media_unsupported_format/)
 assert.throws(()=>validateBrowserMedia({name:'palestra.mp4',size:501_000_000}),/media_too_large_browser/)
})
test('segment list rejects gaps and non-MP3 files',()=>{
 const names=segmentFileNames([
  {name:'part-001.mp3',isDir:false},{name:'input.mp4',isDir:false},
  {name:'part-000.mp3',isDir:false},{name:'.',isDir:true}
 ])
 assert.deepEqual(names,['part-000.mp3','part-001.mp3'])
 assert.throws(()=>segmentFileNames([{name:'part-001.mp3',isDir:false}]),/media_segment_missing/)
 assert.throws(()=>segmentFileNames([]),/media_too_many_parts/)
})
test('transcripts assemble in order with review-only provenance',()=>{
 assert.equal(SEGMENT_SECONDS,480)
 const result=assembleBrowserTranscript([
  {index:0,text:'Olá, Phoenix Insurance.'},
  {index:1,text:'Bem-vindos ao treinamento.'}
 ],{filename:'treinamento.mp4',model:'whisper-1',language:'pt'})
 assert.match(result.content,/MODELO DE TRANSCRIÇÃO: whisper-1/)
 assert.match(result.content,/\[00:08:00\] Bem-vindos/)
 assert.match(result.content,/revisar nomes, números/)
 assert.match(result.content,/não foi enviado ao armazenamento/)
 assert.equal(result.category,'Aprendizado supervisionado')
 assert.throws(()=>assembleBrowserTranscript([{index:1,text:'errado'}]),/media_segment_invalid/)
})
test('OpenAI model selection is strictly allowlisted with compatible audio',async()=>{
 const audio=new Blob([Buffer.from('ID3'),Buffer.alloc(5000)],{type:'audio/mpeg'})
 let received
 const result=await transcribeMedia(audio,{filename:'segment.mp3',apiKey:'test-not-real',model:'whisper-1',fetcher:async(url,req)=>{
  assert.equal(url,'https://api.openai.com/v1/audio/transcriptions')
  received=req.body.get('model')
  return {ok:true,json:async()=>({text:'Este é um segmento de transcrição simulado para Phoenix.'})}
 }})
 assert.equal(received,'whisper-1')
 assert.equal(result.model,'whisper-1')
 await assert.rejects(transcribeMedia(audio,{filename:'segment.mp3',apiKey:'test-not-real',model:'arbitrary-model'}),e=>e instanceof TranscriptionError&&e.message==='transcription_invalid_model')
})
