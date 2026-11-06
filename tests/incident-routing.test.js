import test from 'node:test'
import assert from 'node:assert/strict'
import {isIncidentReport,incidentContext,incidentFirstSafetyDecision,incidentFollowupDecision,incidentVerifiedDecision,enrichConfirmedIncidentHandoff} from '../server/incident-routing.js'
import {confirmedOfferHandoff} from '../server/consent-routing.js'

const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const original='Olá! Sofri uma colisão com meu carro e preciso acionar meu seguro Auto. Ninguém ficou ferido.'

test('primeira colisão com ausência de feridos: segurança ANTES do CPF',()=>{
 const d=incidentFirstSafetyDecision([inc(original)])
 assert.equal(d.agent,'clara')
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
 assert.match(d.reply,/ninguém ficou ferido/i)
 assert.match(d.reply,/local seguro/i)
 assert.doesNotMatch(d.reply,/CPF|CNPJ|apólice|franquia|cobertura|preço|seguradora/i)
 assert.doesNotMatch(d.reply,/SAMU|Bombeiros|192|193/i)
})

test('sinistro com risco/feridos: socorro prevalece e não pede CPF',()=>{
 for(const text of [
  'Sofri um acidente com meu carro. Há uma pessoa ferida.',
  'Sofri colisão com meu carro e há fogo no veículo.',
  'Tive acidente no carro, fiquei inconsciente por alguns instantes.'
 ]){
  const d=incidentFirstSafetyDecision([inc(text)])
  assert.match(d.reply,/socorro|emergência|192|193|190/i,text)
  assert.doesNotMatch(d.reply,/CPF|CNPJ|franquia|valor segurado/i,text)
 }
})

test('cotação hipotética de cobertura de colisão NÃO é sinistro',()=>{
 for(const text of [
  'Quero cotar seguro Auto com colisão e roubo.',
  'Gostaria de saber o preço de seguro para acidente e guincho.',
  'Preciso incluir assistência 24h na cotação do meu seguro.'
 ]){
  assert.equal(isIncidentReport(text),false,text)
  assert.equal(incidentFirstSafetyDecision([inc(text)]),null)
 }
})

test('após segurança confirmada, perguntar apenas a necessidade de assistência',()=>{
 const step=incidentFirstSafetyDecision([inc(original)])
 const follow=incidentFollowupDecision([inc(original),out(step.reply),inc('Sim, estamos em local seguro')])
 assert.match(follow.reply,/precisa de guincho/i)
 assert.doesNotMatch(follow.reply,/CPF|CNPJ|franquia|capital segurado/i)
 const document=incidentFollowupDecision([inc(original),out(step.reply),inc('Sim, estamos em local seguro'),
  out(follow.reply),inc('Não preciso de guincho')])
 assert.match(document.reply,/CPF ou CNPJ do titular/i)
 assert.doesNotMatch(document.reply,/já (?:abri|acionei)|cobertura confirmada/i)
})

test('confirmação simultânea de local seguro e guincho desnecessário reduz perguntas',()=>{
 const msg=[inc(original),out(incidentFirstSafetyDecision([inc(original)]).reply),
  inc('O carro está em local seguro e não preciso de guincho')]
 const d=incidentFollowupDecision(msg)
 assert.match(d.reply,/CPF ou CNPJ/i)
 assert.doesNotMatch(d.reply,/Cobertura garantida/i)
})

test('solicitação de guincho não promete acionamento nem dispensa aceite humano',()=>{
 const initial=incidentFirstSafetyDecision([inc(original)])
 const list=[inc(original),out(initial.reply),inc('Estamos em local seguro'),
  out('Você precisa de guincho ou assistência agora?'),inc('Sim, preciso de guincho')]
 const d=incidentFollowupDecision(list)
 assert.equal(d.humanHandoff,false)
 assert.match(d.reply,/Auto\/RE/i)
 assert.match(d.reply,/não consigo solicitar um guincho|não posso confirmar cobertura/i)
 assert.doesNotMatch(d.reply,/já (?:acionei|solicitei)|guincho encaminhado/i)
})

test('cliente pede humano de Sinistros Auto: handoff legítimo para patrimonio',()=>{
 const history=[inc(original),out(incidentFirstSafetyDecision([inc(original)]).reply),
  inc('Quero falar com um responsável pelo setor de Sinistros Auto')]
 const d=incidentFollowupDecision(history)
 assert.equal(d.agent,'clara')
 assert.equal(d.humanHandoff,true)
 assert.equal(d.handoff.department,'patrimonio')
 assert.match(d.handoff.summary,/colisão\/acidente/i)
 assert.doesNotMatch(d.handoff.summary,/CPF|CNPJ|número da apólice|franquia/i)
 assert.match(d.reply,/não significa que um sinistro ou guincho já tenha sido acionado/i)
})

test('informação da apólice validada: só apresenta seguradora Auto, sem listagem de coberturas',()=>{
 const input=[inc(original),out('Você e o veículo estão em local seguro?'),inc('Sim, estamos seguros'),
  out('Você precisa de guincho?'),inc('Não preciso'),
  out('Pode informar o CPF ou CNPJ do titular?'),inc('111.444.777-35')]
 const d=incidentVerifiedDecision(input,[
  {ramo:'Vida',seguradora:'Operadora Vida',numero:'LIFE-123',premio_total:5000,coberturas:[{nome:'Danos'}]},
  {ramo:'Automóvel',seguradora:'Bradesco',numero:'AUTO-987',premio_total:2000,franquia:4586,coberturas:[{nome:'Colisão',capital_segurado:100000}]}
 ])
 assert.match(d.reply,/Bradesco/)
 assert.match(d.reply,/Auto\/RE/)
 assert.doesNotMatch(d.reply,/Vida|Operadora Vida|4586|100000|Colisão R\$|LIFE|AUTO-987/)
 assert.match(d.reply,/não confirma cobertura/i)
 assert.equal(d.humanHandoff,false)
})

test('mais de uma apólice: não presumir qual veículo nem revelar valores',()=>{
 const list=[
  {ramo:'Auto',seguradora:'Primeira',numero:'ONE',premio_total:1900},
  {ramo:'Frota',seguradora:'Segunda',numero:'TWO',premio_total:3900}
 ]
 const d=incidentVerifiedDecision([inc(original)],list)
 assert.match(d.reply,/mais de uma apólice/i)
 assert.doesNotMatch(d.reply,/Primeira|Segunda|ONE|TWO|1900|3900/)
})

test('sem apólice Auto confirmada: não inventar cobertura nem bloquear orientação humana',()=>{
 const d=incidentVerifiedDecision([inc(original)],[{ramo:'Vida',seguradora:'Fictícia'}])
 assert.match(d.reply,/não encontrei uma apólice de Auto/i)
 assert.match(d.reply,/Auto\/RE/i)
 assert.doesNotMatch(d.reply,/Fictícia|cobertura confirmada/i)
})

test('aceite após oferta de Sinistros Auto retorna destino patrimonio com resumo sem PII',()=>{
 const msg=[inc(original),out('A identidade foi confirmada pela gestão. Posso encaminhar você ao Auto/RE para atendimento de Sinistros Auto?'),inc('Sim')]
 const confirmed=confirmedOfferHandoff(msg,'clara')
 assert.equal(confirmed.humanHandoff,true)
 assert.equal(confirmed.handoff.department,'patrimonio')
 const enriched=enrichConfirmedIncidentHandoff(confirmed,msg)
 assert.match(enriched.handoff.summary,/Sinistros Auto/)
 assert.match(enriched.handoff.summary,/colisão/)
 assert.doesNotMatch(enriched.handoff.summary,/CPF|11144477735|nome completo/i)
})

test('mudança de assunto para boleto não revive o sinistro anterior',()=>{
 const msg=[inc(original),out('Você está em local seguro?'),inc('Sim'),
  out('Tudo bem'),inc('Agora preciso da segunda via do boleto de Saúde')]
 assert.equal(incidentContext(msg),null)
 assert.equal(incidentFollowupDecision(msg),null)
})

test('não repete apresentação nem pergunta de segurança quando a Clara já perguntou',()=>{
 const safety=incidentFirstSafetyDecision([inc(original)])
 const m=[inc(original),out(safety.reply),inc('Sofri uma colisão com meu carro, mas estamos em segurança')]
 assert.equal(incidentFirstSafetyDecision(m),null)
})

test('um documento digitado não é tratado como resposta de guincho',()=>{
 const m=[inc(original),out('Para consultar o seguro, pode informar o CPF ou CNPJ do titular?'),inc('111.444.777-35')]
 assert.equal(incidentFollowupDecision(m),null)
})
