import test from 'node:test'
import assert from 'node:assert/strict'
import {guardClaraLabAnswer as guard} from '../server/clara-rag-lab-guard.js'
import {claraLabInstructions} from '../server/clara-lab-instructions.js'
import {labGuardFeedback} from '../src/lab-guard-feedback.js'

for(const [question,answer] of [
 ['Quero incluir minha esposa no plano de saúde da empresa.','O Backoffice cuida da inclusão e confirma as condições e a documentação exigidas pela operadora. Aqui consigo orientar, mas a solicitação precisa seguir pelo canal de atendimento da Phoenix.'],
 ['Preciso excluir um dependente do plano odontológico.','Essa movimentação é tratada pelo Backoffice, que confirma os requisitos e a data aplicável com a operadora. Neste teste não consigo registrar a exclusão.'],
 ['Preciso da segunda via do boleto do meu seguro Auto.','O Financeiro pode ajudar com a segunda via oficial da seguradora. Neste laboratório não consigo consultar valores nem enviar o boleto.']
])test('orientação segura passa sem substituição: '+question,()=>{
 const result=guard({agent:'clara',messages:[{role:'user',content:question}],answer})
 assert.equal(result.applied,false)
 assert.equal(result.answer,answer)
})

for(const answer of [
 'Não consigo consultar o valor do boleto neste laboratório.',
 'Não posso verificar o status do contrato.',
 'Não vou registrar a solicitação.',
 'Nunca posso enviar o boleto.',
 'Não posso orientar e encaminhar seu pedido neste ambiente.'
])test('preserva negativa verdadeira: '+answer,()=>{
 assert.deepEqual(guard({agent:'clara',messages:[],answer}),{answer,applied:false,reason:null})
})
for(const answer of [
 'Não posso encaminhar o pedido. Posso enviar o boleto agora.',
 'Não consigo consultar o contrato, mas consigo consultar o valor do boleto.',
 'Não vou registrar o pedido. Vou encaminhar sua solicitação.',
 'Não posso orientar e encaminhar. Posso orientar e registrar o pedido.'
])test('negativa não esconde promessa posterior: '+answer,()=>{
 const result=guard({agent:'clara',messages:[],answer})
 assert.equal(result.applied,true)
 assert.notEqual(result.answer,answer)
})
test('diagnóstico apresenta somente categorias conhecidas sem reproduzir resposta bloqueada',()=>{
 const text=labGuardFeedback(['consulta_nao_disponivel','consulta_nao_disponivel','texto privado inesperado'])
 assert.match(text,/consulta indisponível/)
 assert.match(text,/precisa de revisão/)
 assert.doesNotMatch(text,/texto privado inesperado/)
 assert.equal((text.match(/consulta indisponível/g)||[]).length,1)
 assert.match(labGuardFeedback(null),/conteúdo sinalizado/)
})
test('instruções de capacidades restringem somente Clara no laboratório',()=>{
 assert.equal(claraLabInstructions('murilo'),'')
 const instructions=claraLabInstructions('clara')
 assert.match(instructions,/SEM FERRAMENTAS OPERACIONAIS/)
 assert.match(instructions,/Não ofereça encaminhamento/)
 assert.match(instructions,/Backoffice/)
 assert.match(instructions,/Financeiro/)
 assert.match(instructions,/emergências/)
})
