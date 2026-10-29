import test from 'node:test'
import assert from 'node:assert/strict'
import {detectBackofficeRequest,assessBackofficeIntake} from '../server/backoffice-routing.js'
import {checkCapability} from '../server/action-capabilities.js'
test('triagem coleta produto e vínculo antes de transferir ao Backoffice',()=>{
 const generic=detectBackofficeRequest('Gostaria de incluir um beneficiário')
 assert.equal(generic.stage,'ask_product')
 assert.equal(generic.humanHandoff,false)
 assert.match(generic.reply,/Saúde, Odonto, Vida/)
 const m=text=>({direction:'inbound',author:'contact',text})
 const health=assessBackofficeIntake([m('Gostaria de incluir um beneficiário'),m('Saúde')])
 assert.equal(health.stage,'ask_relation')
 assert.equal(health.humanHandoff,false)
 assert.match(health.reply,/titular ou dependente/)
 const ready=assessBackofficeIntake([m('Gostaria de incluir um beneficiário'),m('Saúde'),m('Dependente')])
 assert.equal(ready.stage,'handoff')
 assert.equal(ready.humanHandoff,true)
 assert.equal(ready.department,'backoffice')
 assert.match(ready.summary,/Saúde/)
 assert.match(ready.summary,/dependente/)
 assert.match(ready.reply,/ainda não foi efetivada/)
})
test('informações já fornecidas são aproveitadas sem perguntas repetidas',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const ready=assessBackofficeIntake([m('Quero incluir minha filha no odonto')])
 assert.equal(ready.stage,'handoff');assert.match(ready.summary,/Odonto/)
 const missing=assessBackofficeIntake([m('Preciso excluir um dependente')])
 assert.equal(missing.stage,'ask_product')
 const complete=assessBackofficeIntake([m('Preciso excluir um dependente'),m('Plano de saúde')])
 assert.equal(complete.stage,'handoff')
 const both=assessBackofficeIntake([m('Preciso incluir um dependente na saúde e no odonto')])
 assert.match(both.summary,/Saúde e Odonto/)
 const sensitive=assessBackofficeIntake([m('Quero incluir minha filha CPF 111.444.777-35 no odonto')])
 assert.doesNotMatch(sensitive.summary,/111|444|777/)
})
test('dúvida sobre documentos não vira transferência automática',()=>{
 for(const text of ['Quais documentos preciso para inclusão?','Como funciona exclusão de dependentes?','Qual o prazo de inclusão de funcionários?','Gostaria de saber sobre alteração cadastral']){
  assert.equal(detectBackofficeRequest(text),null,text)
 }
})
test('cotação e cancelamento Auto não são movimentação do Backoffice',()=>{
 for(const text of ['Quero incluir cobertura no meu seguro auto','Preciso cancelar o seguro do carro','Quero cotar um seguro residencial','Preciso verificar minhas parcelas']){
  assert.equal(detectBackofficeRequest(text),null,text)
 }
})
test('manual do Junior mantém APIs não implementadas bloqueadas',()=>{
 assert.equal(checkCapability('movement_requirements',{agent:'clara',identityVerified:true,scopes:['identity:resolve','requirements:read']}).allowed,false)
 assert.equal(checkCapability('movement_status',{agent:'clara',identityVerified:true,scopes:['identity:resolve']}).allowed,false)
 assert.equal(checkCapability('movement_request',{agent:'clara',identityVerified:true,scopes:['tickets:create']}).allowed,false)
 assert.equal(checkCapability('pending_lookup',{agent:'clara',identityVerified:true,scopes:['identity:resolve','clients:read']}).allowed,false)
 assert.equal(checkCapability('ticket_handoff_proposal',{agent:'clara'}).allowed,true)
})

test('assuntos comerciais e consultas não reativam triagem antiga',async()=>{
 const {assessBackofficeIntake}=await import('../server/backoffice-routing.js')
 const m=text=>({direction:'inbound',author:'contact',text})
 assert.equal(assessBackofficeIntake([m('Quero incluir um dependente'),m('Quero cotar seguro residencial')]),null)
 assert.equal(assessBackofficeIntake([m('Quero incluir um dependente'),m('Quais seguros tenho?')]),null)
 assert.equal(assessBackofficeIntake([m('Quero incluir um dependente'),m('Gostaria de saber sobre prazos')])?.stage,'ask_product')
})
test('consulta de documentos com dados coletados não transfere sem orientação',async()=>{
 const {assessBackofficeIntake}=await import('../server/backoffice-routing.js')
 const m=text=>({direction:'inbound',author:'contact',text})
 const result=assessBackofficeIntake([m('Quero incluir minha filha no odonto'),m('Quais documentos são necessários?')])
 assert.equal(result.stage,'ask_confirmation')
 assert.equal(result.humanHandoff,false)
 assert.match(result.reply,/dependem da operadora/)
})
