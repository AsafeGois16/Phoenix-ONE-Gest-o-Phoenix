import test from 'node:test'
import assert from 'node:assert/strict'
import {guardClaraLabAnswer as guard} from '../server/clara-rag-lab-guard.js'
const check=answer=>guard({agent:'clara',messages:[{role:'user',content:'Quero incluir minha esposa no plano de saúde da empresa.'}],answer})
for(const answer of [
 'Não preciso do seu CPF neste laboratório.',
 'Não precisamos que informe CPF ou CNPJ aqui.',
 'Não precisa informar seu CPF neste laboratório.',
 'Não é necessário enviar CPF. O Financeiro orienta pelo canal seguro.',
 'Você pode procurar o Backoffice para esclarecer quais documentos são necessários e como proceder com o que ainda falta.',
 'A equipe verificará as exigências da operadora e orientará o próximo passo.'
])test('preserva orientação segura: '+answer,()=>{
 assert.equal(check(answer).applied,false)
 assert.equal(check(answer).answer,answer)
})
for(const answer of [
 'Informe seu CPF.',
 'Não preciso do CPF, mas informe o CNPJ.',
 'Não precisa enviar CPF e informe o nome completo.',
 'Não precisamos de CPF. Poderia fornecer seu e-mail?',
 'Sem os documentos completos, o Backoffice não consegue dar andamento à inclusão.',
 'Enquanto não tiver toda a documentação, a solicitação não pode ser concluída.'
])test('intercepta coleta ou impedimento indevido: '+answer,()=>{
 assert.equal(check(answer).applied,true)
 assert.notEqual(check(answer).answer,answer)
})
test('preserva o comportamento do Murilo',()=>{
 const answer='Sem os documentos completos, o Backoffice não consegue dar andamento à inclusão.'
 assert.equal(guard({agent:'murilo',messages:[],answer}).answer,answer)
 assert.equal(guard({agent:'murilo',messages:[],answer}).applied,false)
})

for(const answer of [
 'Você pode iniciar a solicitação mesmo sem todos os documentos, mas o Backoffice confirmará o restante.',
 'É possível dar entrada na inclusão mesmo sem toda a documentação.',
 'Mesmo sem todos os documentos, você pode iniciar a inclusão.'
])test('intercepta promessa não verificada de início: '+answer,()=>{
 const result=check(answer)
 assert.equal(result.applied,true)
 assert.ok(result.reason.includes('documentos_ou_inicio_nao_confirmados'))
})
for(const [original,expected] of [
 ['O Backoffice verifica os requisitos da operadora. Posso ajudar com mais alguma informação?','O Backoffice verifica os requisitos da operadora.'],
 ['Neste ambiente não consigo registrar a inclusão. Posso ajudar com algo mais?','Neste ambiente não consigo registrar a inclusão.'],
 ['O Financeiro pode orientar sobre a segunda via. Posso ajudar em mais alguma coisa?','O Financeiro pode orientar sobre a segunda via.'],
 ['O Financeiro trata da segunda via do boleto. Posso ajudar com mais alguma orientação?','O Financeiro trata da segunda via do boleto.'],
 ['Procure o Backoffice para conferir os requisitos. Deseja que eu explique como proceder?','Procure o Backoffice para conferir os requisitos.']
])test('remove encerramento repetitivo sem alterar orientação: '+original,()=>{
 const r=check(original)
 assert.equal(r.applied,false)
 assert.equal(r.answer,expected)
})
test('preserva pergunta necessária de triagem',()=>{
 const answer='O Backoffice acompanha a inclusão. O plano é Saúde ou Odonto?'
 assert.deepEqual(check(answer),{answer,applied:false,reason:null})
})
test('não remove encerramento do Murilo',()=>{
 const answer='Posso ajudar com mais alguma informação?'
 assert.deepEqual(guard({agent:'murilo',messages:[],answer}),{answer,applied:false,reason:null})
})
