import test from 'node:test'
import assert from 'node:assert/strict'
import {healthLivesCheck,healthCityCheck,volunteeredNetworkPriority} from '../server/murilo-conversation-quality.js'
import {nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'
import {classifyConversationIntent,selectConversationAgent} from '../server/agent-routing.js'
import {validJuniorProtocol,hasOutboundProtocolMismatch} from '../server/protocol-contract.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
const incoming=text=>({direction:'inbound',author:'contact',type:'texto',text})
const agent=text=>({direction:'outbound',author:'agent',type:'texto',text})
const ages='Quais são as idades das pessoas que entrarão no plano?'
const city='Em qual cidade as pessoas utilizarão o plano?'
const priority='Está buscando melhor custo-benefício ou uma rede credenciada maior?'
const hospital='Você tem preferência por algum hospital ou laboratório?'
const pin={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:false,murilo_apresentado:false}}
const base=(text,messages)=>({conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20990101-1122',mode:'sugestao',agent_hint:'murilo',contact:{kind:'lead'},messages:[incoming(text),...(messages||[])]})
const result=()=>({statusCode:200,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(payload){this.data=payload;return payload}})
test('QA01: 12 vidas e quatro idades exige UMA confirmação antes de seguir',()=>{
 const messages=[incoming('Quero cotar plano de saúde empresarial para 12 vidas.'),
  agent(ages),incoming('12,23,24 e 56')]
 const check=healthLivesCheck(messages)
 assert.equal(check.type,'question')
 assert.equal(check.declared,12)
 assert.equal(check.received,4)
 assert.match(check.reply,/12 vidas e 4 idades/)
 assert.equal((check.reply.match(/\?/g)||[]).length,1)
 const result=nextMuriloSdrDecision(messages)
 assert.equal(result.reply,check.reply)
})
test('QA02: 4 vidas e cinco idades exige UMA confirmação, não conclui o lead',()=>{
 const messages=[incoming('Quero cotar plano de saúde empresarial para 4 vidas.'),agent(ages),
  incoming('5, 12, 24, 32 e 54')]
 const check=healthLivesCheck(messages)
 assert.equal(check.type,'question')
 assert.equal(check.declared,4)
 assert.equal(check.received,5)
 const d=nextMuriloSdrDecision(messages)
 assert.equal(d.reply,check.reply)
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
})
test('QA03: correção explícita e numérica resolve a divergência',()=>{
 const base=[incoming('Quero cotar plano de saúde empresarial para 4 vidas.'),agent(ages),
   incoming('5, 12, 24, 32 e 54'),agent('Para confirmar as vidas e idades: você informou 4 vidas e 5 idades. Qual é a quantidade correta de pessoas que entrarão no plano?')]
 assert.equal(healthLivesCheck([...base,incoming('São 5 vidas.')]),null)
 assert.equal(healthLivesCheck([...base,incoming('5')]),null)
})
test('QA04: o cliente não sabe as demais idades — segue SEM repetir validação',()=>{
 const initial=[incoming('Quero cotar plano de saúde empresarial para 12 vidas.'),agent(ages),incoming('12,23,24 e 56')]
 const question=nextMuriloSdrDecision(initial).reply
 const m=[...initial,agent(question),incoming('São 12 vidas, mas só tenho essas quatro idades')]
 assert.equal(healthLivesCheck(m).type,'pending')
 const continuation=nextMuriloSdrDecision(m)
 assert.doesNotMatch(continuation.reply,/para confirmar as vidas e idades/i)
})
test('QA05: CNPJ, apólice, placa e data não são interpretados como lista de idades',()=>{
 for(const answer of ['CNPJ 12.345.678/0001-90','15/12/2026','Minha apólice vence em 15/12/2026','Ainda não sei']){
  assert.equal(healthLivesCheck([incoming('Quero Saúde para 12 vidas'),agent(ages),incoming(answer)]),null,answer)
 }
})
test('QA06: se as cinco vidas têm cinco idades, seguir sem pergunta extra',()=>{
 const m=[incoming('Quero cotar Saúde para 5 vidas'),agent(ages),incoming('5, 12, 24, 32 e 54')]
 assert.equal(healthLivesCheck(m),null)
})
test('QA07: Zona Norte em Vila Mariana é ambíguo; esclarecer SEM pedir toda a cidade novamente',()=>{
 const m=[incoming('Quero cotar um plano de Saúde empresarial.'),agent(city),incoming('Zona Norte em Vila Mariana')]
 const v=healthCityCheck(m)
 assert.equal(v?.type,'question')
 assert.match(v.reply,/Zona Norte de São Paulo ou no bairro Vila Mariana/)
 const d=nextMuriloSdrDecision(m)
 assert.equal(d.reply,v.reply)
 assert.equal((d.reply.match(/\?/g)||[]).length,1)
})
test('QA08: Zona Norte sem município pede confirmação única',()=>{
 const m=[incoming('Quero cotar plano de Saúde.'),agent(city),incoming('Zona Norte')]
 const check=healthCityCheck(m)
 assert.equal(check?.type,'question')
 assert.match(check.reply,/cidade de São Paulo ou em outro município/)
})
test('QA09: Guarulhos, São Paulo e Vila Mariana corretamente identificadas não pedem confirmação',()=>{
 for(const answer of ['Guarulhos','São Paulo - Zona Norte','Vila Mariana, São Paulo']){
  assert.equal(healthCityCheck([incoming('Quero cotar plano de Saúde.'),agent(city),incoming(answer)]),null,answer)
 }
})
test('QA10: depois da pergunta de esclarecimento o Murilo não insiste',()=>{
 const original=[incoming('Quero cotar plano de Saúde.'),agent(city),incoming('Zona Norte em Vila Mariana')]
 const check=healthCityCheck(original)
 const answered=[...original,agent(check.reply),incoming('Vila Mariana, São Paulo')]
 assert.equal(healthCityCheck(answered),null)
 assert.doesNotMatch(nextMuriloSdrDecision(answered).reply,/Para confirmar a localização/)
})
test('QA11: rede credenciada maior já declarada — não refazer pergunta de prioridade',()=>{
 const m=[incoming('Quero cotar Saúde empresarial para 12 vidas. Atualmente temos Amil e estamos buscando uma rede credenciada maior.'),
  agent(city),incoming('Guarulhos')]
 assert.equal(volunteeredNetworkPriority(m),true)
 const d=nextMuriloSdrDecision([
  ...m,agent('Pode me informar o CNPJ da empresa?'),incoming('Tenho o CNPJ.'),
  agent(ages),incoming('12, 23, 24 e 56'),
  agent('Para confirmar as vidas e idades: você informou 12 vidas e 4 idades. As outras 8 idades ainda serão enviadas ou devemos ajustar a quantidade de vidas?'),
  incoming('São 12, as outras idades envio depois.')
 ],{maxQuestions:50})
 assert.notEqual(d.reply,priority)
})
test('QA12: prioridade explicitada como custo-benefício também é aproveitada',()=>{
 const msgs=[incoming('Quero um plano de saúde com melhor custo-benefício'),agent(city),incoming('Guarulhos')]
 assert.equal(volunteeredNetworkPriority(msgs),true)
})
test('QA13: sem preferência declarada, perguntar somente a pergunta prevista',()=>{
 const msgs=[incoming('Quero cotar Saúde pelo CNPJ.'),agent(priority),incoming('Ainda não decidi')]
 assert.equal(volunteeredNetworkPriority(msgs),false)
})
test('QA14: renovação comercial com apólice e vencimento é VENDAS, sem exigir CPF',async()=>{
 const txt='Olá! Quero renovar o seguro do meu Chevrolet Onix 2023. Minha apólice vence em 15/12/2026.'
 assert.equal(classifyConversationIntent(txt),'sales')
 assert.equal(selectConversationAgent(base(txt).messages?base(txt):{}),'murilo')
 const res=result()
 await respondValidated(base(txt),res,pin)
 assert.equal(res.statusCode,200)
 assert.equal(res.data.agent,'clara','Clara acolhe o novo protocolo')
 assert.match(res.data.reply,/como posso te chamar/i)
 assert.doesNotMatch(res.data.reply,/CPF ou CNPJ do titular|localizar seus seguros|validar sua identidade/i)
})
test('QA15: consulta privada real continua Clara com verificação segura',()=>{
 const s='Gostaria de saber o vencimento da minha apólice atual.'
 assert.equal(classifyConversationIntent(s),'service')
 assert.equal(selectConversationAgent(base(s)),'clara')
})
test('QA16: boleto ou sinistro durante renovação continuam operacionais',()=>{
 for(const txt of [
  'Quero renovar o seguro, mas antes preciso da segunda via do boleto.',
  'Quero renovar, mas preciso abrir um sinistro.',
  'Quero renovar, mas a seguradora negou uma autorização médica.'
 ])assert.equal(classifyConversationIntent(txt),'service',txt)
})
test('QA17: novo atendimento cotação passa por Clara antes do Murilo',async()=>{
 const res=result()
 await respondValidated(base('Quero cotar um plano de Saúde para minha família.'),res,pin)
 assert.equal(res.statusCode,200)
 assert.equal(res.data.agent,'clara')
 assert.match(res.data.reply,/Clara|como posso te chamar/)
})
test('QA18: continuidade de Murilo já apresentado não recomeça o atendimento',()=>{
 const m=[incoming('Quero cotar um plano de Saúde.'),agent('Sou o Murilo, do time comercial. Qual é seu plano atual, caso possua um?'),incoming('Amil')]
 assert.equal(selectConversationAgent({messages:m,agent_hint:'murilo'}),'murilo')
})
test('QA19: protocolo diferente no histórico de mensagens enviadas é sinalizado sem alterar o protocolo',()=>{
 assert.equal(validJuniorProtocol('20261124-0003'),true)
 const old=[agent('Seu protocolo de atendimento: 20261124-0001')]
 assert.equal(hasOutboundProtocolMismatch(old,'20261124-0003'),true)
 assert.equal(hasOutboundProtocolMismatch(old,'20261124-0001'),false)
 assert.equal(hasOutboundProtocolMismatch([incoming('Quero falar do protocolo 20261124-0001')],'20261124-0003'),false)
})
test('QA20: uma confirmação de conflito de vidas não reabre fluxo de urgência ou dá acesso a apólice',()=>{
 const msgs=[incoming('Quero cotar plano de saúde para 4 vidas'),agent(ages),incoming('5,12,24,32 e 54')]
 const d=nextMuriloSdrDecision(msgs)
 assert.equal(d.agent,'murilo')
 assert.equal(d.handoff,null)
 assert.equal(d.humanHandoff,false)
 assert.doesNotMatch(d.reply,/samu|urgencia medica|apolice cadastrada/i)
})
