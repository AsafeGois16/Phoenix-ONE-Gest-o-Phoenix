import test from 'node:test'
import assert from 'node:assert/strict'
import {firstMuriloAppearance,ensureMuriloIntro,shouldLookupPersonalData,isReadonlyConsultation,formatVerifiedPortfolio} from '../server/conversation-policy.js'
const c=text=>({direction:'inbound',author:'contact',text}), a=text=>({direction:'outbound',author:'agent',text})
test('Murilo se apresenta apenas na primeira fala comercial',()=>{
 const ms=[c('Quero cotar seguro residencial'),a('Olá! Sou o Murilo, do comercial Phoenix')]
 assert.match(ensureMuriloIntro('O imóvel é casa ou apartamento?',[]),/Sou o Murilo/)
 assert.equal(firstMuriloAppearance(ms),false)
 assert.equal(ensureMuriloIntro('Qual a cidade do imóvel?',ms),'Qual a cidade do imóvel?')
})
test('cotação não exige documento por ter histórico pessoal',()=>assert.equal(shouldLookupPersonalData([c('Quais seguros tenho?'),c('Quero cotar residencial')],'murilo',true),false))
test('Clara mantém consulta documental quando necessário',()=>{
 assert.equal(shouldLookupPersonalData([c('Quais seguros eu tenho?')],'clara',false),true)
 assert.equal(shouldLookupPersonalData([c('Quais seguros eu tenho?'),c('111.444.777-35')],'clara',true),true)
 assert.equal(shouldLookupPersonalData([c('Oi')],'clara',false),false)
})
test('resumo autorizado separa prêmio, valor da parcela e seguradora',()=>{
 const x=formatVerifiedPortfolio({policies:[{ramo:'Auto',seguradora:'Exemplo Seguradora',premio_total:1200}],installments:[{valor:100}]})
 assert.match(x,/Prêmio total: R\$ 1.200,00/);assert.match(x,/Parcela: R\$ 100,00/)
})
test('valor da parcela nunca inferido como prêmio',()=>{
 const x=formatVerifiedPortfolio({policies:[{ramo:'Auto'}],installments:[{valor:214.41}]})
 assert.match(x,/prêmio do seguro não foi disponibilizado/i);assert.doesNotMatch(x,/Prêmio total: R\$ 214,41/)
})
test('consultas informativas não geram transferência',()=>{
 assert.equal(isReadonlyConsultation('Quais seguros eu tenho com vocês?'),true)
 assert.equal(isReadonlyConsultation('Detalhes completos das parcelas'),true)
 assert.equal(isReadonlyConsultation('Quero que um atendente envie boleto'),false)
})
