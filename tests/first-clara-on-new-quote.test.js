import test from 'node:test'
import assert from 'node:assert/strict'
import {firstClaraForNewQuote} from '../server/first-clara-concierge.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
import {selectConversationAgent} from '../server/agent-routing.js'

const inbound=text=>({direction:'inbound',author:'contact',type:'texto',text})
const outbound=text=>({direction:'outbound',author:'agent',type:'texto',text})
const note=outbound('Este atendimento faz parte do seu protocolo *20990101-9001*. Se precisar falar desse assunto de novo, informe esse número.')
const pin=(clara=false,murilo=false)=>({mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:clara,murilo_apresentado:murilo}})
const payload=messages=>({
 conversation_id:'11111111-1111-4111-8111-111111111111',
 protocolo:'20990101-9001',
 mode:'sugestao',
 agent_hint:'murilo',
 contact:{kind:'lead'},
 messages
})
const response=()=>({code:200,body:null,setHeader(){},status(value){this.code=value;return this},json(value){this.body=value;return value}})
const question='Olá! Gostaria de fazer uma cotação de plano de saúde empresarial para 12 vidas.'

test('C01: aviso automático do protocolo NÃO equivale a Clara já apresentada',()=>{
 const msgs=[note,inbound(question)]
 assert.equal(selectConversationAgent(payload(msgs)),'murilo')
 const result=firstClaraForNewQuote({pin:pin(),introState:pin().intro,messages:msgs,selectedAgent:'murilo'})
 assert.equal(result.agent,'clara')
 assert.match(result.reply,/Sou a Clara/)
 assert.match(result.reply,/Como posso te chamar/)
 assert.equal(result.humanHandoff,false)
 assert.equal(result.handoff,null)
})
test('C02: API completa reproduz screenshot — primeira cotação empresarial começa com Clara',async()=>{
 const res=response()
 await respondValidated(payload([note,inbound(question)]),res,pin())
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.strategy,'clara_murilo')
 assert.match(res.body.reply,/Sou a Clara/)
 assert.doesNotMatch(res.body.reply,/Sou o Murilo/)
 assert.match(res.body.reply,/Como posso te chamar/)
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
})
test('C03: Auto renovação com aviso de protocolo também começa com Clara, sem exigir CPF',async()=>{
 const res=response()
 await respondValidated(payload([note,inbound('Olá! Quero renovar o seguro do meu Chevrolet Onix 2023. Minha apólice vence em 15/12/2026.')]),res,pin())
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.match(res.body.reply,/Sou a Clara/)
 assert.doesNotMatch(res.body.reply,/CPF ou CNPJ|localizar suas apólices/i)
})
test('C04: mensagem inicial já contém nome — Clara pede passagem ao Murilo, sem perguntar nome novamente',async()=>{
 const res=response()
 await respondValidated(payload([note,inbound('Meu nome é Rafael. Gostaria de cotar plano de Saúde empresarial para 12 vidas.')]),res,pin())
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.match(res.body.reply,/Sou a Clara/)
 assert.match(res.body.reply,/Rafael/)
 assert.match(res.body.reply,/Posso passar seu atendimento ao Murilo/)
 assert.doesNotMatch(res.body.reply,/Como posso te chamar/)
})
test('C05: histórico sem aviso mantém Clara pela coleta de nome existente',async()=>{
 const res=response()
 await respondValidated(payload([inbound(question)]),res,pin())
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.match(res.body.reply,/Sou a Clara/)
})
test('C06: flag Clara apresentada impede segunda saudação no mesmo protocolo',()=>{
 const msgs=[note,inbound('Quero cotar Saúde.')]
 const decision=firstClaraForNewQuote({pin:pin(true,false),introState:pin(true,false).intro,messages:msgs,selectedAgent:'murilo'})
 assert.equal(decision,null)
})
test('C07: Murilo já apresentado não deve voltar para Clara por engano',()=>{
 const msgs=[inbound(question),outbound('Sou o Murilo, do time comercial da Phoenix Insurance. Quantas vidas?'),inbound('12 vidas')]
 assert.equal(firstClaraForNewQuote({pin:pin(),introState:pin().intro,messages:msgs,selectedAgent:'murilo'}),null)
 assert.equal(firstClaraForNewQuote({pin:pin(false,true),introState:pin(false,true).intro,messages:msgs,selectedAgent:'murilo'}),null)
})
test('C08: apresentação real da Clara no histórico não permite saudação duplicada',()=>{
 const msgs=[inbound(question),outbound('Olá, sou a Clara, concierge da Phoenix. Como posso te chamar?'),inbound('Rafael')]
 assert.equal(firstClaraForNewQuote({pin:pin(),introState:pin().intro,messages:msgs,selectedAgent:'murilo'}),null)
})
test('C09: não interfere em atendimento operacional da Clara, inclusive boleto e sinistro',()=>{
 for(const message of ['Preciso da segunda via de boleto','Preciso abrir um sinistro e há feridos']){
  const msgs=[note,inbound(message)]
  assert.equal(firstClaraForNewQuote({pin:pin(),introState:pin().intro,messages:msgs,selectedAgent:'clara'}),null)
 }
})
test('C10: modo Somente Clara não invoca Murilo nem muda a primeira apresentação',()=>{
 const msgs=[note,inbound(question)]
 assert.equal(firstClaraForNewQuote({pin:{...pin(),mode:'clara_only'},introState:pin().intro,messages:msgs,selectedAgent:'murilo'}),null)
})
test('C11: Bridge indisponível ou estado bloqueado não autoriza considerar novo protocolo',()=>{
 const msgs=[note,inbound(question)]
 assert.equal(firstClaraForNewQuote({pin:pin(),introState:null,messages:msgs,selectedAgent:'murilo'}),null)
 assert.equal(firstClaraForNewQuote({pin:pin(),introState:{...pin().intro,blocked:true},messages:msgs,selectedAgent:'murilo'}),null)
})
test('C12: pedido explícito de pessoa humana não fica preso na coleta de nome',()=>{
 const msgs=[note,inbound('Quero cotar um seguro auto. Quero falar com um atendente humano.')]
 assert.equal(firstClaraForNewQuote({pin:pin(),introState:pin().intro,messages:msgs,selectedAgent:'murilo'}),null)
})
test('C13: consulta sem intenção comercial não cria novo SDR',()=>{
 const msgs=[note,inbound('Gostaria de consultar meu boleto atual')]
 assert.equal(firstClaraForNewQuote({pin:pin(),introState:pin().intro,messages:msgs,selectedAgent:'clara'}),null)
})
test('C14: retorno após aceite de troca preserva Murilo e dados do cliente',()=>{
 const msgs=[
  inbound(question),
  outbound('Olá! Sou a Clara, assistente virtual da Phoenix Insurance. Como posso te chamar?'),
  inbound('Rafael'),
  outbound('Obrigada, Rafael! Posso passar seu atendimento ao Murilo, nosso assistente comercial, para continuar a cotação?'),
  inbound('Sim')
 ]
 assert.equal(firstClaraForNewQuote({pin:pin(true,false),introState:pin(true,false).intro,messages:msgs,selectedAgent:'murilo'}),null)
})
