import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyProductIncident,productIncidentContext,productIncidentFirstDecision,
 productIncidentFollowupDecision,productIncidentVerifiedDecision,enrichProductIncidentHandoff} from '../server/incident-product-routing.js'
import {routeBenefitsToBackoffice} from '../server/benefits-handoff-routing.js'
import {confirmedOfferHandoff} from '../server/consent-routing.js'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const cases=[
 ['S15','saude','Preciso de internação urgente pelo meu plano de saúde.'],
 ['S16','odonto','Minha filha sofreu trauma dentário, precisa de urgência odontológica.'],
 ['S18','acidentes_pessoais','Sofri um acidente e preciso acionar Acidentes Pessoais com DIT.'],
 ['S19','viagem','Minha mala foi extraviada e quero acionar o seguro viagem.'],
 ['S20','pet','Meu pet ficou doente e precisa de atendimento veterinário urgente.'],
 ['P01','saude_servico','Minha operadora negou a autorização de um exame no plano de saúde.'],
 ['P02','odonto_servico','Tenho um problema de reembolso no meu plano odontológico.'],
 ['P03','vida','Meu esposo faleceu e preciso acionar o Seguro de Vida.'],
 ['P04','previdencia_servico','Tenho um problema com minha previdência e não consigo fazer o resgate.']
]
test('todos os nove serviços de Benefícios chegam ao Backoffice, sem mudar o ramo',()=>{
 for(const [id,kind,msg] of cases){
  assert.equal(classifyProductIncident(msg),kind,id)
  const ctx=productIncidentContext([inc(msg)])
  assert.equal(ctx.profile.department,'backoffice',id)
  assert.equal(ctx.profile.team,'Backoffice',id)
  const first=productIncidentFirstDecision([inc(msg)])
  assert.equal(first.agent,'clara',id)
  assert.equal(first.humanHandoff,false,id)
  assert.doesNotMatch(first.reply,/setor de Benefícios|equipe de Benefícios/i,id)
 }
})
test('Saúde: sinais de emergência orientam SAMU antes de exigir documento; destino é Backoffice',()=>{
 const msg='Preciso de internação urgente no meu plano de saúde.'
 const d1=productIncidentFirstDecision([inc(msg)])
 assert.match(d1.reply,/situação clínica/i)
 assert.match(d1.reply,/192/)
 assert.doesNotMatch(d1.reply,/CPF|CNPJ/i)
 const d2=productIncidentFollowupDecision([inc(msg),out(d1.reply),inc('Está com dor no peito e falta de ar')])
 assert.match(d2.reply,/192|pronto-socorro/i)
 assert.match(d2.reply,/Backoffice/i)
 assert.doesNotMatch(d2.reply,/CPF|CNPJ|equipe de Benefícios/i)
 const approved=confirmedOfferHandoff([inc(msg),out(d2.reply),inc('Sim')],'clara')
 assert.equal(approved.handoff.department,'backoffice')
})
test('Vida: atendimento acolhedor, valida identidade e só encaminha após aceite',()=>{
 const msg='Meu pai faleceu, preciso acionar o seguro de vida.'
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/sinto muito/i)
 assert.match(first.reply,/CPF ou CNPJ/i)
 assert.doesNotMatch(first.reply,/documentos obrigatórios|indenização aprovada/i)
 const verified=productIncidentVerifiedDecision([inc(msg)],[{ramo:'Vida',seguradora:'Teste'}])
 assert.match(verified.reply,/identidade foi confirmada/i)
 assert.match(verified.reply,/Backoffice/i)
 assert.equal(verified.humanHandoff,false)
 const yes=[inc(msg),out(verified.reply),inc('Sim')]
 const decision=confirmedOfferHandoff(yes,'clara')
 const enriched=enrichProductIncidentHandoff(decision,yes)
 assert.equal(enriched.humanHandoff,true)
 assert.equal(enriched.handoff.department,'backoffice')
 assert.match(enriched.handoff.summary,/Vida/)
 assert.doesNotMatch(JSON.stringify(enriched.handoff),/CPF|CNPJ|apólice número/i)
})
test('problemas de Saúde e Odonto não recebem triagem de acidente quando não há urgência',()=>{
 for(const [,,msg] of cases.filter(([id])=>['P01','P02'].includes(id))){
  const d=productIncidentFirstDecision([inc(msg)])
  assert.match(d.reply,/CPF ou CNPJ/i)
  assert.match(d.reply,/Backoffice/i)
  assert.doesNotMatch(d.reply,/SAMU|Bombeiros|primeiro, você está em segurança/i)
 }
})
test('seguro Viagem/Acidentes Pessoais e Pet continuam com destinos Backoffice após validação',()=>{
 for(const [id,,msg] of cases.filter(([id])=>['S18','S19','S20'].includes(id))){
  const verified=productIncidentVerifiedDecision([inc(msg)],[])
  assert.match(verified.reply,/Backoffice/,id)
  assert.equal(verified.humanHandoff,false,id)
  const approved=confirmedOfferHandoff([inc(msg),out(verified.reply),inc('Sim')],'clara')
  assert.equal(approved.handoff.department,'backoffice',id)
 }
})
test('sem mudanças para Auto/RE, Frota e sinistro patrimonial',()=>{
 for(const msg of [
  'Meu carro foi roubado, quero acionar seguro Auto.',
  'Minha casa pegou fogo e preciso acionar residencial.',
  'Um veículo da frota da empresa bateu.'
 ]){
  const ctx=productIncidentContext([inc(msg)])
  assert.equal(ctx.profile.department,'patrimonio',msg)
 }
})
test('sem mudanças para cotações Murilo, inclusão/exclusão e boleto financeiro',()=>{
 for(const msg of [
  'Quero fazer cotação de Seguro de Vida com assistência funeral.',
  'Quero cotar plano de Saúde empresarial.',
  'Quero simular um plano odontológico.',
  'Preciso incluir dependente no plano de Saúde.',
  'Quero excluir minha esposa do plano odontológico.',
  'Preciso da segunda via do boleto do plano de Saúde.'
 ])assert.equal(classifyProductIncident(msg),null,msg)
})
test('resposta legada mencionando Benefícios é reescrita para Backoffice antes de pedir aceite',()=>{
 const hist=[inc('A operadora negou minha autorização no plano de saúde.')]
 const decision=routeBenefitsToBackoffice({agent:'clara',
  reply:'Posso encaminhar você à equipe de Benefícios?',
  humanHandoff:false,handoff:null},hist)
 assert.match(decision.reply,/Backoffice/i)
 assert.doesNotMatch(decision.reply,/equipe de Benefícios/i)
 const confirmed=confirmedOfferHandoff([...hist,out(decision.reply),inc('Sim')],'clara')
 assert.equal(confirmed.handoff.department,'backoffice')
})
test('handoff legado já aceito, com departamento beneficios, é normalizado sem inventar execução',()=>{
 const msgs=[inc('Tenho problema com meu seguro de vida e preciso falar com humano')]
 const old={agent:'clara',reply:'Vou solicitar seu encaminhamento à equipe de Benefícios.',
  humanHandoff:true,handoff:{department:'beneficios',reason:'Cliente solicitou atendimento humano',summary:'Dúvida de Seguro de Vida sem documento no resumo.'}}
 const result=routeBenefitsToBackoffice(old,msgs)
 assert.equal(result.humanHandoff,true)
 assert.equal(result.handoff.department,'backoffice')
 assert.match(result.reply,/Backoffice/)
 assert.doesNotMatch(JSON.stringify(result.handoff),/CPF|CNPJ/i)
})
test('não redirecionar textos comerciais e a integração de áudio do Junior',()=>{
 const history=[inc('Quero cotar seguro Auto contra colisão')]
 const payload={agent:'murilo',reply:'Posso apresentar opções?',humanHandoff:false,handoff:null}
 assert.deepEqual(routeBenefitsToBackoffice(payload,history),payload)
 const auto={agent:'clara',reply:'Posso encaminhar ao Auto/RE?',humanHandoff:true,
  handoff:{department:'patrimonio',reason:'Sinistro Auto',summary:'Colisão'} }
 assert.deepEqual(routeBenefitsToBackoffice(auto,[inc('Sofri uma colisão Auto')]),auto)
})
