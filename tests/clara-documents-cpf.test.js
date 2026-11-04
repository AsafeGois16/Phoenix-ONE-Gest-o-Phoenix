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
