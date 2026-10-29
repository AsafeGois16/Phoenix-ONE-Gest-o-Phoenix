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
 assert.match(x,/Prêmio total: R\$\s1.200,00/);assert.match(x,/Parcela: R\$\s100,00/)
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

test('continuidade após CPF/data mantém consulta informativa autorizada',async()=>{
 const {isVerifiedReadonlyContext}=await import('../server/conversation-policy.js')
 const h=[c('Quais seguros eu tenho?'),c('111.444.777-35'),c('25/11/1990')]
 assert.equal(isVerifiedReadonlyContext(h),true)
 assert.equal(isVerifiedReadonlyContext([c('Quais seguros eu tenho?'),c('Quero cotar seguro residencial')]),false)
})


test('contrato Junior v1.2: coberturas com capital e franquia, sem object Object',async()=>{
 const {formatVerifiedPortfolio}=await import('../server/conversation-policy.js')
 const result=formatVerifiedPortfolio({policies:[{
  numero:'APOLICE-TESTE',ramo:'Automóvel',seguradora:'Seguradora Exemplo',
  premio_total:3456.78,premio_mensal:null,status:'em_vigor',
  coberturas:[{nome:'RCF Danos Materiais',capital_segurado:100000,franquia:null},{nome:'Casco (100% FIPE)',capital_segurado:85000,franquia:4200}]
 }],installments:[{apolice:'APOLICE-TESTE',valor:345.68,vencida:false}]},{focus:'coverages'})
 assert.match(result,/RCF Danos Materiais/)
 assert.match(result,/Capital: R\$\s100.000,00/)
 assert.match(result,/Franquia: R\$\s4.200,00/)
 assert.match(result,/Prêmio total: R\$\s3.456,78/)
 assert.doesNotMatch(result,/\[object Object\]/)
 assert.doesNotMatch(result,/Parcela: R\$\s3.456,78/)
})
test('prêmio mensal de benefício não é convertido em prêmio anual',async()=>{
 const {formatVerifiedPortfolio}=await import('../server/conversation-policy.js')
 const t=formatVerifiedPortfolio({policies:[{numero:'SAUDE-TESTE',ramo:'Saúde',premio_mensal:680.25,premio_total:null}],installments:[{valor:680.25}]})
 assert.match(t,/Mensalidade: R\$\s680,25/)
 assert.doesNotMatch(t,/Prêmio total:/)
 assert.match(t,/Parcela: R\$\s680,25/)
})
test('pendências em português são entendidas, mas vazio não é confirmação de inexistência',async()=>{
 const {formatVerifiedPortfolio}=await import('../server/conversation-policy.js')
 const given=formatVerifiedPortfolio({policies:[{ramo:'Saúde'}],pending:[{descricao:'Documento de dependente',situacao:'Em análise',prazo:'2026-11-10'}]},{focus:'pending'})
 assert.match(given,/Documento de dependente/)
 assert.match(given,/Em análise/)
 assert.match(given,/10\/11\/2026/)
 const missing=formatVerifiedPortfolio({policies:[{ramo:'Saúde'}],pending:[]},{focus:'pending'})
 assert.match(missing,/não consigo confirmar/i)
 assert.doesNotMatch(missing,/não existem pendências|nenhuma pendência/i)
})
test('consulta de franquia ou coberturas continua pela Clara',async()=>{
 const {portfolioFocus,isReadonlyConsultation,shouldLookupPersonalData}=await import('../server/conversation-policy.js')
 const m=text=>({direction:'inbound',author:'contact',text})
 assert.equal(portfolioFocus([m('Quais coberturas eu tenho?')]),'coverages')
 assert.equal(portfolioFocus([m('Quais coberturas eu tenho?'),m('111.444.777-35'),m('25/11/1990')]),'coverages')
 assert.equal(portfolioFocus([m('Há pendências no meu seguro?')]),'pending')
 assert.equal(isReadonlyConsultation('Quais são as franquias da minha apólice?'),true)
 assert.equal(shouldLookupPersonalData([m('Quais coberturas eu tenho?')],'clara',false),true)
})
test('resposta longa não deve cortar nomes de coberturas no meio de uma linha',async()=>{
 const {formatVerifiedPortfolio}=await import('../server/conversation-policy.js')
 const coverages=Array.from({length:30},(_,i)=>({nome:'Cobertura '+(i+1),capital_segurado:50000,franquia:1000}))
 const reply=formatVerifiedPortfolio({policies:[{numero:'AP-1',ramo:'Auto',coberturas:coverages}]},{focus:'coverages',maxChars:1770})
 assert.ok(reply.length<=1770)
 assert.ok(!reply.includes('[object Object]'))
 assert.match(reply,/Há outros detalhes cadastrados|Mais \d+ cobertura/)
})


test('Clara se apresenta na primeira resposta direta, antes de pedir CPF/CNPJ',async()=>{
 const {ensureClaraIntro}=await import('../server/conversation-policy.js')
 const result=ensureClaraIntro('Para localizar seus seguros, pode informar o CPF ou CNPJ do titular?',[c('Olá, preciso consultar meus seguros')])
 assert.match(result,/Sou a Clara, concierge de atendimento da Phoenix Insurance/)
 assert.match(result,/CPF ou CNPJ/)
 assert.ok(result.indexOf('Sou a Clara')<result.indexOf('CPF ou CNPJ'))
})
test('Clara não se reapresenta em mensagens seguintes do protocolo',async()=>{
 const {ensureClaraIntro}=await import('../server/conversation-policy.js')
 const history=[c('Quais seguros tenho?'),a('Olá! Sou a Clara, concierge da Phoenix Insurance.'),c('111.444.777-35')]
 assert.equal(ensureClaraIntro('Para verificar sua identidade, qual sua data de nascimento?',history),'Para verificar sua identidade, qual sua data de nascimento?')
 assert.equal(ensureClaraIntro('',[]),'')
})
test('Clara não duplica apresentação produzida pelo próprio modelo',async()=>{
 const {ensureClaraIntro}=await import('../server/conversation-policy.js')
 const reply='Olá! Sou a Clara, da Phoenix Insurance. Como posso ajudar?'
 assert.equal(ensureClaraIntro(reply,[c('Oi')]),reply)
})
