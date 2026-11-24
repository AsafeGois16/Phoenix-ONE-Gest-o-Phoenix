import test from 'node:test'
import assert from 'node:assert/strict'
import {isAutoInsuranceFromVehicleDescription} from '../server/auto-insurance-product-signal.js'
import {detectSdrQuoteProduct,nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'
import {muriloTransferInvitation} from '../server/murilo-transfer-invitation.js'
import {confirmedOfferHandoff,routeConfirmedMuriloQuote} from '../server/consent-routing.js'
import {alignAutoReHandoff} from '../server/commercial-intake.js'
import {respondValidated} from '../api/v1/conversations/respond.js'

const inc=text=>({direction:'inbound',author:'contact',type:'texto',text})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const initial='Olá! Quero renovar o seguro do meu Chevrolet Onix 2023. Minha apólice vence em 15/12/2026.'
const oldOffer='Olá! Sou o Murilo, do time comercial da Phoenix Insurance. Quero evitar perguntas fora do seu contexto. Posso encaminhar sua solicitação a um consultor para confirmar o produto e continuar?'
const autoOffer='Com as informações disponíveis, um consultor pode concluir a avaliação. Posso encaminhar sua solicitação à equipe de Auto/RE?'
const msgsForOffer=(offer=oldOffer)=>[
 inc(initial),
 out('Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. Como posso te chamar?'),
 inc('Asafe Gois'),
 out('Prazer, Asafe Gois! Posso encaminhar sua cotação ao Murilo para continuar o atendimento?'),
 inc('Sim'),
 out(offer),
 inc('Sim')
]
const result=()=>({code:200,data:null,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}})
const body=messages=>({
 conversation_id:'11111111-1111-4111-8111-111111111111',
 protocolo:'20990101-1101',mode:'sugestao',contact:{kind:'lead'},agent_hint:'murilo',messages
})
const pin={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}}

test('AUTO01: screenshot — renewal of Chevrolet Onix 2023 identifies Auto unambiguously',()=>{
 assert.equal(isAutoInsuranceFromVehicleDescription(initial),true)
 assert.equal(detectSdrQuoteProduct([inc(initial)]),'auto')
 assert.equal(detectSdrQuoteProduct(msgsForOffer()),'auto')
})
test('AUTO02: sales intent is required; a vehicle without quote request does not create a product',()=>{
 assert.equal(isAutoInsuranceFromVehicleDescription('Tenho um Chevrolet Onix 2023.'),false)
 assert.equal(isAutoInsuranceFromVehicleDescription('Seguro residencial do meu apartamento 2023'),false)
 assert.equal(isAutoInsuranceFromVehicleDescription('Preciso cotar seguro Vida para minha família.'),false)
 assert.equal(detectSdrQuoteProduct([inc('Quero cotar plano de Saúde e seguro de Vida.')]),null)
})
test('AUTO03: model and year already informed are skipped; Murilo asks an approved Auto question',()=>{
 const messages=[inc(initial),out('Olá! Sou o Murilo, do time comercial da Phoenix Insurance.'),inc('Vamos continuar a renovação')]
 const d=nextMuriloSdrDecision(messages)
 assert.equal(d.agent,'murilo')
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
 assert.doesNotMatch(d.reply,/confirmar o produto|consultor para confirmar/i)
 assert.match(d.reply,/pessoa física|CPF|pessoa jurídica|CNPJ/)
})
test('AUTO04: Clara references insurance Auto rather than generic quote',()=>{
 const offer=muriloTransferInvitation([inc(initial)],{name:'Asafe Gois',verb:'passar'})
 assert.match(offer,/seguro Auto/)
 assert.doesNotMatch(offer,/saúde|plano odontológico|produto não identificado/i)
})
test('AUTO05: previously sent generic offer and SIM route to patrimonio with confirmed consent',()=>{
 const messages=msgsForOffer()
 const decision=confirmedOfferHandoff(messages,'murilo')
 assert.ok(decision)
 assert.equal(decision.handoff.department,'patrimonio')
 const routed=routeConfirmedMuriloQuote(alignAutoReHandoff(decision,messages),messages)
 assert.equal(routed.agent,'murilo')
 assert.equal(routed.humanHandoff,true)
 assert.equal(routed.handoff.department,'patrimonio')
 assert.equal(routed.handoff.intent,'nova_cotacao')
 assert.equal(routed.handoff.product,'auto')
 assert.match(routed.reply,/equipe de Auto\/RE/)
})
test('AUTO06: API end-to-end reproduces WhatsApp screenshot, not Comercial/Sem fila',async()=>{
 const res=result()
 await respondValidated(body(msgsForOffer()),res,pin)
 assert.equal(res.code,200)
 assert.equal(res.data.agent,'murilo')
 assert.equal(res.data.strategy,'clara_murilo')
 assert.equal(res.data.humanHandoff,true)
 assert.equal(res.data.handoff?.department,'patrimonio')
 assert.equal(res.data.handoff?.intent,'nova_cotacao')
 assert.equal(res.data.handoff?.product,'auto')
 assert.match(res.data.reply,/equipe de Auto\/RE/)
})
test('AUTO07: new Auto/RE offer after SDR ends also goes directly to patrimonio',()=>{
 const messages=msgsForOffer(autoOffer)
 const raw=confirmedOfferHandoff(messages,'murilo')
 assert.ok(raw)
 const res=routeConfirmedMuriloQuote(raw,messages)
 assert.equal(res.handoff.department,'patrimonio')
 assert.equal(res.handoff.product,'auto')
 assert.equal(res.handoff.intent,'nova_cotacao')
})
test('AUTO08: no acceptance -> no human handoff, lead or invented ownership',()=>{
 const messages=msgsForOffer().slice(0,-1)
 assert.equal(confirmedOfferHandoff(messages,'murilo'),null)
 const no=[...messages,inc('Não, obrigado')]
 assert.equal(confirmedOfferHandoff(no,'murilo'),null)
 const raw={agent:'murilo',reply:oldOffer,humanHandoff:false,handoff:null}
 assert.strictEqual(routeConfirmedMuriloQuote(raw,messages),raw)
})
test('AUTO09: mixed products cannot be assigned to Auto/RE without clarification',()=>{
 const mixed=[inc('Quero cotar seguro de Vida e seguro do meu Chevrolet Onix 2023'),out(oldOffer),inc('Sim')]
 assert.equal(detectSdrQuoteProduct(mixed),null)
 assert.equal(confirmedOfferHandoff(mixed,'murilo'),null)
})
test('AUTO10: operational requests of Clara are not converted into auto quotation leads',()=>{
 const messages=[inc('Preciso acionar o sinistro do meu Chevrolet Onix 2023.'),out('Posso encaminhar para Backoffice?'),inc('Sim')]
 const decision={agent:'clara',reply:'Vou solicitar apoio',humanHandoff:true,handoff:{department:'backoffice',reason:'sinistro',summary:'atendimento operacional'}}
 assert.strictEqual(routeConfirmedMuriloQuote(decision,messages),decision)
})
test('AUTO11: Vida/Benefícios and other products keep their own queues',()=>{
 const messages=[inc('Quero cotar plano de Saúde empresarial para 12 vidas.'),out('Posso encaminhar sua solicitação à equipe de Benefícios da Phoenix?'),inc('Sim')]
 const raw=confirmedOfferHandoff(messages,'murilo')
 assert.equal(raw.handoff.department,'beneficios')
 const res=routeConfirmedMuriloQuote(raw,messages)
 assert.equal(res.handoff.department,'beneficios')
 assert.equal(res.handoff.intent,'nova_cotacao')
 assert.equal(res.handoff.product,'saude_empresarial')
})
test('AUTO12: generic unknown product receives no speculative real queue',()=>{
 const messages=[inc('Preciso de uma cotação, sem saber qual seguro é.'),out(oldOffer),inc('Sim')]
 assert.equal(detectSdrQuoteProduct(messages),null)
 assert.equal(confirmedOfferHandoff(messages,'murilo'),null)
})

test('AUTO13: API — after Clara asks name, renewal offer preserves Auto/RE context',async()=>{
 const messages=[
  inc(initial),
  out('Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. Como posso te chamar?'),
  inc('Asafe Gois')
 ]
 const res=result()
 await respondValidated(body(messages),res,{
  mode:'clara_murilo',revision:7,
  intro:{blocked:false,clara_apresentada:true,murilo_apresentado:false}
 })
 assert.equal(res.code,200)
 assert.equal(res.data.agent,'clara')
 assert.equal(res.data.humanHandoff,false)
 assert.equal(res.data.handoff,null)
 assert.match(res.data.reply,/seguro Auto/i)
 assert.match(res.data.reply,/Murilo/)
 assert.doesNotMatch(res.data.reply,/plano de saúde|produto não identificado|mesmo veículo/i)
})
