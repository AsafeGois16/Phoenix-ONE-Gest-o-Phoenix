import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {labCoachingInstructions} from '../server/lab-conversation-coaching.js'
import {assessConversationQaAnswer} from '../server/megabrain-conversation-qa.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const u=content=>({role:'user',content})
const a=content=>({role:'assistant',content})
const evalAnswer=(scenarioId,turnIndex,answer,agent)=>assessConversationQaAnswer({scenarioId,turnIndex,answer,agent,previous:[]})

test('Clara gets opt-in coaching to offer Murilo instead of asking vehicle questions',()=>{
 const chat=[u('Quero comparar meu seguro Auto com outras seguradoras. Posso falar com o comercial?')]
 const guidance=labCoachingInstructions('clara',chat)
 assert.match(guidance,/consentimento/i)
 assert.match(guidance,/Murilo/)
 assert.match(guidance,/NÃO conduz a qualificação do SDR/)
 assert.doesNotMatch(guidance,/faixa etária|CPF do cliente/)
})
test('After explicit authorization Clara gets no-sales-data, proposed-not-completed handoff guidance',()=>{
 const chat=[u('Quero comparar seguro Auto'),a('Vamos cotar. Qual a marca?'),
 u('Sim, pode passar meu atendimento para o Murilo.')]
 const guidance=labCoachingInstructions('clara',chat)
 assert.match(guidance,/confirmou a passagem/)
 assert.match(guidance,/Não comece a coletar marca/)
 assert.match(guidance,/SEM afirmar que a transferência já aconteceu/)
})
test('Murilo coaching repeats only known fictional apartment and city, not a lookup',()=>{
 const chat=[u('Quero cotar seguro residencial.'),a('Qual o tipo e a cidade?'),
 u('É um apartamento em Guarulhos. Quero proteger meus bens.')]
 const guidance=labCoachingInstructions('murilo',chat)
 assert.match(guidance,/apartamento em Guarulhos/)
 assert.match(guidance,/N[aã]o repita|sem repetir/i)
 assert.doesNotMatch(guidance,/endereço completo|R\$|CPF|número da apólice/)
 assert.equal(labCoachingInstructions('murilo',[u('Quero um seguro residencial.')]),'')
})
test('Other agents and unrelated conversations are unchanged',()=>{
 assert.equal(labCoachingInstructions('clara',[u('Qual o prazo do reembolso odontológico?')]),'')
 assert.equal(labCoachingInstructions('murilo',[u('Preciso de seguro de vida.')]),'')
 assert.equal(labCoachingInstructions('other',[u('Quero cotar residencial')]),'')
})
test('Explicit QA opt-in is used only by the V4.2 component and supported by authenticated RAG API',()=>{
 const ui=read('src/MegaBrainConversationalLab.jsx')
 const api=read('api/phoenix-answer.js')
 assert.ok(ui.includes("body:JSON.stringify({agent:current.agent,messages,qaMode:'v42'})"))
 assert.ok(api.includes("qaMode==='v42'?labCoachingInstructions(agent,messages):''"))
 assert.ok(api.includes("auth.getUser(token)"))
 assert.ok(api.includes("active.system_prompt"))
 assert.doesNotMatch(api,/\/api\/v1\/conversations\/respond/)
 const live=read('api/v1/conversations/respond.js')
 assert.doesNotMatch(live,/labCoachingInstructions|qaMode/)
})
test('QA warns when Clara forgets Murilo consent in first turn',()=>{
 const bad=evalAnswer('clara-to-murilo',0,'Claro, qual a marca e o ano do seu carro?','clara')
 assert.ok(bad.needsReview)
 assert.ok(bad.notes.some(x=>/não solicitou autorização/.test(x)))
 assert.ok(bad.notes.some(x=>/qualificação comercial/.test(x)))
 const good=evalAnswer('clara-to-murilo',0,'Posso encaminhar o atendimento ao Murilo, nosso assistente comercial?','clara')
 assert.equal(good.needsReview,false)
})
test('QA warns if Clara asks sales/private data after consent, or fails to acknowledge passage',()=>{
 const bad=evalAnswer('clara-to-murilo',1,'Por favor, informe marca, ano e placa do veículo.','clara')
 assert.ok(bad.notes.some(x=>/não reconheceu o aceite/.test(x)))
 assert.ok(bad.notes.some(x=>/pediu dados/.test(x)))
 const good=evalAnswer('clara-to-murilo',1,'Perfeito! Vou solicitar que o Murilo dê continuidade à sua cotação.','clara')
 assert.equal(good.needsReview,false)
})
test('QA warns when Murilo ignores apartment in Guarulhos and accepts explicit acknowledgment',()=>{
 const bad=evalAnswer('murilo-residencial',1,'Certo, quais bens deseja proteger?','murilo')
 assert.ok(bad.notes.some(x=>/apartamento em Guarulhos/.test(x)))
 const good=evalAnswer('murilo-residencial',1,'Entendi: é um apartamento em Guarulhos. Para proteger seus bens, você busca cobertura de conteúdo?','murilo')
 assert.equal(good.needsReview,false)
})
test('Human review remains mandatory regardless of auto-alert counts',()=>{
 const evaled=evalAnswer('murilo-residencial',1,'É um apartamento em Guarulhos. Qual o próximo detalhe?','murilo')
 assert.equal(evaled.needsReview,false)
 assert.equal(evaled.checks,1)
 const ui=read('src/MegaBrainConversationalLab.jsx')
 assert.ok(ui.includes('Aprovar resposta'))
 assert.ok(ui.includes('Precisa revisão'))
})
