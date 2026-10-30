import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dedupeClaraIntroductions,ensureClaraIntro,isAssistanceEligibilityQuestion,isReadonlyConsultation,requestedPortfolioProduct,portfolioFocus,formatVerifiedPortfolio,hideIdentifierPlaceholders} from '../server/conversation-policy.js'
import {buildMegaBrainObservation} from '../server/megabrain-observation.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const msg=text=>({direction:'inbound',author:'contact',text})
const observe=(history,reply='Posso encaminhar para confirmação?',agent='clara')=>buildMegaBrainObservation({messages:history.map(msg),reply,agent})
test('Clara mantém apenas uma apresentação na mensagem que já contém duas',()=>{
 const initial='Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. 💙\n\nOlá! Sou Clara, assistente virtual da Phoenix Insurance. Em que posso ajudar você hoje?'
 const fixed=dedupeClaraIntroductions(initial)
 assert.equal((fixed.match(/Sou (?:a )?Clara/g)||[]).length,1)
 assert.match(fixed,/Em que posso ajudar você hoje\?/)
 assert.match(fixed,/💙/)
})
test('Clara não se apresenta de novo quando o protocolo confirma apresentação',()=>{
 const reply='Olá! Sou Clara, assistente da Phoenix Insurance. Posso consultar sua apólice?'
 const fixed=dedupeClaraIntroductions(reply,true)
 assert.doesNotMatch(fixed,/Sou Clara/)
 assert.match(fixed,/Posso consultar sua apólice\?/)
 assert.equal(dedupeClaraIntroductions('Pode me informar o CPF do titular?',true),'Pode me informar o CPF do titular?')
})
test('mensagem sem apresentação conserva seu conteúdo; primeira apresentação legítima continua',()=>{
 assert.equal(dedupeClaraIntroductions('Aguardo seu retorno.'),'Aguardo seu retorno.')
 const reply=ensureClaraIntro('Como posso ajudar?',[msg('Oi')])
 assert.match(dedupeClaraIntroductions(reply),/Sou a Clara/)
})
test('MegaBrain captura consulta de apólices, coberturas e assistência sem texto sensível',()=>{
 assert.equal(observe(['Gostaria de consultar meus seguros com vocês']).topic,'consulta_apolices')
 assert.equal(observe(['Pode me dizer as coberturas do meu seguro automóvel']).topic,'coberturas')
 const context=observe(['Certo, me diga as coberturas do meu seguro automóvel','Tenho direito a guincho?'])
 assert.equal(context.topic,'assistencia')
 assert.equal(context.product,'auto')
 assert.equal(context.subtopic,'guincho')
 const content=JSON.stringify(context)
 assert.doesNotMatch(content,/coberturas do meu seguro|direito a guincho/)
})
test('consulta sobre guincho não é pedido de acionamento',()=>{
 assert.equal(isAssistanceEligibilityQuestion('Eu tenho direito a guincho?'),true)
 assert.equal(isAssistanceEligibilityQuestion('Preciso de um guincho agora'),false)
 assert.equal(isReadonlyConsultation('Eu tenho direito a guincho?'),true)
 assert.equal(portfolioFocus([msg('Eu tenho direito a guincho?')]),'assistance')
})
test('pedido posterior para ver todos os seguros não fica preso ao ramo Auto',()=>{
 const history=[msg('Quero conhecer as coberturas do meu seguro auto'),msg('Agora quero consultar meus seguros')]
 assert.equal(requestedPortfolioProduct(history),null)
 const guincho=[msg('Quero consultar seguro de vida'),msg('Eu tenho direito a guincho?')]
 assert.equal(requestedPortfolioProduct(guincho),'auto')
})
test('resumo de Automóvel não repete apólices de Vida',()=>{
 const history=[msg('Quais seguros eu tenho?'),msg('Me diga as coberturas do meu seguro automóvel')]
 assert.equal(requestedPortfolioProduct(history),'auto')
 const data={policies:[
  {ramo:'Automóvel',numero:'AP-TESTE-AUTO',coberturas:[{nome:'Assistência Auto Dia e Noite - 400 KM'}]},
  {ramo:'Vida - Individual',numero:'AP-TESTE-VIDA',coberturas:[{nome:'Invalidez'}]}
 ]}
 const result=formatVerifiedPortfolio(data,{focus:'coverages',product:'auto'})
 assert.match(result,/Assistência Auto/)
 assert.doesNotMatch(result,/Vida - Individual|Invalidez/)
})
test('assitência cadastrada não garante automaticamente guincho ou acionamento',()=>{
 const txt=formatVerifiedPortfolio({policies:[{ramo:'Automóvel',numero:'AP-TESTE',coberturas:[{nome:'Assistência Auto Dia e Noite - 400 KM'}]}]},{focus:'assistance',product:'auto'})
 assert.match(txt,/não confirma, por si só, direito ao guincho/i)
 assert.match(txt,/Assistência Auto Dia e Noite/)
})
test('placeholders técnicos de identificadores não aparecem para o cliente',()=>{
 const s=hideIdentifierPlaceholders('1. Automóvel | Seguradora X | Apólice: [IDENTIFICADOR] | Em vigor\nApólice [IDENTIFICADOR]:\n• Guincho')
 assert.doesNotMatch(s,/\[IDENTIFICADOR\]/)
 assert.match(s,/Em vigor/)
 assert.match(s,/Guincho/)
})
test('snapshot V1 atualiza com V2 e contexto expõe novo subassunto',()=>{
 const panel=read('src/MegaBrain.jsx')
 const child=read('src/MegaBrainContext.jsx')
 assert.ok(panel.includes('onRefreshProtocol={load}'))
 assert.ok(child.includes('onRefreshProtocol?.()'))
 assert.ok(child.includes('data.subtopic'))
})
test('captura V2.2 permanece protegida pelo grant específico e não alimenta agentes',()=>{
 const edge=read('supabase/functions/phoenix-one-megabrain-context/index.ts')
 assert.ok(edge.includes('g.enabled=true'))
 assert.ok(edge.includes('g.conversation_id=s.conversation_id'))
 assert.ok(edge.includes('g.expires_at>now()'))
 assert.ok(edge.includes('observation.subtopic'))
 assert.ok(edge.includes('o.subtopic'))
 assert.doesNotMatch(read('supabase/functions/phoenix-one-bridge/index.ts'),/megabrain_context_observations/)
})
