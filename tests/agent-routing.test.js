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

const outbound=text=>({direction:'outbound',author:'agent',type:'text',text})

test('regressão real: "Uso pessoal" após apresentação do Murilo NÃO troca para Clara',()=>{
 const messages=[
  outbound('Prazer, Asafe! Sou o Murilo, do time comercial da Phoenix Insurance. Vou te ajudar com a cotação para o Onix 2023. Você utiliza o carro para uso pessoal?'),
  msg('Uso pessoal')
 ]
 assert.equal(selectConversationAgent({agent_hint:'murilo',contact:{kind:'lead'},messages}),'murilo')
})

test('Murilo continua mesmo se o Junior enviar hint Clara por engano, quando sua apresentação é confirmada',()=>{
 const messages=[
  outbound('Prazer, sou o Murilo, da Phoenix. Para começar, o veículo é para uso pessoal?'),
  msg('Uso pessoal')
 ]
 assert.equal(selectConversationAgent({agent_hint:'clara',contact:{kind:'lead'},messages}),'murilo')
})

test('após truncamento da apresentação, pergunta comercial e hint Murilo mantêm a triagem',()=>{
 const messages=[
  outbound('Para o seu Onix 2023, você gostaria de proteção padrão ou mais cobertura?'),
  msg('Proteção padrão')
 ]
 assert.equal(selectConversationAgent({agent_hint:'murilo',contact:{kind:'lead'},messages}),'murilo')
})

test('respostas curtas do Murilo não causam troca, mesmo que a intenção inicial saiu da janela',()=>{
 for(const reply of ['Uma proteção nova','Somente eu','A mais comum','Uso pessoal','Proteção padrão']){
  const messages=[outbound('Prazer! Sou o Murilo, do time comercial da Phoenix Insurance.'),msg(reply)]
  assert.equal(selectConversationAgent({agent_hint:'murilo',contact:{kind:'lead'},messages}),'murilo',reply)
 }
})

test('solicitação operacional explícita prevalece sobre apresentação anterior do Murilo',()=>{
 for(const reply of ['Preciso da segunda via do meu boleto','Quero excluir meu dependente','Preciso acionar meu seguro após acidente']){
  const messages=[msg('Quero cotar seguro Auto'),outbound('Sou o Murilo, do time comercial da Phoenix Insurance.'),msg(reply)]
  assert.equal(selectConversationAgent({agent_hint:'murilo',contact:{kind:'lead'},messages}),'clara',reply)
 }
})

test('a saudação da Clara não é confundida com confirmação de atendimento comercial',()=>{
 const messages=[msg('Oi'),outbound('Olá, sou a Clara, assistente virtual. Como posso te chamar?'),msg('Asafe')]
 assert.equal(selectConversationAgent({agent_hint:'murilo',contact:{kind:'lead'},messages}),'clara')
})

test('sem apresentação ou histórico comercial, hint Murilo sozinho não escolhe o SDR',()=>{
 assert.equal(selectConversationAgent({agent_hint:'murilo',contact:{kind:'lead'},messages:[msg('Uso pessoal')]}),'clara')
})
