import test from 'node:test'
import assert from 'node:assert/strict'
import {detectBackofficeRequest,assessBackofficeIntake,activeMovementHistory,isStandaloneNewRequest} from '../server/backoffice-routing.js'
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
 const ref=assessBackofficeIntake([m('Gostaria de incluir um beneficiário'),m('Saúde'),m('Dependente')])
 assert.equal(ref.stage,'ask_reference')
 assert.equal(ref.humanHandoff,false)
 const ready=assessBackofficeIntake([m('Gostaria de incluir um beneficiário'),m('Saúde'),m('Dependente'),m('Amil')])
 assert.equal(ready.stage,'handoff')
 assert.equal(ready.humanHandoff,true)
 assert.equal(ready.department,'backoffice')
 assert.match(ready.summary,/Saúde/)
 assert.match(ready.summary,/dependente/)
 assert.match(ready.reply,/ainda não foi efetivada/)
})
test('informações já fornecidas são aproveitadas sem perguntas repetidas',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const pending=assessBackofficeIntake([m('Quero incluir minha filha no odonto')])
 assert.equal(pending.stage,'ask_reference');assert.equal(pending.humanHandoff,false)
 const ready=assessBackofficeIntake([m('Quero incluir minha filha no odonto'),m('Hapvida')])
 assert.equal(ready.stage,'handoff');assert.match(ready.summary,/Odonto/)
 const missing=assessBackofficeIntake([m('Preciso excluir um dependente')])
 assert.equal(missing.stage,'ask_product')
 const complete=assessBackofficeIntake([m('Preciso excluir um dependente'),m('Plano de saúde')])
 assert.equal(complete.stage,'ask_reference')
 const both=assessBackofficeIntake([m('Preciso incluir um dependente na saúde e no odonto'),m('Unimed')])
 assert.match(both.summary,/Saúde e Odonto/)
 const sensitive=assessBackofficeIntake([m('Quero incluir minha filha CPF 111.444.777-35 no odonto'),m('Bradesco')])
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
 assert.equal(result.stage,'ask_reference')
 assert.equal(result.humanHandoff,false)
 assert.match(result.reply,/documentos variam conforme a operadora/i)
})

test('regressão WhatsApp 20261029-0007: filho em Saúde exige origem antes da transferência',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const input=[m('Preciso de ajuda para incluir meu filho no meu plano de saúde')]
 const first=assessBackofficeIntake(input)
 assert.equal(first.stage,'ask_reference')
 assert.equal(first.humanHandoff,false)
 assert.match(first.reply,/operadora do plano ou a empresa/)
 assert.doesNotMatch(first.reply,/titular ou dependente\?/)
 const known=assessBackofficeIntake([...input,{direction:'outbound',author:'agent',text:first.reply},m('É pela Amil')])
 assert.equal(known.stage,'handoff')
 assert.equal(known.humanHandoff,true)
 assert.equal(known.department,'backoffice')
 assert.match(known.summary,/inclusão de dependente em Saúde/)
 assert.doesNotMatch(known.summary,/nome|cpf|documento da criança/i)
})
test('cliente sem conhecimento da operadora não fica preso na triagem',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const first=m('Preciso incluir meu filho no plano de saúde')
 const ask=assessBackofficeIntake([first])
 const reply=assessBackofficeIntake([first,{direction:'outbound',author:'agent',text:ask.reply},m('Não sei')])
 assert.equal(reply.humanHandoff,true)
 assert.match(reply.summary,/não foi identificada/)
})
test('resposta vaga não conclui a triagem; empresa fornecida é aproveitada sem copiar nomes',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const first=m('Quero incluir minha filha no plano de saúde')
 const ask=assessBackofficeIntake([first])
 assert.equal(assessBackofficeIntake([first,{direction:'outbound',author:'agent',text:ask.reply},m('Sim')]).stage,'ask_reference')
 const withCompany=assessBackofficeIntake([first,{direction:'outbound',author:'agent',text:ask.reply},m('Minha empresa é Novos Metais')])
 assert.equal(withCompany.stage,'handoff')
 assert.doesNotMatch(withCompany.summary,/Novos Metais/)
})
test('plano com empresa explícita não repete pergunta sobre origem',()=>{
 const requested=detectBackofficeRequest('Preciso incluir meu filho no plano de saúde da empresa Higas')
 assert.equal(requested.stage,'handoff')
 assert.equal(requested.department,'backoffice')
})

test('regressão WhatsApp 16:52: retorno humano não reabre movimentação de Saúde',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const a=text=>({direction:'outbound',author:'agent',text})
 const old=m('Preciso incluir meu filho no meu plano de saúde')
 const sent=a('Concluí a etapa de verificação, mas não consegui identificar um plano de Saúde para seleção nesta consulta. Vou direcionar sua solicitação ao Backoffice para conferência, sem realizar nenhuma movimentação.')
 const after=m('Certo pode me ajudar em mais uma coisa?')
 const messages=[old,sent,{direction:'outbound',author:'staff',text:'Atendimento devolvido para a Clara'},after]
 assert.equal(isStandaloneNewRequest(after.text),true)
 assert.deepEqual(activeMovementHistory(messages),[after])
 assert.equal(assessBackofficeIntake(messages),null)
})
test('novo assunto ignora CPF e plano anteriores, mantendo a nova solicitação',async()=>{
 const {findInboundDocument}=await import('../server/document-identity.js')
 const m=text=>({direction:'inbound',author:'contact',text})
 const a=text=>({direction:'outbound',author:'agent',text})
 const messages=[
  m('Preciso incluir meu filho no plano de saúde'),
  m('111.444.777-35'),
  a('Vou direcionar sua solicitação ao Backoffice para conferência manual.'),
  m('Certo, pode me ajudar em mais uma coisa?'),
  a('Claro! Como posso ajudar?'),
  m('Agora preciso excluir minha esposa do plano odontológico')
 ]
 const active=activeMovementHistory(messages)
 assert.equal(findInboundDocument(active).status,'missing')
 const decision=assessBackofficeIntake(active)
 assert.equal(decision.type,'exclusao')
 assert.equal(decision.product,'Odonto')
 assert.equal(decision.relation,'dependente')
 assert.doesNotMatch(JSON.stringify(decision),/Saúde|11144477735/)
})
test('continuidade de triagem não é apagada por simples resposta',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const a=text=>({direction:'outbound',author:'agent',text})
 const msgs=[m('Quero incluir um dependente'),a('Qual seguro? Saúde, Odonto ou Vida?'),m('Saúde')]
 assert.equal(activeMovementHistory(msgs).length,3)
 assert.equal(assessBackofficeIntake(msgs).product,'Saúde')
})
test('pergunta sobre encaminhar não é transferência efetuada',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const a=text=>({direction:'outbound',author:'agent',text})
 const msgs=[m('Preciso incluir meu filho no plano de saúde'),a('Deseja que eu encaminhe seu pedido ao Backoffice?'),m('Sim')]
 assert.equal(activeMovementHistory(msgs).length,3)
 assert.equal(assessBackofficeIntake(msgs).type,'inclusao')
})
test('mensagem genérica de nova solicitação interrompe retomada do pedido anterior',()=>{
 const m=text=>({direction:'inbound',author:'contact',text})
 const previous=[m('Quero incluir meu filho em Saúde')]
 for(const phrase of ['Certo pode me ajudar em mais uma coisa?','Tenho outra dúvida','Posso te pedir outra coisa?','Podemos falar de outro assunto?']){
  assert.equal(isStandaloneNewRequest(phrase),true,phrase)
  assert.equal(assessBackofficeIntake([...previous,m(phrase)]),null,phrase)
 }
 assert.equal(isStandaloneNewRequest('Certo, quero incluir minha esposa no Odonto'),false)
})
