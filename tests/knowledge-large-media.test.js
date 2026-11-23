import test from 'node:test'
import assert from 'node:assert/strict'
import {MAX_LARGE_MEDIA_BYTES,mayAdvance,validateLargeMedia,assembleTranscript} from '../server/knowledge-large-media.js'
const uid='11111111-1111-4111-8111-111111111111'
const fid='22222222-2222-4222-8222-222222222222'
const valid={size:100_000_000,name:'treinamento.mp4',userId:uid,path:uid+'/'+fid+'.mp4'}
test('large media max 500MB; path bound to owner',()=>{
 assert.equal(MAX_LARGE_MEDIA_BYTES,500_000_000)
 assert.equal(validateLargeMedia(valid),true)
 assert.throws(()=>validateLargeMedia({...valid,size:501_000_000}),/media_size_invalid/)
 assert.throws(()=>validateLargeMedia({...valid,path:'33333333-3333-4333-8333-333333333333/'+fid+'.mp4'}),/media_path_invalid/)
 assert.throws(()=>validateLargeMedia({...valid,path:uid+'/../escape.mp4'}),/media_path_invalid/)
 assert.throws(()=>validateLargeMedia({...valid,name:'payload.exe'}),/media_type_invalid/)
})
test('job state transitions are restricted',()=>{
 assert.equal(mayAdvance('created','uploading'),true)
 assert.equal(mayAdvance('created','review_ready'),false)
 assert.equal(mayAdvance('review_ready','transcribing'),false)
 assert.equal(mayAdvance('failed','expired'),true)
})
test('assembled transcript ordered with accurate timestamps and no loss',()=>{
 const text=assembleTranscript([
  {index:1,startMs:5000,endMs:10000,text:'A Phoenix Insurance trabalha com seguros.'},
  {index:0,startMs:0,endMs:5000,text:'Olá, bem-vindos.'}
 ])
 assert.match(text,/00:00:00.*Olá, bem-vindos\.[\s\S]*00:00:05.*Phoenix Insurance/)
 assert.throws(()=>assembleTranscript([{index:1,startMs:0,endMs:5000,text:'Pedaço'}]),/invalid_segment/)
})
