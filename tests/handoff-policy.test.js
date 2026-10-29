import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeHandoffDecision} from '../server/handoff-policy.js'
const departments=['beneficios','patrimonio','comercial']
const decision=(reply,humanHandoff=true,department='patrimonio')=>({
 reply,humanHandoff,handoff:humanHandoff?{department,reason:'Dúvida sobre apólice',summary:'Solicitação de atendimento'}:null
})
test('pergunta se cliente quer encaminhamento nao pausa a Clara',()=>{
 for(const reply of [
  'Deseja que eu encaminhe sua solicitação para um colaborador?',
  'Gostaria que eu transferisse você para a equipe?',
  'Quer que eu passe você para nosso atendimento?',
  'Posso encaminhar você para um especialista?',
  'Quer que eu encaminhe para a equipe dedicada?'
 ]){
  let normalized=normalizeHandoffDecision(decision(reply),departments)
  assert.equal(normalized.suppressed,true,reply)
  assert.equal(normalized.handoff,null,reply)
 }
})
test('handoff afirmativo permitido quando sera feito imediatamente',()=>{
 let normalized=normalizeHandoffDecision(decision('Vou encaminhar sua solicitação para a equipe responsável agora.'),departments)
 assert.equal(normalized.suppressed,false)
 assert.equal(normalized.handoff.department,'patrimonio')
})
test('pergunta sobre seguros sem encaminhamento permanece ativa',()=>{
 let normalized=normalizeHandoffDecision(decision('Você gostaria dos detalhes?',false),departments)
 assert.equal(normalized.handoff,null)
 assert.equal(normalized.suppressed,false)
})
test('texto malformado ou departamento invalido nao produz transferencia',()=>{
 let normalized=normalizeHandoffDecision(decision('Deseja falar com alguém?',true,'financeiro'),departments)
 assert.equal(normalized.handoff,null)
})
