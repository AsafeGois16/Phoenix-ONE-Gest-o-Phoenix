import test from 'node:test'
import assert from 'node:assert/strict'
import {queueClient,reviewText,validateQueueResponse,TERMINAL_STATES,LARGE_QUEUE_STATES} from '../src/large-media-queue-client.js'
const uid='11111111-1111-4111-8111-111111111111'
const origin='https://cxyxrhmpjehrqhwihxul.supabase.co'
test('queue validates authenticated access, URL and actions',async()=>{
 assert.throws(()=>queueClient({url:'https://evil.example',apiKey:'key',accessToken:'token'}),/queue_not_configured/)
 let called=false
 const request=queueClient({url:origin,apiKey:'key',accessToken:'token',fetcher:async(url,init)=>{
  called=true
  assert.equal(url,origin+'/functions/v1/phoenix-hub-large-queue')
  assert.equal(init.headers.Authorization,'Bearer token')
  assert.equal(JSON.parse(init.body).action,'status')
  return {ok:true,json:async()=>({jobId:uid,status:'transcribing',completed:1,total:5})}
 }})
 const status=await request('status',{jobId:uid})
 assert.equal(status.completed,1)
 assert.equal(called,true)
 await assert.rejects(request('publish',{jobId:uid}),/queue_unknown_action/)
})
test('queue rejects fabricated job IDs and malformed finished transcript',()=>{
 assert.throws(()=>validateQueueResponse({jobId:'untrusted',status:'uploaded'},'status'),/queue_invalid_response/)
 assert.throws(()=>validateQueueResponse({jobId:uid,status:'review_ready'},'status'),/queue_invalid_response/)
 assert.equal(validateQueueResponse({jobId:uid,status:'review_ready',text:'Texto de teste aprovado'},'status').status,'review_ready')
 assert.ok(TERMINAL_STATES.has('review_ready'))
 assert.equal(LARGE_QUEUE_STATES.transcribing,'Transcrevendo os segmentos')
})
test('review handoff never publishes automatically',()=>{
 const result=reviewText({filename:'treinamento.mp4',language:'pt',job:{status:'review_ready',text:'A Phoenix Insurance presta serviços de corretagem.'}})
 assert.match(result.content,/REVISÃO OBRIGATÓRIA/)
 assert.match(result.content,/Phoenix Insurance/)
 assert.equal(result.category,'Aprendizado supervisionado')
 assert.equal(Object.hasOwn(result,'published'),false)
 assert.throws(()=>reviewText({filename:'teste.mp4',job:{status:'uploaded'}}),/queue_review_unavailable/)
})
