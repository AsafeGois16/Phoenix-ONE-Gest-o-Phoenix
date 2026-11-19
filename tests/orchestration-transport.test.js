import test from 'node:test'
import assert from 'node:assert/strict'
import {resolvePilotMode,orchestrationErrorCode} from '../server/orchestration-pilot.js'
const env={VERCEL_ENV:'production'}
const body={protocolo:'20261119-0001',conversation_id:'11111111-1111-4111-8111-111111111111',mode:'sugestao',messages:[{direction:'inbound',author:'contact',text:'Olá'}]}
const row={mode:'clara_only',revision:2,blocked:false,clara_apresentada:false,murilo_apresentado:false}
test('Orquestração: retry limitado em falha transitória, sem fallback de modo',async()=>{
 let calls=0
 const r=await resolvePilotMode(body,env,async()=>{if(++calls===1){const e=new Error('timeout');e.name='TimeoutError';throw e}return row})
 assert.equal(calls,2);assert.equal(r.mode,'clara_only')
 calls=0;await assert.rejects(resolvePilotMode(body,env,async()=>{calls++;throw Error('bridge_unavailable')}))
 assert.equal(calls,2)
})
test('Orquestração: rejeição explícita não é repetida nem ignorada',async()=>{
 for(const value of [{blocked:true},{...row,revision:0}]){
  let calls=0;await assert.rejects(resolvePilotMode(body,env,async()=>{calls++;return value}));assert.equal(calls,1)
 }
 let calls=0;await assert.rejects(resolvePilotMode(body,env,async()=>{calls++;throw Error('bridge_unauthorized')}));assert.equal(calls,1)
 assert.equal(orchestrationErrorCode(new Error('private text')),'unexpected')
})
test('Orquestração: mantém validação do contrato original, sem corte ou interpretação de data',async()=>{
 const r=await resolvePilotMode({...body,protocolo:'20269999-0001'},env,async()=>row)
 assert.equal(r.mode,'clara_only')
})
