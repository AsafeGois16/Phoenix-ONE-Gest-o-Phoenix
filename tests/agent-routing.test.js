import test from 'node:test'
import assert from 'node:assert/strict'
import {selectConversationAgent,classifyConversationIntent} from '../server/agent-routing.js'

const msg = text=>({direction:'inbound',author:'contact',type:'text',text})
const request = (text,{kind='desconhecido',hint='murilo',history=[]}={})=>({
  agent_hint:hint,contact:{kind},messages:[...history.map(msg),msg(text)]
})

test('saudação de telefone desconhecido sempre inicia com Clara',()=>{
  assert.equal(selectConversationAgent(request('Oi')),'clara')
  assert.equal(selectConversationAgent(request('Bom dia',{kind:'lead'})),'clara')
  assert.equal(selectConversationAgent(request('Tudo bem?',{hint:'murilo'})),'clara')
})
test('segunda via do boleto corrige um hint Murilo enviado pela gestão',()=>{
  assert.equal(selectConversationAgent(request('Preciso da 2 via do meu boleto')),'clara')
  assert.equal(selectConversationAgent(request('Preciso da 2 vida do meu boleto')),'clara')
  assert.equal(selectConversationAgent(request('Preciso da segunda via',{kind:'lead'})),'clara')
  assert.equal(selectConversationAgent(request('Quero cotação da segunda via do boleto')),'clara')
})
test('serviços do cliente continuam com Clara, mesmo desconhecido',()=>{
  for(const input of ['Preciso incluir minha esposa no plano','Quero a carteirinha','Minha apólice venceu','Quero solicitar reembolso','Preciso de assistência','Tenho uma fatura em aberto','Quero cancelar meu plano']){
    assert.equal(selectConversationAgent(request(input)), 'clara',input)
  }
})
test('Murilo é acionado exclusivamente por interesse comercial explícito',()=>{
  for(const input of ['Gostaria de fazer uma cotação de seguro auto','Quero contratar um seguro de vida','Preciso de um orçamento de seguro empresarial','Quanto custa um seguro residencial?']){
    assert.equal(selectConversationAgent(request(input,{kind:'desconhecido',hint:'clara'})), 'murilo',input)
  }
})
test('dúvidas informativas sem intenção comercial começam com Clara',()=>{
 assert.equal(selectConversationAgent(request('Como funciona um seguro de vida?')),'clara')
 assert.equal(selectConversationAgent(request('Vocês trabalham com seguro de vida?')),'clara')
})
test('mensagens curtas de continuidade mantêm a intenção demonstrada no mesmo protocolo',()=>{
 assert.equal(selectConversationAgent(request('Claro',{history:['Oi','Preciso da 2 via do meu boleto']})),'clara')
 assert.equal(selectConversationAgent(request('Sim',{history:['Oi','Quero fazer uma cotação de auto']})),'murilo')
 assert.equal(selectConversationAgent(request('Sim',{history:['Oi']})),'clara')
})
test('última intenção de serviço tem precedência sobre passado comercial',()=>{
 assert.equal(selectConversationAgent(request('Preciso pagar um boleto',{history:['Quero cotar seguro de vida']})),'clara')
})
test('classificador retorna intent correto',()=>{
 assert.equal(classifyConversationIntent('Oi'),'neutral')
 assert.equal(classifyConversationIntent('Segunda via boleto'),'service')
 assert.equal(classifyConversationIntent('Quero contratar seguro'),'sales')
})

test('clientes pedindo lista de seus seguros continuam com Clara mesmo após Murilo',()=>{
 assert.equal(selectConversationAgent(request('Quais seguros eu tenho?',{history:['Quero cotar seguro de vida']})), 'clara')
 assert.equal(selectConversationAgent(request('Meus seguros',{history:['Quero cotar seguro de vida']})), 'clara')
})
test('continuidade comercial de Murilo nas respostas comuns',()=>{
 assert.equal(selectConversationAgent(request('O imóvel é uma casa',{history:['Oi','Quero cotar seguro residencial']})),'murilo')
 assert.equal(selectConversationAgent(request('Fica em Guarulhos',{history:['Quero cotar seguro residencial']})),'murilo')
})
