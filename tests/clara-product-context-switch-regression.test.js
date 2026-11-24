import test from 'node:test'
import assert from 'node:assert/strict'
import {decideMuriloSwitch,confirmedOfferHandoff} from '../server/consent-routing.js'
import {respondValidated} from '../api/v1/conversations/respond.js'

const inbound=text=>({direction:'inbound',author:'contact',type:'texto',text})
const outbound=text=>({direction:'outbound',author:'agent',type:'texto',text})
const claraIntro=outbound('Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. Como posso te chamar?')
const quote='Olá! Gostaria de fazer uma cotação de plano de saúde empresarial para 12 vidas.'
const healthHistory=[inbound(quote),claraIntro,inbound('Pode me chamar de Rafael')]
const reply=()=>({code:200,body:null,setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return x}})
const request=messages=>({
 conversation_id:'11111111-1111-4111-8111-111111111111',
 protocolo:'20990101-9991',mode:'sugestao',agent_hint:'murilo',
 contact:{kind:'lead'},messages
})
const pinned={mode:'clara_murilo',revision:7,
 intro:{blocked:false,clara_apresentada:true,murilo_apresentado:false}}

test('CTX01: PRINT — Clara responde Rafael citando Saúde Empresarial, nunca o mesmo veículo',()=>{
 const d=decideMuriloSwitch(healthHistory,'murilo')
 assert.equal(d.agent,'clara')
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
 assert.match(d.reply,/Rafael/)
 assert.match(d.reply,/plano de saúde empresarial/i)
 assert.match(d.reply,/Murilo/)
 assert.equal((d.reply.match(/\?/g)||[]).length,1)
 assert.doesNotMatch(d.reply,/mesmo veículo|outras seguradoras|carro|automóvel/i)
})

test('CTX02: API reproduz a sequência real e mantém agente, produto e aceite pendente',async()=>{
 const res=reply()
 await respondValidated(request(healthHistory),res,pinned)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.strategy,'clara_murilo')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/Rafael/)
 assert.match(res.body.reply,/plano de saúde empresarial/i)
 assert.doesNotMatch(res.body.reply,/mesmo veículo|seguro Auto|outras seguradoras/i)
})

test('CTX03: Saúde individual preserva produto',()=>{
 const m=[inbound('Quero cotar um plano de saúde para minha família.'),claraIntro,inbound('Meu nome é Marina')]
 const d=decideMuriloSwitch(m,'murilo')
 assert.match(d.reply,/plano de saúde/i)
 assert.doesNotMatch(d.reply,/empresarial|mesmo veículo/i)
})

test('CTX04: renovação de Auto mantém produto Auto, mas não inventa carro cadastrado',()=>{
 const m=[inbound('Quero renovar o seguro Auto do meu Chevrolet Onix 2023.'),claraIntro,inbound('Rafael')]
 const d=decideMuriloSwitch(m,'murilo')
 assert.match(d.reply,/seguro Auto/i)
 assert.doesNotMatch(d.reply,/mesmo veículo|outras seguradoras|cadastro autorizado/i)
})

test('CTX05: Odonto empresarial, Vida, Pet e Previdência preservam ramo',()=>{
 for(const [msg,label] of [
  ['Quero cotar plano Odonto empresarial.','odontológico empresarial'],
  ['Quero cotar Seguro de Vida em grupo.','Vida em grupo'],
  ['Quero cotar Seguro Pet.','Pet'],
  ['Quero contratar Previdência privada.','previdência privada']
 ]){
  const d=decideMuriloSwitch([inbound(msg),claraIntro,inbound('Pode me chamar de Rafael')],'murilo')
  assert.match(d.reply,new RegExp(label,'i'),msg)
  assert.doesNotMatch(d.reply,/mesmo veículo|outras seguradoras/i)
 }
})

test('CTX06: produtos mistos não geram nome de produto inventado',()=>{
 const m=[inbound('Gostaria de cotar plano de Saúde e seguro de Vida.'),claraIntro,inbound('Rafael')]
 const d=decideMuriloSwitch(m,'murilo')
 assert.match(d.reply,/sua solicitação de cotação/)
 assert.doesNotMatch(d.reply,/mesmo veículo|seguro Auto|plano de saúde empresarial/i)
})

test('CTX07: aceite explícito de troca Clara→Murilo não vira handoff humano',()=>{
 const offer=decideMuriloSwitch(healthHistory,'murilo')
 const withConsent=[...healthHistory,outbound(offer.reply),inbound('Sim')]
 assert.equal(decideMuriloSwitch(withConsent,'murilo'),null)
 assert.equal(confirmedOfferHandoff(withConsent),null)
})

test('CTX08: recusa mantém atendimento com Clara',()=>{
 const offer=decideMuriloSwitch(healthHistory,'murilo')
 const withRefusal=[...healthHistory,outbound(offer.reply),inbound('Não')]
 const d=decideMuriloSwitch(withRefusal,'murilo')
 assert.equal(d.agent,'clara')
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
 assert.doesNotMatch(d.reply,/mesmo veículo|outras seguradoras/i)
})

test('CTX09: nunca cria handoff ou oferta se Murilo já começou',()=>{
 const m=[...healthHistory,outbound('Olá! Sou o Murilo, do time comercial da Phoenix Insurance.'),inbound('Amil')]
 assert.equal(decideMuriloSwitch(m,'murilo'),null)
})

test('CTX10: ausência de produto declarado usa mensagem neutra sem adivinhação',()=>{
 const m=[inbound('Gostaria de uma cotação.'),claraIntro,inbound('Rafael')]
 const d=decideMuriloSwitch(m,'murilo')
 assert.match(d.reply,/sua solicitação de cotação/)
 assert.doesNotMatch(d.reply,/saúde|automóvel|mesmo veículo/i)
})
