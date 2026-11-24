import test from 'node:test'
import assert from 'node:assert/strict'
import {approvedQuestionsFor} from '../server/murilo-approved-questions.js'
import {nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'

const c=text=>({direction:'inbound',author:'contact',text})
const a=text=>({direction:'outbound',author:'agent',text})
test('renovação Auto inclui identificação e placa sem repetir vencimento inicial',()=>{
 const opening='Olá! Quero renovar o seguro do meu carro Onix 2021. Minha apólice vence em 15/12/2026.'
 let history=[c(opening),a('Olá! Sou a Clara, concierge. Como posso te chamar?'),c('Asafe Gois'),
 a('Posso encaminhar sua cotação de seguro Auto ao Murilo?'),c('Sim'),
 a('O veículo está no nome de pessoa física (CPF) ou jurídica (CNPJ)?'),c('CPF')]
 let step=nextMuriloSdrDecision(history)
 assert.match(step.reply,/número do CPF ou CNPJ/i)
 history.push(a(step.reply),c('123.456.789-09'))
 step=nextMuriloSdrDecision(history)
 assert.match(step.reply,/placa do veículo/i)
 history.push(a(step.reply),c('ABC1D23'))
 step=nextMuriloSdrDecision(history)
 assert.match(step.reply,/seguradora atual/i)
 history.push(a(step.reply),c('Suhai'))
 step=nextMuriloSdrDecision(history)
 assert.doesNotMatch(step.reply,/qual é a data de vencimento da apólice/i)
})
test('CPF e placa aparecem em novo e renovação, sem duplicar a placa',()=>{
 for(const renewal of [true,false]){
  const questions=approvedQuestionsFor('auto',{type:'cpf',renewal}).map(q=>q.text)
  assert.equal(questions.filter(q=>/placa do veículo/i.test(q)).length,1)
  assert.equal(questions.filter(q=>/número do CPF ou CNPJ/i.test(q)).length,1)
 }
})
