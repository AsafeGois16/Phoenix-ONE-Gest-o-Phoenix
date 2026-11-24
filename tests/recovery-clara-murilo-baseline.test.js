/**
 * Recovery gate for the last tested Clara + Murilo operational strategy.
 * This test requires NO live WhatsApp, no Junior credentials, and no database mutation.
 * It validates that selecting the strategy restores the ORIGINAL decision engine
 * and that a human-owned protocol remains blocked even during a mode switch.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {operationalRouting,LEGACY_COMMERCIAL_ROUTES} from '../server/orchestration-operational.js'
import {resolvePilotMode} from '../server/orchestration-pilot.js'
import {respondValidated} from '../api/v1/conversations/respond.js'

const conversationId='11111111-1111-4111-8111-111111111111'
const inbound=text=>({direction:'inbound',author:'contact',type:'texto',text})
const body=text=>({
 conversation_id:conversationId,
 protocolo:'20990101-1234',
 mode:'sugestao',
 contact:{kind:'lead'},
 agent_hint:'murilo',
 messages:[inbound(text)]
})
const response=()=>({
 code:200,body:null,
 setHeader(){},
 status(code){this.code=code;return this},
 json(payload){this.body=payload;return payload}
})
const pinned=(mode,revision=6)=>({
 mode,revision,
 intro:{blocked:false,clara_apresentada:false,murilo_apresentado:false}
})

test('restauração: modo Clara+Murilo delega a TODOS os assuntos ao motor anterior',()=>{
 for(const sample of [
  'Quero cotar um seguro para meu carro.',
  'Gostaria de um plano de saúde empresarial.',
  'Preciso incluir um dependente no meu plano.',
  'Preciso da segunda via do boleto.',
  'Meu carro foi roubado e há feridos.',
  'Quero cotação de carro e vida.'
 ]){
  const plan=operationalRouting({pin:pinned('clara_murilo'),body:body(sample),verifiedRoutes:LEGACY_COMMERCIAL_ROUTES})
  assert.equal(plan.action,'delegate',sample)
  assert.equal(plan.reason,'legacy_unchanged',sample)
  assert.equal(plan.executed,false,sample)
  assert.equal(plan.agent,null,sample)
 }
})
test('restauração: seleção retoma Clara+Murilo sem reescrever prompts, filas ou estado',async()=>{
 const bridge=async(action,params)=>{
  assert.equal(action,'orchestration_pilot_pin')
  assert.equal(params.conversationId,conversationId)
  return {
   mode:'clara_murilo',revision:7,blocked:false,
   clara_apresentada:false,murilo_apresentado:false
  }
 }
 const input=body('Gostaria de cotar um seguro para meu carro.')
 const result=await resolvePilotMode(input,{VERCEL_ENV:'production'},bridge)
 assert.equal(result.mode,'clara_murilo')
 const res=response()
 await respondValidated(input,res,result)
 assert.equal(res.code,200)
 assert.equal(res.body.strategy,'clara_murilo')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.ok(['clara','murilo'].includes(res.body.agent))
})
test('restauração: mudar para Clara+Murilo NÃO reativa protocolos já assumidos',async()=>{
 const attempt=async()=>resolvePilotMode(body('Olá'),{VERCEL_ENV:'production'},async()=>({
  mode:'clara_murilo',revision:7,blocked:true,
  clara_apresentada:true,murilo_apresentado:false
 }))
 await assert.rejects(attempt,/protocol_not_with_agent/)
})
test('restauração: indisponibilidade do Bridge não presume que o protocolo está livre',async()=>{
 const input=body('Olá')
 let calls=0
 await assert.rejects(
  resolvePilotMode(input,{VERCEL_ENV:'production'},async()=>{calls++;throw Error('bridge_unavailable')}),
  /bridge_unavailable/
 )
 assert.equal(calls,2)
})
