import test from 'node:test'
import assert from 'node:assert/strict'
import {confirmedOfferHandoff,routeConfirmedMuriloQuote} from '../server/consent-routing.js'
import {nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
const inc=text=>({direction:'inbound',author:'contact',type:'texto',text})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const oldOffer='Com as informações disponíveis, um consultor pode concluir a avaliação. Posso encaminhar sua solicitação à equipe de Vendas da Phoenix?'
const benefitsOffer='Com as informações disponíveis, um consultor pode concluir a avaliação. Posso encaminhar sua solicitação à equipe de Benefícios da Phoenix?'
const autoOffer='Com as informações disponíveis, um consultor pode concluir a avaliação. Posso encaminhar sua solicitação à equipe de Auto/RE?'
const reply=()=>({code:200,data:null,setHeader(){},status(n){this.code=n;return this},json(v){this.data=v;return v}})
const pin={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}}
const body=messages=>({conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20990101-1111',mode:'sugestao',contact:{kind:'lead'},agent_hint:'murilo',messages})
const assertQuote=(messages,department,product)=>{
 const decision=confirmedOfferHandoff(messages,'murilo')
 assert.ok(decision,'Confirmed handoff missing')
 const result=routeConfirmedMuriloQuote(decision,messages)
 assert.equal(result.agent,'murilo')
 assert.equal(result.humanHandoff,true)
 assert.equal(result.handoff.department,department)
 assert.equal(result.handoff.product,product)
 assert.equal(result.handoff.intent,'nova_cotacao')
 assert.equal(result.handoff.reason,decision.handoff.reason)
 assert.equal(result.handoff.summary,decision.handoff.summary)
 return result
}
test('Benefícios: oferta legada de Vendas direciona a fila real beneficios após aceite',()=>{
 const messages=[inc('Olá! Gostaria de cotar um plano de saúde empresarial para 12 vidas.'),out(oldOffer),inc('Sim')]
 const d=assertQuote(messages,'beneficios','saude_empresarial')
 assert.match(d.reply,/equipe de Benefícios/)
})
test('Benefícios: nova oferta de Saúde é explícita e encaminha a fila beneficios',()=>{
 const messages=[inc('Quero cotar plano de saúde para minha família'),out(benefitsOffer),inc('Sim')]
 const d=assertQuote(messages,'beneficios','saude')
 assert.match(d.reply,/equipe de Benefícios/)
})
test('Benefícios: odontológico, vida em grupo, Pet e Previdência têm fila beneficios',()=>{
 const cases=[
  ['Quero cotar um plano Odonto empresarial.','odonto_empresarial'],
  ['Quero cotar Seguro de Vida em grupo.','vida_grupo'],
  ['Quero cotar Seguro Pet.','pet'],
  ['Quero contratar Previdência privada.','previdencia']
 ]
 for(const [input,product] of cases)assertQuote([inc(input),out(benefitsOffer),inc('Sim')],'beneficios',product)
})
test('Auto/RE: oferta de cotação de carro encaminha somente a patrimonio',()=>{
 const messages=[inc('Quero cotar Seguro Auto.'),out(autoOffer),inc('Sim')]
 assertQuote(messages,'patrimonio','auto')
})
test('Consentimento: não cria handoff nem metadado se o cliente recusar ou se ainda não respondeu',()=>{
 const root=[inc('Quero cotar plano de saúde empresarial.'),out(benefitsOffer)]
 assert.equal(confirmedOfferHandoff(root,'murilo'),null)
 assert.equal(confirmedOfferHandoff([...root,inc('Não')],'murilo'),null)
 const proposed={agent:'murilo',humanHandoff:false,handoff:null,reply:benefitsOffer}
 assert.strictEqual(routeConfirmedMuriloQuote(proposed,root),proposed)
})
test('Segurança: não altera transferência operacional da Clara ou pedido do Backoffice',()=>{
 const messages=[inc('Preciso incluir minha filha no meu plano de saúde'),out('Posso encaminhar à equipe de Backoffice?'),inc('Sim')]
 const p={agent:'clara',humanHandoff:true,reply:'Vou solicitar',handoff:{department:'backoffice',reason:'op',summary:'op'}}
 assert.strictEqual(routeConfirmedMuriloQuote(p,messages),p)
 const murilo={...p,agent:'murilo'}
 assert.strictEqual(routeConfirmedMuriloQuote(murilo,messages),murilo)
})
test('Ambiguidade: não inventa produto ou fila para Saúde e Vida juntos',()=>{
 const messages=[inc('Quero cotar plano de saúde e seguro de vida'),out(oldOffer),inc('Sim')]
 const raw=confirmedOfferHandoff(messages,'murilo')
 assert.equal(raw.handoff.department,'comercial')
 const res=routeConfirmedMuriloQuote(raw,messages)
 assert.strictEqual(res,raw)
 assert.equal(res.handoff.product,undefined)
})
test('Mensagem do Murilo: ao terminar perguntas de Saúde indica Benefícios, não Vendas/Comercial',()=>{
 const question='Qual é seu plano atual, caso possua um?'
 const messages=[inc('Quero cotar plano de saúde empresarial para 12 vidas'),out(question),inc('Amil')]
 const decision=nextMuriloSdrDecision(messages,{maxQuestions:0})
 assert.match(decision.reply,/equipe de Benefícios da Phoenix/)
 assert.doesNotMatch(decision.reply,/equipe de Vendas|equipe Comercial/)
 assert.equal(decision.humanHandoff,false)
})
test('API: oferta legada já enviada -> após SIM responde beneficios e intent nova_cotacao',async()=>{
 const messages=[
  inc('Olá! Gostaria de fazer uma cotação de plano de saúde empresarial para 12 vidas.'),
  out('Sou o Murilo, do time comercial da Phoenix Insurance.'),
  out(oldOffer),inc('Sim')
 ]
 const res=reply()
 await respondValidated(body(messages),res,pin)
 assert.equal(res.code,200)
 assert.equal(res.data.strategy,'clara_murilo')
 assert.equal(res.data.agent,'murilo')
 assert.equal(res.data.humanHandoff,true)
 assert.equal(res.data.handoff.department,'beneficios')
 assert.equal(res.data.handoff.intent,'nova_cotacao')
 assert.equal(res.data.handoff.product,'saude_empresarial')
})
test('API: nova oferta explícita encaminha Saúde para Benefícios',async()=>{
 const messages=[inc('Quero cotar plano de saúde.'),out('Sou o Murilo, do time comercial da Phoenix Insurance.'),out(benefitsOffer),inc('Sim')]
 const res=reply()
 await respondValidated(body(messages),res,pin)
 assert.equal(res.code,200)
 assert.equal(res.data.agent,'murilo')
 assert.equal(res.data.humanHandoff,true)
 assert.equal(res.data.handoff.department,'beneficios')
 assert.equal(res.data.handoff.product,'saude')
})
