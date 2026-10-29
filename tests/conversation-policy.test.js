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
 const x=formatVerifiedPortfolio({policies:[{ramo:'Auto',seguradora:'Exemplo Seguradora',premio_total:1200}],installments:[{valor:100}]},{focus:'details'})
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
 const t=formatVerifiedPortfolio({policies:[{numero:'SAUDE-TESTE',ramo:'Saúde',premio_mensal:680.25,premio_total:null}],installments:[{valor:680.25}]},{focus:'details'})
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


test('Clara resume só parcela vencida e o vencimento futuro mais próximo',async()=>{
 const {selectInstallmentHighlights,formatVerifiedPortfolio}=await import('../server/conversation-policy.js')
 const installments=[
  {apolice:'132401612',ramo:'Serviços',vencimento:'2026-10-20',valor:63.31,vencida:true},
  {apolice:'132401612',ramo:'Serviços',vencimento:'2026-11-20',valor:63.31,vencida:false},
  {apolice:'132401612',ramo:'Serviços',vencimento:'2026-12-20',valor:63.31,vencida:false},
  {apolice:'132401612',ramo:'Serviços',vencimento:'2027-01-20',valor:63.31,vencida:false}
 ]
 const selected=selectInstallmentHighlights(installments,{today:'2026-10-29'})
 assert.equal(selected.overdue.length,1)
 assert.equal(selected.next.vencimento,'2026-11-20')
 const reply=formatVerifiedPortfolio({installments},{focus:'installments',today:'2026-10-29'})
 assert.match(reply,/20\/10\/2026/)
 assert.match(reply,/20\/11\/2026/)
 assert.doesNotMatch(reply,/20\/12\/2026|20\/01\/2027/)
 assert.match(reply,/lista completa de parcelas/)
 const summary=formatVerifiedPortfolio({policies:[{ramo:'Serviços'}],installments},{focus:'summary',today:'2026-10-29'})
 assert.doesNotMatch(summary,/20\/12\/2026/)
})
test('pedido de lista completa mostra todas as parcelas retornadas',async()=>{
 const {portfolioFocus,formatVerifiedPortfolio,shouldLookupPersonalData}=await import('../server/conversation-policy.js')
 const data=[{vencimento:'2026-10-20',valor:63.31,vencida:true},{vencimento:'2026-11-20',valor:63.31,vencida:false},{vencimento:'2026-12-20',valor:63.31,vencida:false}]
 const c=text=>({direction:'inbound',author:'contact',text})
 assert.equal(portfolioFocus([c('Quais são minhas parcelas?'),c('Quero a lista completa')]),'installments_full')
 assert.equal(portfolioFocus([c('Mostre todas as parcelas em aberto')]),'installments_full')
 assert.equal(portfolioFocus([c('Preciso dos detalhes completos das parcelas')]),'installments_full')
 assert.equal(portfolioFocus([c('Quais são minhas parcelas?'),c('Quero completo')]),'installments_full')
 assert.equal(shouldLookupPersonalData([c('Quais são minhas parcelas?'),c('Me mostra a lista completa')],'clara',true),true)
 const full=formatVerifiedPortfolio({installments:data},{focus:'installments_full',today:'2026-10-29'})
 assert.match(full,/20\/10\/2026/)
 assert.match(full,/20\/11\/2026/)
 assert.match(full,/20\/12\/2026/)
})
test('várias parcelas vencidas e só o próximo pagamento em ordem cronológica',async()=>{
 const {selectInstallmentHighlights}=await import('../server/conversation-policy.js')
 const data=[{vencimento:'2026-12-10',vencida:false},{vencimento:'2026-10-05',vencida:true},{vencimento:'2026-11-02',vencida:false},{vencimento:'2026-09-25',vencida:true},{vencimento:'2026-11-09',vencida:false}]
 const selected=selectInstallmentHighlights(data,{today:'2026-10-29'})
 assert.deepEqual(selected.overdue.map(x=>x.vencimento),['2026-09-25','2026-10-05'])
 assert.equal(selected.next.vencimento,'2026-11-02')
})
test('sem vencidas: apenas o próximo; não presumir atraso por data sem status',async()=>{
 const {selectInstallmentHighlights}=await import('../server/conversation-policy.js')
 const data=[{vencimento:'2026-10-01',vencida:false},{vencimento:'2026-11-12',vencida:false},{vencimento:'2026-12-12',vencida:false},{vencimento:'2026-09-01'}]
 const result=selectInstallmentHighlights(data,{today:'2026-10-29'})
 assert.equal(result.overdue.length,0)
 assert.equal(result.next.vencimento,'2026-11-12')
})
test('sem perder intenção quando cliente muda de parcelas para seguros',async()=>{
 const {portfolioFocus}=await import('../server/conversation-policy.js')
 const c=text=>({direction:'inbound',author:'contact',text})
 assert.equal(portfolioFocus([c('Todas as parcelas'),c('Quais seguros eu tenho?')]),'summary')
 assert.equal(portfolioFocus([c('Quais seguros eu tenho?'),c('Parcelas')]),'installments')
})

test('Murilo no Laboratório RAG se apresenta e não pede endereço completo na abertura residencial',async()=>{
 const {ensureMuriloIntro}=await import('../server/conversation-policy.js')
 const question='Olá, quero cotar um seguro residencial.'
 const result=ensureMuriloIntro('Olá! Para começarmos sua cotação de seguro residencial, poderia informar o endereço do imóvel que deseja proteger?',[],question)
 assert.match(result,/Sou o Murilo, do time comercial da Phoenix Insurance/)
 assert.match(result,/casa ou apartamento/)
 assert.match(result,/qual cidade|em qual cidade/i)
 assert.doesNotMatch(result,/endereço do imóvel|CEP|CPF|CNPJ/i)
})
test('Murilo não repete apresentação após a primeira resposta e respeita perguntas progressivas',async()=>{
 const {ensureMuriloIntro}=await import('../server/conversation-policy.js')
 const history=[c('Quero um seguro residencial'),a('Olá! Sou o Murilo, do time comercial da Phoenix Insurance.'),c('É um apartamento em Guarulhos')]
 assert.equal(ensureMuriloIntro('Ótimo! É para morar ou alugar?',history,'É um apartamento em Guarulhos'),'Ótimo! É para morar ou alugar?')
 assert.equal(ensureMuriloIntro('',[], 'Quero cotar seguro residencial'),'')
})
test('Murilo não altera perguntas adequadas ou produtos fora de residencial',async()=>{
 const {ensureMuriloIntro}=await import('../server/conversation-policy.js')
 const good='Para começar, é uma casa ou apartamento e em qual cidade fica?'
 assert.match(ensureMuriloIntro(good,[],'Quero cotar seguro residencial'),/casa ou apartamento/)
 const auto='Qual é o modelo e o ano do veículo?'
 assert.match(ensureMuriloIntro(auto,[],'Quero cotar seguro auto'),/modelo e o ano do veículo/)
})
test('Murilo não se apresenta como cotação comercial em resposta a simples cumprimento',async()=>{
 const {ensureMuriloIntro}=await import('../server/conversation-policy.js')
 const result=ensureMuriloIntro('Como posso ajudar?',[],'Oi')
 assert.match(result,/Sou o Murilo/)
 assert.doesNotMatch(result,/Vou te ajudar com essa cotação/)
})

test('Clara e Murilo têm memória de apresentações independentes',async()=>{
 const {ensureClaraIntro,ensureMuriloIntro,omitRepeatedAgentIntroduction}=await import('../server/conversation-policy.js')
 const msg=[a('Sou o Murilo, do time comercial')]
 assert.match(ensureClaraIntro('Como posso ajudar?',msg,false),/Sou a Clara/)
 assert.equal(ensureClaraIntro('Posso consultar seus seguros.',[],true),'Posso consultar seus seguros.')
 assert.equal(ensureMuriloIntro('O imóvel é uma casa ou apartamento?',[], 'Quero cotar seguro residencial',true),'O imóvel é uma casa ou apartamento?')
 assert.equal(omitRepeatedAgentIntroduction('Olá! Sou o Murilo, do time comercial da Phoenix Insurance. Você prefere casa ou apartamento?','murilo',true),'Você prefere casa ou apartamento?')
})
