import test from 'node:test'
import assert from 'node:assert/strict'
import {categoryPolicies,verifiedMovementDecision,movementDocumentPrompt} from '../server/verified-movement.js'

const movement={type:'inclusao',product:'Saúde',relation:'dependente'}
const policies=[
 {numero:'SAU-0001234',ramo:'Saúde',seguradora:'Amil',linha:'Saúde'},
 {numero:'ODO-8877665',ramo:'Odontológico',seguradora:'Porto',linha:'Odonto'},
 {numero:'SAU-0005678',ramo:'Assistência Médica',seguradora:'SulAmérica',linha:'Saúde'},
 {numero:'VID-12345',ramo:'Vida',seguradora:'Bradesco'}
]
const received=text=>({direction:'inbound',author:'contact',text})
const sent=text=>({direction:'outbound',author:'agent',text})

test('solicitação de documento é do titular, não do menor',()=>{
 assert.match(movementDocumentPrompt,/CPF ou CNPJ do titular/)
 assert.doesNotMatch(movementDocumentPrompt,/CPF.*do filho|documento do dependente/)
})
test('escolha de Saúde não revela Odonto e Vida',()=>{
 assert.equal(categoryPolicies(policies,'Saúde').length,2)
 const initial=verifiedMovementDecision(movement,policies,[received('Quero incluir meu filho')])
 assert.equal(initial.humanHandoff,false)
 assert.match(initial.reply,/Amil/)
 assert.match(initial.reply,/SulAmérica/)
 assert.doesNotMatch(initial.reply,/Odontológico|Porto|Bradesco|Vida|ODO-8877665/)
 assert.match(initial.reply,/apólice final 1234/)
 assert.doesNotMatch(initial.reply,/SAU-0001234/)
})
test('não encaminha antes de selecionar apólice no contexto confirmado',()=>{
 const prompt=verifiedMovementDecision(movement,policies,[received('Meu filho')])
 const invalid=verifiedMovementDecision(movement,policies,[received('Meu filho'),sent(prompt.reply),received('não sei')])
 assert.equal(invalid.humanHandoff,false)
 const choice=verifiedMovementDecision(movement,policies,[received('Meu filho'),sent(prompt.reply),received('2')])
 assert.equal(choice.humanHandoff,true)
 assert.equal(choice.handoff.department,'backoffice')
 assert.match(choice.handoff.summary,/SulAmérica/)
 assert.match(choice.handoff.summary,/inclusão de dependente/)
 assert.doesNotMatch(choice.handoff.summary,/Porto|Bradesco/)
})
test('a seleção não é aceita sem pergunta anterior confirmada pela Clara',()=>{
 const decision=verifiedMovementDecision(movement,policies,[received('Quero usar a opção 2')])
 assert.equal(decision.humanHandoff,false)
})
test('um único seguro exige confirmação explícita',()=>{
 const one=policies.filter(p=>p.seguradora==='Amil')
 const q=verifiedMovementDecision(movement,one,[received('Sou titular')])
 assert.match(q.reply,/Confirma que este é o plano de Saúde/)
 assert.equal(q.humanHandoff,false)
 const confirmed=verifiedMovementDecision(movement,one,[received('Oi'),sent(q.reply),received('Sim')])
 assert.equal(confirmed.humanHandoff,true)
})
test('se não há Saúde entre as apólices verificadas não inventa opções',()=>{
 const noHealth=verifiedMovementDecision(movement,policies.filter(p=>p.ramo!=='Saúde'&&p.ramo!=='Assistência Médica'),[received('Oi')])
 assert.equal(noHealth.humanHandoff,true)
 assert.equal(noHealth.handoff.department,'backoffice')
 assert.doesNotMatch(noHealth.reply,/Porto|Bradesco/)
 assert.match(noHealth.reply,/não consegui identificar um plano de Saúde/)
})
test('quando falta produto ou relação, pede confirmação depois da verificação',()=>{
 assert.match(verifiedMovementDecision({...movement,product:null},policies,[received('oi')]).reply,/Saúde, Odonto ou Vida/)
 assert.match(verifiedMovementDecision({...movement,relation:null},policies,[received('oi')]).reply,/titular ou dependente/)
})

test('duas apólices sem referência distinguível não permitem escolha ambígua',()=>{
 const duplicate=[{ramo:'Saúde',seguradora:'Amil'},{ramo:'Saúde',seguradora:'Amil'}]
 const x=verifiedMovementDecision(movement,duplicate,[received('Quero incluir dependente')])
 assert.equal(x.humanHandoff,true)
 assert.equal(x.handoff.department,'backoffice')
 assert.match(x.reply,/sem identificação suficiente/)
})
test('metadados mistos de Saúde e Odonto não aparecem em escolha exclusivamente Saúde',()=>{
 const mixed=[{ramo:'Saúde e Odontológico',linha:'Benefícios',seguradora:'Mista'}]
 assert.equal(categoryPolicies(mixed,'Saúde').length,0)
})
