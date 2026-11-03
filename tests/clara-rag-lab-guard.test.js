import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {guardClaraLabAnswer} from '../server/clara-rag-lab-guard.js'
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const u=content=>({role:'user',content})
const a=content=>({role:'assistant',content})
const guard=(answer,messages=[u('Preciso da segunda via do boleto Auto')],agent='clara')=>
 guardClaraLabAnswer({agent,messages,answer})

test('Clara RAG: blocks asking CPF/CNPJ to check Auto bill, replacing with Financeiro guidance',()=>{
 const r=guard('Para acessar a segunda via, preciso confirmar sua identidade. Poderia informar o CPF ou CNPJ do titular?')
 assert.equal(r.applied,true)
 assert.ok(r.reason.includes('pedido_de_dados'))
 assert.match(r.answer,/Financeiro da Phoenix/)
 assert.match(r.answer,/não tenho acesso|nao tenho acesso/i)
 assert.doesNotMatch(r.answer,/poderia informar|qual e o cpf/i)
})
test('Clara RAG: blocks repeated request for CPF in later turn',()=>{
 const messages=[u('Preciso da segunda via do boleto do seguro Auto'),a('Poderia informar CPF?'),u('Você consegue verificar o valor e enviar o boleto agora?')]
 const r=guard('Posso verificar se a parcela do seu boleto está disponível. Informe seu CPF para confirmação.',messages)
 assert.equal(r.applied,true)
 assert.ok(r.reason.includes('pedido_de_dados'))
 assert.match(r.answer,/não consigo consultar parcelas nem enviar documentos/)
})
test('Clara RAG: does not offer to register or transfer from a tool-less lab',()=>{
 const res=guard('Posso encaminhar seu pedido de exclusão à equipe de Backoffice, tudo bem?',[
  u('Preciso excluir um dependente do plano odontológico')])
 assert.equal(res.applied,true)
 assert.ok(res.reason.includes('oferta_de_acao_indisponivel'))
 assert.match(res.answer,/não consigo registrar ou encaminhar pedidos/)
})
test('Clara RAG: does not flag a truthful lack-of-tools explanation',()=>{
 const msg='Não posso encaminhar solicitações neste ambiente de teste; o Backoffice orienta por canal oficial.'
 const res=guard(msg,[u('Quero excluir um dependente')])
 assert.equal(res.applied,false)
 assert.equal(res.answer,msg)
})
test('Clara RAG: blocks a combined promise to orient AND forward request',()=>{
 const result=guard('Posso orientar sobre o procedimento e encaminhar seu pedido ao Backoffice.',[
  u('Quero incluir minha esposa no plano empresarial')])
 assert.equal(result.applied,true)
 assert.ok(result.reason.includes('oferta_de_acao_indisponivel'))
 assert.match(result.answer,/Neste ambiente de teste não consigo registrar ou encaminhar/)
})
test('Clara RAG: does not promise that the team will contact the client',()=>{
 const result=guard('A equipe do Backoffice vai entrar em contato com você e orientar os próximos passos.',[
  u('Quero incluir dependente em saúde'),u('Orienta os próximos passos')])
 assert.equal(result.applied,true)
 assert.ok(result.reason.includes('retorno_ou_inicio_nao_confirmado'))
 assert.doesNotMatch(result.answer,/vai entrar em contato/)
})
test('Clara RAG: no fictional inclusion requires spouse full name or identity',()=>{
 const r=guard('Poderia confirmar o nome do plano ou da empresa e o nome completo da sua esposa?',[
  u('Olá, gostaria de incluir minha esposa no plano de saúde da empresa.')])
 assert.equal(r.applied,true)
 assert.match(r.answer,/Backoffice/)
 assert.doesNotMatch(r.answer,/nome completo da sua esposa|informe.*cpf/i)
})
test('Clara RAG: blocks unsourced promise of Backoffice callback and document list',()=>{
 const r=guard('A equipe de Backoffice entrará em contato e você deve manter à mão RG, CPF e comprovante de endereço.',[
  u('Quero incluir minha esposa no plano de saúde empresarial'),u('Orienta os próximos passos')])
 assert.equal(r.applied,true)
 assert.ok(r.reason.some(x=>/retorno|documentos/.test(x)))
 assert.match(r.answer,/não consigo registrar ou encaminhar/)
 assert.doesNotMatch(r.answer,/entrará em contato|RG, CPF/)
})
test('Clara RAG: does not invent readiness with incomplete paperwork',()=>{
 const r=guard('A equipe do Backoffice pode iniciar o processo mesmo com documentos incompletos.',[
  u('Quero incluir dependente no plano saúde'),u('Ainda não tenho os documentos')])
 assert.equal(r.applied,true)
 assert.match(r.answer,/exigências da operadora/)
 assert.doesNotMatch(r.answer,/pode iniciar o processo/)
})
test('Clara RAG: blocks unexecuted exclusion registration and invented urgency',()=>{
 const r=guard('Vou registrar sua solicitação de exclusão com urgência para este mês e encaminhá-la à equipe.',[
  u('Preciso excluir um dependente do plano odontológico da empresa.'),u('sim')])
 assert.equal(r.applied,true)
 assert.ok(r.reason.includes('acao_operacional_nao_disponivel'))
 assert.match(r.answer,/data de corte/)
 assert.doesNotMatch(r.answer,/urgência|vou registrar|ainda neste mês/)
})
test('Clara RAG: blocks requests for CNPJ and names in Odonto workflow',()=>{
 const r=guard('Para seguir, informe o nome completo do responsável pela empresa e o CNPJ.',[
  u('Preciso excluir dependente do plano odontológico')])
 assert.equal(r.applied,true)
 assert.match(r.answer,/Backoffice/)
 assert.doesNotMatch(r.answer,/informe.*CNPJ/)
})
test('Clara RAG: blocks claiming to consult a contract when nothing is connected',()=>{
 const r=guard('Consigo consultar o status da parcela no sistema da seguradora.',[
  u('Quanto está meu boleto de Auto?')])
 assert.equal(r.applied,true)
 assert.ok(r.reason.includes('consulta_nao_disponivel'))
})
test('Clara RAG: preserves sound safe answers without automatic canned replacement',()=>{
 const text='O boleto oficial é emitido pela seguradora; a equipe Financeira da Phoenix poderá orientar o encaminhamento pelo canal seguro. Neste teste não consulto valores.'
 const r=guard(text)
 assert.equal(r.applied,false)
 assert.equal(r.answer,text)
 assert.equal(r.reason,null)
})
test('Clara RAG: negative warnings about not sending documents are not treated as solicitations',()=>{
 const text='Não precisa enviar CPF, CNPJ ou documentos neste laboratório. O Backoffice orientará os próximos passos conforme a operadora.'
 const r=guard(text,[u('Quero incluir minha esposa no plano de saúde empresarial')])
 assert.equal(r.applied,false)
 assert.equal(r.answer,text)
})
test('Clara RAG: leaves Murilo model answer entirely unchanged',()=>{
 const content='Para o seu seguro de vida, você tem alguma cobertura em mente?'
 const r=guard(content,[u('Quero cotar seguro vida')],'murilo')
 assert.deepEqual(r,{answer:content,applied:false,reason:null})
})
test('Clara RAG: does not claim actions on any generic lab request',()=>{
 const r=guard('Já transferi o seu pedido e enviaremos o boleto.',[u('Preciso falar com atendimento')])
 assert.equal(r.applied,true)
 assert.match(r.answer,/nem posso executar consultas, transferências ou solicitações/)
 assert.doesNotMatch(r.answer,/Já transferi|enviaremos/)
})
test('Clara RAG: server endpoint and UI disclose the guard without ever returning raw blocked text',()=>{
 const api=source('api/phoenix-answer.js')
 const ui=source('src/Operations.jsx')
 assert.ok(api.includes("import {guardClaraLabAnswer}"))
 assert.ok(api.includes("guardClaraLabAnswer({agent,messages,answer})"))
 assert.ok(api.includes("answer:protectedAnswer.answer"))
 assert.ok(api.includes("labGuard:{applied:protectedAnswer.applied"))
 assert.ok(ui.includes('labGuardApplied:res.labGuard?.applied===true'))
 assert.ok(ui.includes('Proteção do laboratório aplicada'))
 assert.doesNotMatch(source('api/v1/conversations/respond.js'),/guardClaraLabAnswer/)
 assert.doesNotMatch(source('server/clara-rag-lab-guard.js'),/fetch\(|localStorage|supabase|env\./)
})
