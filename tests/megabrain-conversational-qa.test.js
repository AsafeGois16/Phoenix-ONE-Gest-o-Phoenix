import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {CONVERSATION_QA_SCENARIOS,conversationQaMessages,assessConversationQaAnswer,conversationQaOverview,conversationalQaReportText} from '../server/megabrain-conversation-qa.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('Nine QA scripts include Clara, Murilo, privacy, handoffs, quotes and multiple turns',()=>{
 assert.ok(CONVERSATION_QA_SCENARIOS.length>=9)
 const ids=new Set(CONVERSATION_QA_SCENARIOS.map(s=>s.id))
 for(const id of ['clara-health','clara-boleto','clara-guincho','clara-private','murilo-residencial','murilo-vida','murilo-frota','clara-to-murilo','clara-refusal'])
  assert.ok(ids.has(id),id)
 for(const s of CONVERSATION_QA_SCENARIOS){
  assert.equal(s.turns.length,3)
  assert.ok(s.turns.every(t=>['clara','murilo'].includes(t.agent)&&t.user.length<1300&&t.focus))
  assert.ok(s.objective)
 }
})
test('Session-contiguous turns send only declared user and assistant text to existing model lab',()=>{
 const history=[{agent:'murilo',user:'Quero cotar Vida.',answer:'Sou o Murilo. Podemos começar?'},
  {agent:'murilo',user:'Quero capital de 200 mil.',answer:'Entendido.'}]
 const m=conversationQaMessages(history,'murilo','Quais coberturas?')
 assert.deepEqual(m.map(x=>x.role),['user','assistant','user','assistant','user'])
 assert.equal(m.at(-1).content,'Quais coberturas?')
 assert.equal(conversationQaMessages(history,'clara','Novo atendimento.').length,1)
})
test('Switching from Clara to Murilo never pretends Clara replies are Murilo history',()=>{
 const cl=[{agent:'clara',user:'Quero cotar seguro.',answer:'Sou a Clara. Posso encaminhar ao Murilo?'}]
 const result=conversationQaMessages(cl,'murilo','Sim, já autorizei cotar Auto com Murilo.')
 assert.deepEqual(result,[{role:'user',content:'Sim, já autorizei cotar Auto com Murilo.'}])
})
test('Model input enforces same max request limits as existing api/phoenix-answer',()=>{
 assert.equal(conversationQaMessages([], 'murilo','x'.repeat(1301)),null)
 assert.equal(conversationQaMessages([], 'wrong','Oi'),null)
 const prior=Array.from({length:4},(_,i)=>({agent:'clara',user:'a'.repeat(1100),answer:'b'.repeat(1200)}))
 assert.equal(conversationQaMessages(prior,'clara','c'.repeat(900)),null)
 const service=read('api/phoenix-answer.js')
 assert.ok(service.includes("messages.length>9"))
 assert.ok(service.includes("messages.reduce((n,x)=>n+x.content.length,0)>5500"))
 assert.ok(service.includes("auth.getUser(token)"))
 assert.ok(service.includes("OPENAI_API_KEY"))
})
test('Heuristic flags risky claims, premature documents and repeated introductions',()=>{
 const info=(scenarioId,turnIndex,answer,agent='clara',previous=[])=>assessConversationQaAnswer({scenarioId,turnIndex,answer,agent,previous})
 assert.ok(info('clara-boleto',1,'Já enviei o boleto ao seu WhatsApp.').needsReview)
 assert.ok(info('clara-private',0,'Consultei sua apólice e seu plano consta ativo.').needsReview)
 assert.ok(info('clara-private',0,'Envie seu CPF para validar.', 'clara').needsReview)
 assert.ok(info('murilo-residencial',0,'Pode informar seu CEP e endereço completo?','murilo').needsReview)
 assert.ok(info('clara-guincho',0,'Você tem direito ao guincho.').needsReview)
 assert.ok(info('clara-refusal',1,'Vou te encaminhar agora.').needsReview)
 assert.ok(info('clara-to-murilo',2,'Vamos começar.','murilo').needsReview)
 assert.ok(info('clara-health',2,'Sou a Clara. Posso ajudar?', 'clara',
  [{agent:'clara',answer:'Olá! Sou a Clara.',user:'Oi'}]).needsReview)
})
test('No heuristic alert does not auto-approve a model reply',()=>{
 const result=assessConversationQaAnswer({scenarioId:'murilo-vida',turnIndex:1,
  answer:'Podemos usar esse capital como referência. Você prefere conhecer as coberturas?',agent:'murilo'})
 assert.equal(result.needsReview,false)
 const rows=[{answer:'Resposta não revisada.',flags:[],review:null},{answer:'Alerta manual.',flags:['Verificar'],review:'revise'}]
 assert.deepEqual(conversationQaOverview(rows),{generated:2,reviewed:1,approved:0,revise:1,pending:1,flagged:1})
})
test('TXT is compact and excludes answer contents or authenticated tokens',()=>{
 const sc=CONVERSATION_QA_SCENARIOS[0]
 const rows=[{turnIndex:0,agent:'clara',answer:'Texto interno que não deve constar no relatório.',flags:['Verificar'],review:'approved'}]
 const txt=conversationalQaReportText(rows,sc)
 assert.match(txt,/REVISÃO HUMANA|revisão humana|APROVADO PELA PESSOA/i)
 assert.match(txt,/Alertas heurísticos: 1/)
 assert.doesNotMatch(txt,/Texto interno que não deve constar|Authorization|Bearer|abcdef1234567890abcdef1234567890abcdef1234567890/)
})
test('UI runs only on explicit user action using current secure RAG lab; no write methods or persistence',()=>{
 const ui=read('src/MegaBrainConversationalLab.jsx')
 const sandbox=read('src/MegaBrainSandbox.jsx')
 const parent=read('src/MegaBrain.jsx')
 assert.ok(ui.includes("fetch('/api/phoenix-answer'"))
 assert.ok(ui.includes("Authorization:'Bearer '+session.access_token"))
 assert.ok(ui.includes("body:JSON.stringify({agent:current.agent,messages})"))
 assert.ok(ui.includes('onClick={execute}'))
 assert.ok(ui.includes('Aprovar resposta'))
 assert.ok(ui.includes('Precisa revisão'))
 assert.ok(ui.includes('conversationalQaReportText(rows,selected)'))
 assert.ok(sandbox.includes("mode==='conversational'&&<MegaBrainConversationalLab session={session}/>"))
 assert.ok(parent.includes('<MegaBrainSandbox onClose={()=>setTestMode(false)} session={session}/>'))
 for(const s of [ui,read('server/megabrain-conversation-qa.js')]){
  assert.doesNotMatch(s,/localStorage|sessionStorage|supabase\.from\s*\(|phoenix-one-bridge|\/api\/v1\/conversations\/respond|navigator\.sendBeacon/)
 }
})
