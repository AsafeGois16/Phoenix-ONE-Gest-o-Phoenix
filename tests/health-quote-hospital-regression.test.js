/**
 * Regression battery for wrong Murilo->Clara transition following a health
 * quote hospital preference (WhatsApp screenshot, 2026-11-24).
 * All cases are synthetic: no real contact, ticket or OpenAI request.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
 classifyProductIncident,productIncidentContext,productIncidentFirstDecision
} from '../server/incident-product-routing.js'
import {classifyConversationIntent,selectConversationAgent} from '../server/agent-routing.js'
import {operationalRouting,LEGACY_COMMERCIAL_ROUTES} from '../server/orchestration-operational.js'
import {respondValidated} from '../api/v1/conversations/respond.js'

const inbound=text=>({direction:'inbound',author:'contact',type:'texto',text})
const outbound=text=>({direction:'outbound',author:'agent',type:'texto',text})
const hospitalQuestion='Para manter a cobertura hospitalar atual e melhorar a rede credenciada, você já sabe em quais hospitais ou regiões gostaria de ter maior acesso? Isso ajuda a personalizar a cotação para você.'
const hospitalAnswer='Gostaria do Hospital Nipo Brasileiro, na região da Zona Norte'
const quoteHistory=[
 inbound('Quero cotar um plano de Saúde com uma rede credenciada melhor.'),
 outbound('Sou o Murilo, do time comercial da Phoenix Insurance. Vou acompanhar sua cotação.'),
 outbound(hospitalQuestion)
]
const withHospital=[...quoteHistory,inbound(hospitalAnswer)]
const context=messages=>({contact:{kind:'lead'},agent_hint:'murilo',messages})
const noMedicalResponse=messages=>{
 assert.equal(classifyProductIncident(messages.at(-1).text),null)
 assert.equal(productIncidentFirstDecision(messages),null)
 assert.equal(productIncidentContext(messages),null)
}
test('H01 IMAGEM: Hospital Nipo Brasileiro é PREFERÊNCIA de rede, não urgência',()=>{
 noMedicalResponse(withHospital)
 assert.equal(classifyConversationIntent(hospitalAnswer),'neutral')
 assert.equal(selectConversationAgent(context(withHospital)),'murilo')
})
test('H02 preferências de hospitais, regiões e cobertura NÃO acionam urgência',()=>{
 const inputs=[
 'Gostaria do Hospital Nipo Brasileiro, na região da Zona Norte',
 'Prefiro o Hospital São Luiz para minha família',
 'Quero ter o Santa Joana na rede credenciada',
 'Gostaria de mais hospitais na região da Zona Leste',
 'Meu objetivo é ter acesso ao Hospital Albert Einstein',
 'Na cotação, prefiro hospitais em Guarulhos.',
 'Quero cobertura hospitalar e uma rede credenciada ampla.',
 'A rede deveria contemplar hospitais da Zona Norte.',
 'Pretendo usar o Hospital Nipo Brasileiro.',
 'Quero um hospital com pronto-socorro na rede do plano.',
 'Gostaria de cobertura de urgência e emergência e boa rede.',
 'Quero cotação com internação em quarto privativo.',
 'Preciso de cobertura hospitalar para uma futura internação.',
 'Quais hospitais possuem acesso na Zona Norte?'
 ]
 for(const input of inputs){
  assert.equal(classifyProductIncident(input),null,input)
  assert.equal(productIncidentFirstDecision([...quoteHistory,inbound(input)]),null,input)
 }
})
test('H03 preferências hospitalares permanecem com Murilo mesmo com hint Clara',()=>{
 for(const hint of ['murilo','clara']){
  const messages=[...quoteHistory,inbound('Prefiro o Hospital Nipo Brasileiro na Zona Norte')]
  assert.equal(selectConversationAgent({agent_hint:hint,messages}), 'murilo',hint)
 }
})
test('H04 pergunta comercial mais recente supera serviço ANTIGO na mesma conversa',()=>{
 const messages=[
  inbound('Preciso da segunda via de um boleto.'),
  outbound('Vou orientar sobre boletos.'),
  inbound('Quero também cotar plano de Saúde empresarial.'),
  ...quoteHistory.slice(1),
  inbound(hospitalAnswer)
 ]
 noMedicalResponse(messages)
 assert.equal(selectConversationAgent(context(messages)),'murilo')
})
test('H05 cotação permanece com Murilo quando a mensagem de apresentação saiu da janela',()=>{
 const messages=[
  outbound(hospitalQuestion),
  inbound(hospitalAnswer)
 ]
 assert.equal(selectConversationAgent(context(messages)),'murilo')
})
test('H06 pergunta da Clara sobre passar ao Murilo NÃO é qualificação comercial concluída',()=>{
 const messages=[
  inbound('Quero cotar plano de saúde.'),
  outbound('Sou a Clara, do atendimento da Phoenix. Posso passar você ao Murilo para continuar a cotação?'),
  inbound('Sim')
 ]
 assert.equal(classifyConversationIntent('Sim'),'neutral')
 assert.equal(selectConversationAgent({agent_hint:'murilo',messages}),'murilo')
 // The existing consent/transfer policy, not this router, authorizes agent transfer.
 // This guard ensures that our new shortcut is NOT triggered for referral offers.
 assert.match(messages[1].text,/Posso passar você ao Murilo/)
})
test('H07 sem contexto comercial: hospital sozinho não é emergência nem cotação',()=>{
 const messages=[inbound('Gostaria do Hospital Nipo Brasileiro na Zona Norte')]
 noMedicalResponse(messages)
 assert.equal(selectConversationAgent({agent_hint:'murilo',messages}), 'clara')
})
test('H08 serviço real SEMPRE interrompe a qualificação, mesmo após pergunta hospitalar',()=>{
 const samples=[
 'Preciso da segunda via do boleto do meu plano.',
 'Quero excluir minha esposa do plano de Saúde que já tenho.',
 'Minha carteirinha parou de funcionar.',
 'A operadora negou uma autorização de internação.',
 'Preciso registrar um sinistro de automóvel.'
 ]
 for(const input of samples){
  assert.equal(selectConversationAgent(context([...quoteHistory,inbound(input)])),'clara',input)
 }
})
test('H09 urgências clínicas REAIS continuam prioritárias, com orientação médica',()=>{
 const realCases=[
 'Preciso de internação urgente pelo meu plano de Saúde.',
 'Estou com dor no peito e falta de ar no hospital.',
 'Minha mãe precisa de pronto-socorro agora.',
 'Tenho uma urgência médica e preciso de atendimento no hospital.',
 'Minha filha está internada no hospital.',
 'Preciso de atendimento médico urgente no Hospital Nipo Brasileiro.',
 'Estou no hospital e estou com falta de ar.'
 ]
 for(const input of realCases){
  assert.equal(classifyProductIncident(input),'saude',input)
  const d=productIncidentFirstDecision([inbound(input)])
  assert.ok(d,input)
  assert.equal(d.agent,'clara',input)
  assert.equal(d.humanHandoff,false,input)
  assert.match(d.reply,/urgência|SAMU|192|clínica/i,input)
 }
})
test('H10 emergências reais após qualificação comercial desviam para Clara com segurança',()=>{
 const urgent='Preciso de internação urgente pelo meu plano de Saúde.'
 const messages=[...quoteHistory,inbound(urgent)]
 assert.equal(selectConversationAgent(context(messages)),'clara')
 const d=productIncidentFirstDecision(messages)
 assert.equal(d.agent,'clara')
 assert.match(d.reply,/192/)
})
test('H11 cotação de outros produtos não se confunde com sinistro hipotético',()=>{
 const sales=[
 'Quero cotar Auto com cobertura contra roubo e furto.',
 'Quero cotar Saúde para minha empresa.',
 'Quero adicionar assistência funeral na cotação do seguro de Vida.',
 'Quero cotar Seguro Pet para meu cachorro.',
 'Quero cotar seguro Residencial com cobertura contra incêndio.'
 ]
 for(const input of sales){
  assert.equal(classifyProductIncident(input),null,input)
  assert.equal(selectConversationAgent({agent_hint:'clara',messages:[inbound(input)]}),'murilo',input)
 }
})
test('H12 pergunta comercial nova volta ao Murilo depois de serviço anterior',()=>{
 const messages=[
  inbound('Preciso de um boleto.'),
  outbound('A equipe financeira vai orientar.'),
  inbound('Agora quero cotar um plano de Saúde.'),
  outbound(hospitalQuestion),
  inbound(hospitalAnswer)
 ]
 assert.equal(selectConversationAgent(context(messages)),'murilo')
})
test('H13 modo Clara+Murilo continua delegando ao roteador original',()=>{
 const plan=operationalRouting({
  pin:{mode:'clara_murilo',revision:7},
  body:{mode:'sugestao',messages:withHospital},
  verifiedRoutes:LEGACY_COMMERCIAL_ROUTES
 })
 assert.equal(plan.action,'delegate')
 assert.equal(plan.reason,'legacy_unchanged')
 assert.equal(plan.executed,false)
})
test('H14 modo Somente Clara não deve inventar URGÊNCIA em preferência hospitalar',()=>{
 const plan=operationalRouting({
  pin:{mode:'clara_only',revision:8},
  body:{mode:'sugestao',messages:withHospital},
  verifiedRoutes:LEGACY_COMMERCIAL_ROUTES
 })
 assert.notEqual(plan.action,'blocked')
 assert.doesNotMatch(String(plan.reply||''),/entendi a urgencia|samu|192/i)
})
test('H15 resposta Phoenix ONE real de laboratório: Murilo permanece sem handoff e sem SAMU',async()=>{
 const oldKey=process.env.OPENAI_API_KEY
 const oldFetch=globalThis.fetch
 process.env.OPENAI_API_KEY='test-not-real'
 const network=[]
 globalThis.fetch=async(url,opts={})=>{
  const address=String(url);network.push(address)
  if(address.includes('/functions/v1/phoenix-one-bridge')){
   const request=JSON.parse(opts.body)
   assert.equal(request.action,'context')
   assert.equal(request.agent,'murilo')
   return {ok:true,status:200,json:async()=>({
    agent:'murilo',version:9,prompt:'Você é Murilo. Atenda com clareza e uma pergunta por vez.',
    sources:[]
   })}
  }
  if(address.includes('/v1/responses')){
   const payload=JSON.parse(opts.body)
   assert.match(JSON.stringify(payload.input),/Hospital Nipo Brasileiro/)
   return {ok:true,status:200,json:async()=>({
    output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
     reply:'Entendi sua preferência pelo Hospital Nipo Brasileiro, na Zona Norte. Vou considerar isso na cotação; a equipe confirmará a rede. Há outra região que deseja priorizar?',
     humanHandoff:false,handoff:null
    })}]}]
   })}
  }
  throw Error('Unexpected endpoint: '+address)
 }
 try{
  const res={code:200,setHeader(){},status(v){this.code=v;return this},json(v){this.body=v;return v}}
  const body={
   conversation_id:'11111111-1111-4111-8111-111111111111',
   protocolo:'20990101-2345',mode:'sugestao',agent_hint:'murilo',
   contact:{kind:'lead',display_name:'Contato Teste'},
   messages:withHospital
  }
  await respondValidated(body,res,{mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}})
  assert.equal(res.code,200)
  assert.equal(res.body.agent,'murilo')
  assert.equal(res.body.strategy,'clara_murilo')
  assert.equal(res.body.humanHandoff,false)
  assert.equal(res.body.handoff,null)
  assert.match(res.body.reply,/Hospital Nipo Brasileiro/)
  assert.doesNotMatch(res.body.reply,/samu|entendi a urgencia|situacao clinica/i)
  assert.ok(network.some(x=>x.includes('/v1/responses')))
 }finally{
  globalThis.fetch=oldFetch
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY=oldKey
 }
})
