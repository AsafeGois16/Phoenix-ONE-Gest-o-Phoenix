import test from 'node:test'
import assert from 'node:assert/strict'
import {
 classifyProductIncident,productIncidentContext,productIncidentFirstDecision,
 productIncidentFollowupDecision,productIncidentVerifiedDecision,enrichProductIncidentHandoff
} from '../server/incident-product-routing.js'
import {confirmedOfferHandoff} from '../server/consent-routing.js'

const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const examples=[
 ['S04','roubo_auto','Roubaram meu carro agora e quero acionar o seguro Auto.'],
 ['S05','moto','Sofri uma colisão com a minha moto e quero acionar o seguro.'],
 ['S06','frota','Um dos veículos utilitários da frota da empresa sofreu uma batida.'],
 ['S07','residencial','Minha casa pegou fogo e preciso acionar meu seguro residencial.'],
 ['S08','empresarial','Houve um incêndio na minha empresa e preciso acionar o seguro empresarial.'],
 ['S09','condominio','Um incêndio atingiu o condomínio, precisamos do seguro do prédio.'],
 ['S10','equipamento','Minha máquina de produção sofreu uma pane e ficou danificada.'],
 ['S11','bike','Roubaram minha bicicleta e preciso acionar o Seguro Bike.'],
 ['S15','saude','Preciso de internação urgente pelo meu plano de saúde.'],
 ['S16','odonto','Minha filha sofreu um trauma dentário e precisa de urgência odontológica.'],
 ['S18','acidentes_pessoais','Sofri um acidente e preciso acionar Acidentes Pessoais com DIT.'],
 ['S19','viagem','Minha mala foi extraviada na viagem e quero acionar o seguro viagem.'],
 ['S20','pet','Meu cachorro ficou doente e preciso de atendimento veterinário urgente pelo seguro Pet.']
]
test('classificador cobre exatamente os treze cenários reportados',()=>{
 for(const [id,kind,msg] of examples)assert.equal(classifyProductIncident(msg),kind,id)
})
test('segurança e urgência S04/S07/S08/S09/S15 precedem CPF/CNPJ e produto',()=>{
 const expected={
  S04:/190|policia/i,
  S07:/sai[aá]|193|bombeiros/i,
  S08:/evacue|193|bombeiros/i,
  S09:/193|bombeiros|afaste/i,
  S15:/qual e a situacao clinica|qual é a situação clínica/i
 }
 for(const [id,,msg] of examples.filter(v=>expected[v[0]])){
  const d=productIncidentFirstDecision([inc(msg)])
  assert.ok(d,id)
  assert.equal(d.agent,'clara',id)
  assert.equal(d.humanHandoff,false,id)
  assert.match(d.reply,expected[id],id)
  assert.doesNotMatch(d.reply,/CPF|CNPJ|franquia|preço|cobertura garantida/i,id)
 }
})
test('S04: carro roubado NÃO pergunta se o VEÍCULO está em local seguro',()=>{
 const d=productIncidentFirstDecision([inc(examples[0][2])])
 assert.match(d.reply,/você está em segurança/i)
 assert.doesNotMatch(d.reply,/ve[ií]culo est[aá] em local seguro|carro est[aá] seguro/i)
 assert.match(d.reply,/190/)
})
test('S07: incêndio Residencial orienta saída, não retorno e Bombeiros',()=>{
 const d=productIncidentFirstDecision([inc(examples[3][2])])
 assert.match(d.reply,/saia do im[oó]vel/i)
 assert.match(d.reply,/n[aã]o retorne/i)
 assert.match(d.reply,/193/)
})
test('S08/S09: Empresarial e Condomínio exigem checagem das pessoas antes da fila',()=>{
 for(const id of ['S08','S09']){
  const msg=examples.find(x=>x[0]===id)[2]
  const first=productIncidentFirstDecision([inc(msg)])
  assert.match(first.reply,/seguran[cç]a/i)
  assert.equal(first.humanHandoff,false)
  const again=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Sim, todos em segurança')])
  assert.match(again.reply,/CPF ou CNPJ/i)
  assert.equal(again.humanHandoff,false)
 }
})
test('S15: urgência Saúde identifica situação clínica antes da consulta, sem atrasar SAMU',()=>{
 const msg=examples.find(x=>x[0]==='S15')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/situa[cç][aã]o cl[ií]nica/i)
 assert.match(first.reply,/192/)
 const after=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Preciso de avaliação para internação, não há risco à vida agora')])
 assert.match(after.reply,/CPF ou CNPJ/i)
 assert.doesNotMatch(after.reply,/internação autorizada|cobertura confirmada/i)
 const urgent=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Ela está com falta de ar e dor no peito')])
 assert.match(urgent.reply,/192|pronto-socorro/i)
 assert.doesNotMatch(urgent.reply,/CPF|CNPJ/i)
})
test('S05: Moto pergunta por ferimentos; S11: Bike nunca pede dados de automóvel',()=>{
 for(const id of ['S05','S11']){
  const msg=examples.find(x=>x[0]===id)[2]
  const reply=productIncidentFirstDecision([inc(msg)]).reply
  assert.match(reply,/feri|atendimento m[eé]dico/i,id)
  if(id==='S11')assert.doesNotMatch(reply,/carro|autom[oó]vel|modelo do carro|guincho/i)
  const progress=productIncidentFollowupDecision([inc(msg),out(reply),inc('Não')])
  assert.match(progress.reply,/CPF ou CNPJ/i,id)
  assert.doesNotMatch(progress.reply,/placa|autom[oó]vel|modelo do carro/i,id)
 }
})
test('S06: Frota pergunta pela unidade afetada antes do documento, sem exigir placa',()=>{
 const msg=examples.find(x=>x[0]==='S06')[2]
 const risk=productIncidentFirstDecision([inc(msg)])
 assert.match(risk.reply,/feridos|risco imediato/i)
 const unit=productIncidentFollowupDecision([inc(msg),out(risk.reply),inc('Não, ninguém ficou ferido')])
 assert.match(unit.reply,/qual ve[ií]culo ou unidade/i)
 assert.match(unit.reply,/sem precisar compartilhar a placa completa/i)
 assert.doesNotMatch(unit.reply,/placa obrigat[oó]ria|informe a placa completa/i)
 const identity=productIncidentFollowupDecision([inc(msg),out(risk.reply),inc('Não, ninguém ficou ferido'),out(unit.reply),inc('Foi a unidade 3 da frota')])
 assert.match(identity.reply,/CPF ou CNPJ/i)
})
test('S10: Equipamentos verifica risco elétrico/incêndio e não trata como carro',()=>{
 const msg=examples.find(x=>x[0]==='S10')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/choque|inc[eê]ndio|ferimentos/i)
 assert.doesNotMatch(first.reply,/carro|guincho|placa/i)
 const continued=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Não')])
 assert.match(continued.reply,/CPF ou CNPJ/i)
})
test('S16: Odonto identifica risco imediato; depois confirma titular',()=>{
 const msg=examples.find(x=>x[0]==='S16')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/sangramento intenso|risco imediato/i)
 const doc=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Não')])
 assert.match(doc.reply,/CPF ou CNPJ/i)
 assert.doesNotMatch(doc.reply,/procedimento autorizado|car[eê]ncia/i)
})
test('S18: Acidentes Pessoais pergunta por condições médicas e não presume DIT',()=>{
 const msg=examples.find(x=>x[0]==='S18')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/atendimento m[eé]dico urgente/i)
 const doc=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Não')])
 assert.match(doc.reply,/CPF ou CNPJ/i)
 const confirmed=productIncidentVerifiedDecision([inc(msg),inc('Não'),inc('Documento fornecido')],[{ramo:'Vida',seguradora:'Simulada'}])
 assert.match(confirmed.reply,/Di[aá]ria por Incapacidade Tempor[aá]ria.*DIT/i)
 assert.match(confirmed.reply,/sem presumir que esteja contratada/i)
 assert.doesNotMatch(confirmed.reply,/cobertura DIT confirmada|di[aá]ria aprovada/i)
})
test('S19: Viagem só fala sobre contrato após verificação no Junior',()=>{
 const msg=examples.find(x=>x[0]==='S19')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/CPF ou CNPJ/i)
 assert.doesNotMatch(first.reply,/ap[oó]lice ativa confirmada|cobertura dispon[ií]vel/i)
 const after=productIncidentVerifiedDecision([inc(msg)],[{ramo:'Viagem',seguradora:'Simulada'}])
 assert.match(after.reply,/identidade foi confirmada/i)
 assert.match(after.reply,/contrato da categoria/i)
 assert.doesNotMatch(after.reply,/garantida|indeniza[cç][aã]o aprovada/i)
})
test('S20: Pet verifica urgência veterinária e identidade para consulta',()=>{
 const msg=examples.find(x=>x[0]==='S20')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 assert.match(first.reply,/atendimento veterin[aá]rio imediato/i)
 const nonurgent=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Não')])
 assert.match(nonurgent.reply,/CPF ou CNPJ/i)
 const urgent=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Sim, ele está muito mal')])
 assert.match(urgent.reply,/veterin[aá]ri[oa] de emerg[eê]ncia/i)
 assert.doesNotMatch(urgent.reply,/CPF|CNPJ/i)
})
test('pessoa em risco no incêndio não recebe solicitação de CPF ou apólice',()=>{
 const msg=examples.find(x=>x[0]==='S07')[2]
 const first=productIncidentFirstDecision([inc(msg)])
 const next=productIncidentFollowupDecision([inc(msg),out(first.reply),inc('Não, ainda estamos dentro e há fogo')])
 assert.match(next.reply,/perigo|seguran[cç]a|193/i)
 assert.doesNotMatch(next.reply,/CPF|CNPJ|contrato/i)
})
test('não sequestrar cotações e hipóteses de cobertura',()=>{
 const list=[
 'Quero cotar seguro Residencial com cobertura de incêndio.',
 'Quero cotação de Auto contra roubo e furto.',
 'Qual o preço do seguro Bike?',
 'Gostaria de contratar Seguro Pet para meu gato.',
 'Qual cobertura de DIT em cotação de seguro de vida?',
 'Quero incluir assistência funeral na cotação de Vida.',
 'Se ocorrer um incêndio na empresa, o seguro cobre?'
 ]
 for(const text of list)assert.equal(classifyProductIncident(text),null,text)
})
test('resposta posterior preserva contexto do mesmo protocolo, sem ressuscitar após outro assunto',()=>{
 const msg=examples[3][2]
 assert.equal(productIncidentContext([inc(msg),out('Todos estão seguros?'),inc('Sim')]).kind,'residencial')
 assert.equal(productIncidentContext([inc(msg),out('Pode informar CPF?'),inc('Agora tenho outra dúvida, quero cotar seguro Auto')]),null)
})
test('contratos e capitais não são inventados nem expostos antes de verified',()=>{
 for(const [id,kind,msg] of examples){
  const d=productIncidentVerifiedDecision([inc(msg)],[{ramo:'Vida',numero:'AP-123',premio:12345,seguradora:'Teste'}])
  assert.equal(d.agent,'clara',id)
  assert.equal(d.humanHandoff,false,id)
  assert.match(d.reply,/identidade foi confirmada/i,id)
  assert.doesNotMatch(d.reply,/AP-123|12345|cobertura confirmada|sinistro registrado/i,id)
 }
})
test('consentimento de cada ramo envia fila compatível, sem CPF ou promessas de sinistro aberto',()=>{
 for(const [id,kind,msg] of examples){
  const first=productIncidentVerifiedDecision([inc(msg)],[{ramo:kind,seguradora:'Operadora Teste'}])
  const messages=[inc(msg),out(first.reply),inc('Sim')]
  const confirmed=confirmedOfferHandoff(messages,'clara')
  assert.ok(confirmed,id)
  const final=enrichProductIncidentHandoff(confirmed,messages)
  assert.equal(final.humanHandoff,true,id)
  assert.equal(final.handoff.department,productIncidentContext(messages).profile.department,id)
  assert.doesNotMatch(JSON.stringify(final.handoff),/CPF|CNPJ|placa|documento do cliente|sinistro aberto/i,id)
 }
})
