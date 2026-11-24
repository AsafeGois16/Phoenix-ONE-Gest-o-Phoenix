import test from 'node:test'
import assert from 'node:assert/strict'
import {isAutoInsuranceFromVehicleDescription} from '../server/auto-insurance-product-signal.js'
import {detectSdrQuoteProduct,nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'

const client=text=>({direction:'inbound',author:'contact',text})
test('renovação de Auto reconhecida por modelo sem catálogo fixo',()=>{
 for(const modelo of ['Logan','Creta','Onix','Kwid']){
  const phrase=`Olá! Quero renovar o seguro do meu ${modelo} 2021. Minha apólice vence em 15/12/2026.`
  assert.equal(isAutoInsuranceFromVehicleDescription(phrase),true,modelo)
  assert.equal(detectSdrQuoteProduct([client(phrase),client('Asafe Gois'),client('Sim')]),'auto',modelo)
 }
})
test('ano solto ou renovação sem ramo não implica Auto',()=>{
 assert.equal(isAutoInsuranceFromVehicleDescription('Quero renovar um contrato em 2021'),false)
 assert.equal(isAutoInsuranceFromVehicleDescription('Meu Logan 2021 está na garagem'),false)
})
test('Murilo mantém o produto Auto depois de Clara e nome/aceite',()=>{
 const history=[client('Quero renovar o seguro do meu Logan 2021'),{direction:'outbound',author:'agent',text:'Olá! Sou a Clara. Como posso te chamar?'},client('Asafe Gois'),{direction:'outbound',author:'agent',text:'Posso encaminhar sua cotação de seguro Auto ao Murilo?'},client('Sim')]
 assert.equal(detectSdrQuoteProduct(history),'auto')
 const decision=nextMuriloSdrDecision(history)
 assert.ok(decision)
 assert.doesNotMatch(decision.reply,/qual tipo de seguro você deseja cotar/i)
})
