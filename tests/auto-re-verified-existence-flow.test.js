import test from 'node:test'
import assert from 'node:assert/strict'
import {autoReDocumentIntake,AUTO_RE_PRODUCTS} from '../server/auto-re-document-intake.js'
import {isAutoRenewalForVerification,isAutoPortfolioOffer,verifiedAutoPortfolioDecision} from '../server/auto-verified-portfolio-handoff.js'
import {nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'
import {confirmedOfferHandoff} from '../server/consent-routing.js'
import {respondValidated} from '../api/v1/conversations/respond.js'

const inc=text=>({direction:'inbound',author:'contact',type:'texto',text})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const request='Quero renovar o seguro do meu Hyundai Creta 2023. Vence em 15/12/2026.'
const docRequest='Para ajudar a equipe a localizar seu cadastro e evitar perguntas repetidas, pode me informar o número do CPF do titular? Se preferir não informar, seguimos com a cotação normalmente.'
const verified={status:'verified',field_scopes:['policies.read'],policies:[
 {product_code:'auto',numero:'NÃO REVELAR',ramo:'Auto',veiculo:{modelo:'NÃO REVELAR'},seguradora:'NÃO REVELAR'},
 {product_code:'auto',numero:'OUTRO',ramo:'Auto'}
]}
const quote=[inc(request),out('Olá, sou a Clara. Como posso te chamar?'),inc('Asafe Gois'),
 out('Posso passar sua cotação de seguro Auto ao Murilo?'),inc('Sim'),
 out('Olá, sou o Murilo, do time comercial.'),out('O veículo está no nome de pessoa física (CPF) ou jurídica (CNPJ)?'),inc('CPF')]

test('PORT01: todos os 12 ramos Auto/RE têm etapa única e opcional de número CPF/CNPJ',()=>{
 assert.equal(AUTO_RE_PRODUCTS.length,12)
 for(const product of AUTO_RE_PRODUCTS){
  const decision=autoReDocumentIntake(quote,product,[])
  assert.ok(decision,product)
  assert.match(decision.reply,/número do CPF do titular/)
  assert.equal(decision.humanHandoff,false)
  assert.equal(decision.handoff,null)
 }
})
test('PORT02: cliente que responde CPF recebe pedido do NÚMERO e não outro tipo',()=>{
 const d=nextMuriloSdrDecision(quote,{documentIntake:true})
 assert.match(d.reply,/número do CPF do titular/)
 const other=nextMuriloSdrDecision(quote,{documentIntake:false})
 assert.doesNotMatch(other.reply,/número do CPF do titular/)
})
test('PORT03: documento válido ou recusa não provoca novas solicitações',()=>{
 const valid=[...quote,out(docRequest),inc('529.982.247-25')]
 assert.equal(autoReDocumentIntake(valid,'auto',[]),null)
 const refused=[...quote,out(docRequest),inc('Prefiro não informar')]
 assert.equal(autoReDocumentIntake(refused,'auto',[]),null)
 assert.notEqual(nextMuriloSdrDecision(refused,{documentIntake:true}).reply,docRequest)
})
test('PORT04: novo cliente: sem prova verificada, não declara existência de Seguro Auto',()=>{
 const decision=verifiedAutoPortfolioDecision([...quote,out(docRequest),inc('529.982.247-25')],{status:'verification_required'})
 assert.equal(decision,null)
})
test('PORT05: com cadastro verificado, perguntar SIM/NÃO sem modelo, placa, marca ou apólice',()=>{
 const msgs=[...quote,out(docRequest),inc('529.982.247-25')]
 const d=verifiedAutoPortfolioDecision(msgs,verified)
 assert.match(d.reply,/Encontrei um Seguro Auto cadastrado/)
 assert.match(d.reply,/Posso encaminhar sua renovação diretamente à equipe Auto\/RE/)
 assert.doesNotMatch(d.reply,/Creta|modelo|marca|placa|NÃO REVELAR|OUTRO|apólice|seguradora/i)
 assert.equal(d.humanHandoff,false)
})
test('PORT06: SIM, verificação ativa, encaminha imediatamente à fila patrimonio',()=>{
 const offer=verifiedAutoPortfolioDecision(quote,verified).reply
 const msgs=[...quote,out(offer),inc('Sim')]
 const d=verifiedAutoPortfolioDecision(msgs,verified)
 assert.equal(d.humanHandoff,true)
 assert.equal(d.agent,'murilo')
 assert.equal(d.handoff.department,'patrimonio')
 assert.equal(d.handoff.intent,'nova_cotacao')
 assert.equal(d.handoff.product,'auto')
 assert.doesNotMatch(d.reply,/Creta|placa|modelo|2023/)
 assert.doesNotMatch(d.handoff.summary,/Creta|NÃO REVELAR|OUTRO/)
})
test('PORT07: NÃO continua triagem sem handoff e sem repetir oferta cadastral',()=>{
 const offer=verifiedAutoPortfolioDecision(quote,verified).reply
 const msgs=[...quote,out(offer),inc('Não')]
 assert.equal(verifiedAutoPortfolioDecision(msgs,verified),null)
 assert.equal(nextMuriloSdrDecision(msgs,{documentIntake:true}).humanHandoff,false)
 const later=[...msgs,out('Qual é a seguradora atual?'),inc('Suhai')]
 assert.equal(verifiedAutoPortfolioDecision(later,verified),null)
})
test('PORT08: no SIM, verificação expirada/inexistente NÃO libera um humano',()=>{
 const offer=verifiedAutoPortfolioDecision(quote,verified).reply
 for(const status of ['unavailable','verification_required','verification_expired','not_found']){
  const msgs=[...quote,out(offer),inc('Sim')]
  assert.equal(confirmedOfferHandoff(msgs,'murilo'),null)
  const d=verifiedAutoPortfolioDecision(msgs,{status,policies:[{product_code:'auto'}]})
  assert.equal(d.humanHandoff,false)
  assert.equal(d.handoff,null)
  assert.doesNotMatch(d.reply,/identifiquei seu carro|encontrei seu seguro Auto/)
 }
})
test('PORT09: cliente com só seguro Vida não recebe confirmação Auto',()=>{
 assert.equal(verifiedAutoPortfolioDecision(quote,{status:'verified',policies:[{product_code:'vida'}]}),null)
})
test('PORT10: presença de Auto apenas pelo modelo na mensagem não equivale a seguro verificado',()=>{
 assert.equal(verifiedAutoPortfolioDecision(quote,{status:'verified',policies:[{ramo:'Auto',veiculo:{modelo:'Creta'}}]}),null)
})
test('PORT11: somente renovação Auto aciona essa consulta, não outros produtos',()=>{
 assert.equal(isAutoRenewalForVerification(quote),true)
 assert.equal(isAutoRenewalForVerification([inc('Quero cotar um plano de Saúde')]),false)
 assert.equal(isAutoRenewalForVerification([inc('Preciso abrir um sinistro do seguro Auto')]),false)
})
test('PORT12: oferta exclusiva não cai no parser genérico de aceite humano',()=>{
 const offer=verifiedAutoPortfolioDecision(quote,verified).reply
 assert.equal(isAutoPortfolioOffer(offer),true)
 assert.equal(confirmedOfferHandoff([...quote,out(offer),inc('Sim')],'murilo'),null)
})
test('PORT13: resposta ambígua não libera lead ou fila humana',()=>{
 const offer=verifiedAutoPortfolioDecision(quote,verified).reply
 const d=verifiedAutoPortfolioDecision([...quote,out(offer),inc('Talvez')],verified)
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
})
test('PORT14: nenhuma alteração no modo antigo sem feature flag',()=>{
 const d=nextMuriloSdrDecision(quote,{documentIntake:false})
 assert.equal(d.agent,'murilo')
 assert.doesNotMatch(d.reply,/número do CPF do titular/)
})
