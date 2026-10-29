import test from 'node:test'
import assert from 'node:assert/strict'
import {detectBackofficeRequest} from '../server/backoffice-routing.js'
import {checkCapability} from '../server/action-capabilities.js'
test('inclusão e exclusão de beneficiário vão ao backoffice com resumo sem dados pessoais',()=>{
 for(const text of ['Preciso excluir um funcionário do plano de saúde','Quero incluir minha filha no odonto','Poderiam realizar a exclusão de um dependente?','Preciso alterar dados cadastrais de um beneficiário']){
  const r=detectBackofficeRequest(text)
  assert.ok(r,text);assert.equal(r.department,'backoffice');assert.match(r.summary,/Backoffice/)
  assert.match(r.reply,/ainda não foi efetivada/)
 }
 const r=detectBackofficeRequest('Quero incluir meu filho de CPF 111.444.777-35 no odonto')
 assert.ok(r);assert.doesNotMatch(r.summary,/111/)
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
