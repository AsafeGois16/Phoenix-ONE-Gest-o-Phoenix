import test from 'node:test'
import assert from 'node:assert/strict'
import {isAutoInsuranceFromVehicleDescription,hasVehicleModelAndYear} from '../server/auto-insurance-product-signal.js'
import {detectSdrQuoteProduct,nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'
import {muriloTransferInvitation} from '../server/murilo-transfer-invitation.js'
import {confirmedOfferHandoff,routeConfirmedMuriloQuote} from '../server/consent-routing.js'
import {respondValidated} from '../api/v1/conversations/respond.js'

const inc=text=>({direction:'inbound',author:'contact',type:'texto',text})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const initial='Olá! Quero renovar o seguro do meu Logan 2021. Minha apólice vence em 15/12/2026.'
const oldOffer='Olá! Sou o Murilo, do time comercial da Phoenix Insurance. Com as informações disponíveis, um consultor pode concluir a avaliação. Posso encaminhar sua solicitação à equipe de Auto/RE?'
const sequence=[
 inc(initial),
 out('Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. 💙 Como posso te chamar?'),
 inc('Asafe Gois')
]
const response=()=>({code:200,data:null,setHeader(){},status(n){this.code=n;return this},json(v){this.data=v;return v}})
const body=messages=>({
 conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20990101-1221',
 agent_hint:'murilo',mode:'sugestao',contact:{kind:'lead'},messages
})
const intro={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:false}}
const active={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}}

test('LOG01: mensagem original do print Logan 2021 é renovação Auto',()=>{
 assert.equal(isAutoInsuranceFromVehicleDescription(initial),true)
 assert.equal(detectSdrQuoteProduct([inc(initial)]),'auto')
})
test('LOG02: Clara preserva Seguro Auto ao oferecer transferência',()=>{
 const reply=muriloTransferInvitation(sequence,{name:'Asafe Gois'})
 assert.match(reply,/cotação de seguro Auto/)
 assert.doesNotMatch(reply,/sua solicitação de cotação|plano de saúde|veículo errado/i)
})
test('LOG03: API integra resposta da Clara após nome em protocolo novo',async()=>{
 const res=response()
 await respondValidated(body(sequence),res,intro)
 assert.equal(res.code,200)
 assert.equal(res.data.agent,'clara')
 assert.match(res.data.reply,/Seguro Auto/i)
 assert.match(res.data.reply,/Murilo/i)
 assert.equal(res.data.humanHandoff,false)
 assert.equal(res.data.handoff,null)
})
test('LOG04: Murilo não deve pedir tipo de seguro de novo',()=>{
 const messages=[
  inc(initial),
  out('Olá! Sou o Murilo, do time comercial da Phoenix Insurance.'),
  inc('Podemos continuar.')
 ]
 const d=nextMuriloSdrDecision(messages)
 assert.equal(d.agent,'murilo')
 assert.equal(d.humanHandoff,false)
 assert.doesNotMatch(d.reply,/qual tipo de seguro você deseja cotar|confirmar o produto/i)
 assert.match(d.reply,/pessoa física|CPF|pessoa jurídica|CNPJ/i)
})
test('LOG05: aceite do cliente conclui cotação Auto para a fila real patrimonio',async()=>{
 const messages=[inc(initial),out('Olá! Sou o Murilo, do time comercial da Phoenix Insurance.'),out(oldOffer),inc('Sim')]
 const raw=confirmedOfferHandoff(messages,'murilo')
 assert.ok(raw)
 const route=routeConfirmedMuriloQuote(raw,messages)
 assert.equal(route.handoff.department,'patrimonio')
 assert.equal(route.handoff.product,'auto')
 assert.equal(route.handoff.intent,'nova_cotacao')
 const res=response()
 await respondValidated(body(messages),res,active)
 assert.equal(res.code,200)
 assert.equal(res.data.agent,'murilo')
 assert.equal(res.data.humanHandoff,true)
 assert.equal(res.data.handoff.department,'patrimonio')
 assert.equal(res.data.handoff.product,'auto')
})
test('LOG06: modelos novos com nomes próprios continuam identificáveis sem catalogar cada um',()=>{
 const samples=[
  'Quero renovar o seguro do meu Dolphin Mini 2025.',
  'Gostaria de cotar o seguro do meu Maverick 2024.',
  'Preciso renovar a apólice do meu Mobi 2021.'
 ]
 for(const sample of samples){
  assert.equal(isAutoInsuranceFromVehicleDescription(sample),true,sample)
  assert.equal(detectSdrQuoteProduct([inc(sample)]),'auto',sample)
 }
})
test('LOG07: só possuir um veículo não autoriza inferir nova cotação',()=>{
 for(const sample of [
  'Tenho um Logan 2021.',
  'O meu Logan é ano 2021.',
  'Quero informações gerais sobre o Logan 2021.'
 ])assert.equal(isAutoInsuranceFromVehicleDescription(sample),false,sample)
})
test('LOG08: renovar outro tipo de seguro com ano não vira Auto',()=>{
 for(const sample of [
  'Quero renovar o seguro do meu apartamento 2021.',
  'Preciso cotar seguro do meu celular 2023.',
  'Gostaria de renovar o seguro da minha casa 2023.',
  'Quero renovar o seguro de Vida para 2027.',
  'Quero cotar seguro do meu equipamento 2022.'
 ]){
  assert.equal(isAutoInsuranceFromVehicleDescription(sample),false,sample)
  assert.notEqual(detectSdrQuoteProduct([inc(sample)]),'auto',sample)
 }
})
test('LOG09: um pedido de cotação de Auto e Vida na mesma mensagem exige esclarecimento',()=>{
 const mixed='Quero renovar o seguro do meu Logan 2021 e contratar seguro de Vida.'
 assert.equal(detectSdrQuoteProduct([inc(mixed)]),null)
})
test('LOG10: continua identificando renovações com marca + modelo e ano',()=>{
 for(const sample of [
  'Quero renovar o seguro do meu Chevrolet Onix 2023.',
  'Quero renovar o seguro do meu Hyundai Creta 2023.',
  'Quero renovar o seguro do meu Renault Sandero 2022.'
 ])assert.equal(detectSdrQuoteProduct([inc(sample)]),'auto',sample)
})

test('LOG11: pergunta de marca/modelo/ano permanece quando cliente só diz carro',()=>{
 assert.equal(isAutoInsuranceFromVehicleDescription('Quero cotar seguro para meu carro.'),true)
 assert.equal(hasVehicleModelAndYear('Quero cotar seguro para meu carro.'),false)
 assert.equal(hasVehicleModelAndYear(initial),true)
 assert.equal(hasVehicleModelAndYear('Quero renovar o seguro do meu Dolphin Mini 2025.'),true)
})
