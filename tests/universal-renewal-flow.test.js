import test from 'node:test'
import assert from 'node:assert/strict'
import {
 universalRenewalContext,universalRenewalClaraStage,
 isUniversalRenewalOffer,universalRenewalSwitchMessage,verifiedRenewalSummary,tagRenewalHandoff
} from '../server/universal-renewal-flow.js'
import {nextMuriloSdrDecision} from '../server/murilo-sdr-flow.js'
import {readFileSync} from 'node:fs'

const c=text=>({direction:'inbound',author:'contact',text})
const a=text=>({direction:'outbound',author:'agent',text})
const opening=product=>[c('Olá, quero renovar meu '+({saúde:'plano de saúde',residencial:'seguro residencial',auto:'seguro Auto'}[product]||'seguro de '+product)+'.'),
 a('Olá! Sou a Clara, concierge da Phoenix Insurance. Como posso te chamar?'),
 c('Mariana Silva')]

test('Clara oferece identidade para renovação Vida, Saúde, Residencial e Auto',()=>{
 for(const product of ['vida','saúde','residencial','auto']){
  const history=opening(product)
  const flow=universalRenewalClaraStage(history)
  assert.equal(flow?.stage,'offer',product)
  assert.ok(isUniversalRenewalOffer(flow.reply),product)
  const accepted=universalRenewalClaraStage([...history,a(flow.reply),c('Sim')])
  assert.equal(accepted?.stage,'verify',product)
  const declined=universalRenewalClaraStage([...history,a(flow.reply),c('Não')])
  assert.equal(declined?.stage,'continue',product)
 }
})

test('Documento é chave, nunca presumir que documento sozinho verificou o cliente',()=>{
 const start=opening('vida')
 const offer=universalRenewalClaraStage(start).reply
 const messages=[...start,a(offer),c('Sim'),a('Pode informar o CPF ou CNPJ do titular?'),c('Prefiro não informar')]
 assert.equal(universalRenewalClaraStage(messages)?.stage,'continue')
 assert.equal(universalRenewalClaraStage([...start,a(offer),c('123.456.789-00')])?.stage,'clarify')
})

test('Consulta distingue apólice única, múltiplas, ausência verificada e falha de escopo',()=>{
 const one={status:'verified',field_scopes:['policies.read'],verified_profile:{tipo_pessoa:'pf'},
  coverage_check:{product_code:'vida',result:'found',count:1},
  policies:[{product_code:'vida',seguradora:'Porto',fim_vigencia:'2026-12-15'}]}
 const found=verifiedRenewalSummary(one,'vida')
 assert.equal(found.found,true)
 assert.equal(found.insurer,'Porto')
 assert.equal(found.expiry,'2026-12-15')
 const multiple=verifiedRenewalSummary({...one,
   coverage_check:{product_code:'vida',result:'found',count:2},
   policies:[...one.policies,...one.policies]},'vida')
 assert.equal(multiple.found,true)
 assert.equal(multiple.insurer,null)
 assert.equal(multiple.expiry,null)
 assert.equal(verifiedRenewalSummary({...one,coverage_check:{product_code:'vida',result:'not_found',count:0},policies:[]},'vida')?.found,false)
 assert.equal(verifiedRenewalSummary({...one,policies:[]},'vida')?.found,true)
 assert.equal(verifiedRenewalSummary({...one,policies:[],coverage_check:null},'vida'),null)
 assert.equal(verifiedRenewalSummary({...one,coverage_check:{product_code:'auto',result:'found',count:1}},'vida'),null)
 assert.equal(verifiedRenewalSummary({...one,field_scopes:[]},'vida'),null)
 assert.equal(verifiedRenewalSummary({...one,status:'verification_required'},'vida'),null)
 assert.doesNotMatch(universalRenewalSwitchMessage({label:'Vida'},null),/encontrei|confirmei que existe/i)
})

test('Não consulta produto não suportado nem converte outro serviço em renovação',()=>{
 assert.equal(universalRenewalContext([c('Quero renovar seguro Cyber')])?.queryable,false)
 assert.equal(universalRenewalContext([c('Quero abrir um sinistro de Auto')]),null)
 assert.equal(universalRenewalContext([c('Quero cotar seguro de Vida novo')]),null)
 assert.equal(universalRenewalContext([c('Quero renovar meu seguro Auto e meu seguro de Vida')]),null)
})

test('Cotação nova posterior não herda oferta de autenticação da renovação anterior',()=>{
 const history=[c('Quero renovar meu Seguro Auto'),c('Quero cotar um Seguro de Vida novo')]
 assert.equal(universalRenewalContext(history),null)
})

test('Junior agrupa auto, moto e frota sem escolher uma apólice automaticamente',()=>{
 const fixture={status:'verified',field_scopes:['policies.read'],
  coverage_check:{product_code:'auto',result:'found',count:2},
  policies:[{product_code:'frota',seguradora:'Porto'}, {product_code:'moto',seguradora:'Suhai'}]}
 const summary=verifiedRenewalSummary(fixture,'auto')
 assert.equal(summary.found,true)
 assert.equal(summary.count,2)
 assert.equal(summary.insurer,null)
 const other=verifiedRenewalSummary({...fixture,
  coverage_check:{product_code:'auto',result:'found',count:1},
  policies:[{product_code:'moto',seguradora:'Suhai'}]},'auto')
 assert.equal(other.found,true)
 assert.equal(other.insurer,null) // grupo encontrado não implica Auto individual
 const msgs=[c('Quero renovar Seguro Auto'),a('Sou o Murilo, do time comercial.'),c('Sim')]
 const question=nextMuriloSdrDecision(msgs,{verifiedRenewal:summary})
 assert.match(question.reply,/qual contrato você deseja renovar/i)
 const after=nextMuriloSdrDecision([...msgs,a(question.reply),c('O da frota')],{verifiedRenewal:summary})
 assert.match(after.reply,/posso encaminhar/i)
})

test('Renovação vai ao Junior com intent renovacao, sem criar lead',()=>{
 const msgs=[c('Quero renovar Seguro de Vida'),a('Posso encaminhar sua solicitação à equipe de Benefícios?'),c('Sim')]
 const p={agent:'murilo',reply:'Perfeito',humanHandoff:true,handoff:{department:'beneficios',intent:'nova_cotacao',product:'vida'}}
 const result=tagRenewalHandoff(p,msgs)
 assert.equal(result.handoff.intent,'renovacao')
 assert.equal(result.handoff.product,'vida')
 assert.equal(tagRenewalHandoff({...p,humanHandoff:false},msgs).humanHandoff,false)
 const unrelated=tagRenewalHandoff(p,[c('Quero cotar Seguro de Vida novo')])
 assert.equal(unrelated.handoff.intent,'nova_cotacao')
 const incident=tagRenewalHandoff(p,[c('Quero renovar Seguro de Vida'),c('Agora preciso abrir sinistro')])
 assert.equal(incident.handoff.intent,'nova_cotacao')
 const mismatched=tagRenewalHandoff({...p,handoff:{...p.handoff,product:'saude'}},msgs)
 assert.equal(mismatched.handoff.intent,'nova_cotacao')
})

test('Murilo não repete seguradora ou vencimento quando foram verificados em uma única apólice',()=>{
 const msgs=[c('Quero renovar meu seguro Auto do Onix 2021, vence em 15/12/2026.'),
 a('O veículo está no nome de pessoa física (CPF) ou jurídica (CNPJ)?'),c('CPF')]
 const verified={found:true,product:'auto',insurer:'Suhai',expiry:'2026-12-15',count:1}
 const decision=nextMuriloSdrDecision(msgs,{verifiedRenewal:verified,documentIntake:false})
 assert.match(decision.reply,/placa do veículo/i)
 assert.doesNotMatch(decision.reply,/seguradora atual|vencimento da apólice/i)
})

test('A lógica é opt-in e revalidação ocorre pelo Junior antes de reutilizar dados',()=>{
 const src=readFileSync(new URL('../api/v1/conversations/respond.js',import.meta.url),'utf8')
 assert.match(src,/PHX_UNIVERSAL_RENEWAL_LOOKUP==='true'/)
 assert.match(src,/PHOENIX_ONE_V4_VERIFIED_CONTEXT==='true'/)
 assert.match(src,/verifiedRenewalSummary\(verification,info.product\)/)
 assert.match(src,/purpose:'quote',productCode:info.product/)
})
