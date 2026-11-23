import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 TRANSCRIBE_BUCKET,TRANSCRIBE_MAX_BYTES,TRANSCRIBE_MODEL,mediaExtension,
 validOwnedPath,validateMedia,transcribeMedia,TranscriptionError
} from '../server/knowledge-transcription.js'
import handler from '../api/phoenix-transcribe-hub.js'
const uid='11111111-1111-4111-8111-111111111111'
const key='22222222-2222-4222-8222-222222222222'
const path=uid+'/'+key+'.mp3'
const data=()=>{
 const bytes=Buffer.alloc(2048,0)
 bytes.write('ID3')
 return new Blob([bytes],{type:'audio/mpeg'})
}
test('Transcrição: bucket e formato permitido; valida propriedade do objeto',()=>{
 assert.equal(TRANSCRIBE_BUCKET,'phoenix-hub-transcription-temp')
 assert.equal(TRANSCRIBE_MODEL,'gpt-transcribe')
 assert.equal(TRANSCRIBE_MAX_BYTES,24000000)
 for(const ext of ['mp3','mpga','mpeg','m4a','mp4','wav','ogg','webm','flac'])assert.equal(mediaExtension('teste.'+ext),ext)
 for(const invalid of ['.pdf','file.exe','file.mp3.exe',''])assert.equal(mediaExtension(invalid),null)
 assert.equal(validOwnedPath(path,uid),'mp3')
 for(const invalid of [key+'/'+key+'.mp3',uid+'/../etc/passwd',uid+'/'+key+'.pdf',uid+'/'+key+'.mp3/next','https://a.com/'])assert.equal(validOwnedPath(invalid,uid),null)
})
test('Transcrição: inspeciona conteúdo binário e rejeita extensão falsa',async()=>{
 const meta=await validateMedia(data(),'audio.mp3');assert.equal(meta.extension,'mp3')
 await assert.rejects(validateMedia(new Blob([Buffer.alloc(2048)]),'audio.mp3'),e=>e instanceof TranscriptionError&&e.message==='media_invalid_content')
 await assert.rejects(validateMedia(new Blob([Buffer.alloc(100)]),'audio.mp3'),/media_too_short/)
 await assert.rejects(validateMedia(new Blob([Buffer.alloc(24000001)]),'audio.mp3'),/media_too_large/)
 const bytes=Buffer.alloc(1200);bytes.write('RIFF',0);bytes.write('WAVE',8)
 assert.equal((await validateMedia(new Blob([bytes]),'audio.wav')).extension,'wav')
})
test('Transcrição: usa endpoint oficial com modelo atual, sem expor prompt ou chave na resposta',async()=>{
 let calls=0
 const fetcher=async(url,opts)=>{
  calls++
  assert.equal(url,'https://api.openai.com/v1/audio/transcriptions')
  assert.equal(opts.headers.Authorization,'Bearer fixture')
  assert.equal(opts.body.get('model'),'gpt-transcribe')
  assert.equal(opts.body.get('languages[]'),'pt')
  assert.equal(opts.body.has('language'),false)
  assert.equal(opts.body.has('languages[]'),false)
  assert.equal(opts.body.get('response_format'),'json')
  const media=opts.body.get('file')
  assert.equal(media.name,'recording.mp3');assert.equal(media.type,'audio/mpeg')
  return {ok:true,json:async()=>({text:'O atendimento da Phoenix Insurance será realizado pelo departamento responsável pela solicitação de planos de saúde.'})}
 }
 const r=await transcribeMedia(data(),{filename:'audio.mp3',apiKey:'fixture',language:'pt',fetcher})
 assert.equal(calls,1);assert.match(r.text,/Phoenix Insurance/)
 assert.equal(Object.hasOwn(r,'apiKey'),false)
})
test('Transcrição: omite indicação de idioma quando automática',async()=>{
 const r=await transcribeMedia(data(),{filename:'audio.mp3',apiKey:'fixture',fetcher:async(url,opts)=>{
  assert.equal(opts.body.has('language'),false)
  return {ok:true,json:async()=>({text:'The Phoenix Insurance company offers professional insurance brokerage services to customers.'})}
 }})
 assert.ok(r.text.includes('Phoenix'))
})
test('Transcrição: erros conhecidos sem vazamento de dados sensíveis',async()=>{
 for(const [status,code] of [[401,'transcription_provider_unauthorized'],[429,'transcription_rate_limited'],[503,'transcription_provider_error']]){
  await assert.rejects(transcribeMedia(data(),{filename:'audio.mp3',apiKey:'fixture',fetcher:async()=>({ok:false,status})}),e=>e.message===code)
 }
 await assert.rejects(transcribeMedia(data(),{filename:'audio.mp3',apiKey:'',fetcher:async()=>{throw Error('should not be called')}}),/transcription_not_configured/)
 await assert.rejects(transcribeMedia(data(),{filename:'audio.mp3',apiKey:'fixture',fetcher:async()=>{throw new Error('Private provider trace with secrets')}}),e=>e.message==='transcription_service_unavailable')
})
test('Transcrição: Whisper legado mantém parâmetro singular de idioma',async()=>{
 await transcribeMedia(data(),{filename:'audio.mp3',apiKey:'fixture',language:'pt',model:'whisper-1',fetcher:async(url,opts)=>{
  assert.equal(opts.body.get('language'),'pt')
  assert.equal(opts.body.has('languages[]'),false)
  return {ok:true,json:async()=>({text:'Este é um áudio de teste válido com algumas palavras para transcrição.'})}
 }})
})
test('Transcrição: rejeição do arquivo é classificada sem expor mensagem do provedor',async()=>{
 const fetcher=async()=>({
  ok:false,status:400,
  headers:{get:name=>name==='x-request-id'?'req_test123':null},
  json:async()=>({error:{type:'invalid_request_error',code:'invalid_file_format',param:'file',message:'Áudio confidencial com dados privados'}})
 })
 await assert.rejects(transcribeMedia(data(),{filename:'audio.mpeg',apiKey:'fixture',fetcher}),e=>{
  assert.equal(e.message,'transcription_media_rejected')
  assert.equal(e.status,422)
  assert.deepEqual(e.details,{
   providerStatus:400,providerType:'invalid_request_error',
   providerCode:'invalid_file_format',providerParam:'file',
   providerRequestId:'req_test123',extension:'mpeg',model:'gpt-transcribe'
  })
  assert.equal(JSON.stringify(e.details).includes('confidencial'),false)
  return true
 })
})
test('Transcrição: erro de parâmetros é distinto da rejeição do áudio',async()=>{
 const fetcher=async()=>({ok:false,status:400,json:async()=>({error:{type:'invalid_request_error',param:'languages'}})})
 await assert.rejects(transcribeMedia(data(),{filename:'audio.mpeg',apiKey:'fixture',fetcher}),e=>e.message==='transcription_provider_request_rejected'&&e.details.providerParam==='languages')
})
test('Transcrição: rota privada rejeita GET e origem incorreta sem armazenar áudio',async()=>{
 const res=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return x}})
 const a=res();await handler({method:'GET',headers:{}},a);assert.equal(a.code,405)
 const b=res();await handler({method:'POST',headers:{origin:'https://attacker.example',host:'phoenix-one-ai.vercel.app'}},b);assert.equal(b.code,403)
})
test('Transcrição: apenas texto vai para revisão, sem publicação automática',()=>{
 const page=readFileSync(new URL('../src/KnowledgeTranscription.jsx',import.meta.url),'utf8')
 const ops=readFileSync(new URL('../src/Operations.jsx',import.meta.url),'utf8')
 const endpoint=readFileSync(new URL('../api/phoenix-transcribe-hub.js',import.meta.url),'utf8')
 assert.match(page,/!validFile\|\|!consent/)
 assert.match(page,/XMLHttpRequest/)
 assert.match(page,/req\.upload\.onprogress/)
 assert.match(page,/await fetch\('\/api\/phoenix-transcribe-hub'/)
 assert.match(page,/onReady\(\{title:/)
 assert.match(ops,/setTranscribeOpen\(false\);setNewOpen\(true\)/)
 assert.match(endpoint,/storage\.remove\(\[path\]\)/)
 assert.match(endpoint,/reviewRequired:true,published:false/)
 assert.doesNotMatch(endpoint,/create_document|publish_document/)
})
