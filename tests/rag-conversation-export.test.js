import test from 'node:test'
import assert from 'node:assert/strict'
import {ragConversationTxt} from '../src/rag-conversation-export.js'

test('exporta conversa inteira em ordem com agente e versão do prompt',()=>{
 const messages=[]
 for(let i=1;i<=8;i++){
  messages.push({role:'user',content:'Pergunta '+i})
  messages.push({role:'assistant',content:'Resposta '+i,promptVersion:11})
 }
 const txt=ragConversationTxt({agent:'clara',messages,generatedAt:new Date('2026-11-04T14:00:00.000Z')})
 assert.match(txt,/Laboratório RAG/i)
 assert.match(txt,/Gerado em: 2026-11-04T14:00:00.000Z/)
 assert.match(txt,/Agente: Clara/)
 assert.match(txt,/01 \\| Você\\nPergunta 1/)
 assert.match(txt,/16 \\| Clara \\| prompt v11\\nResposta 8/)
 assert.ok(txt.indexOf('Pergunta 1')<txt.indexOf('Resposta 8'))
 assert.equal((txt.match(/\\| prompt v11/g)||[]).length,8)
})
test('inclui aviso de proteção sem exportar respostas bloqueadas',()=>{
 const txt=ragConversationTxt({agent:'clara',messages:[
  {role:'user',content:'Preciso da segunda via de um boleto'},
  {role:'assistant',content:'O Financeiro orienta.',labGuardApplied:true,labGuardReasons:['pedido_de_dados'],promptVersion:11}
 ],generatedAt:new Date('2026-11-04T14:00:00.000Z')})
 assert.match(txt,/Proteção do laboratório aplicada/)
 assert.match(txt,/possível pedido de dados pessoais/)
 assert.doesNotMatch(txt,/Bearer|verification_ref|sources|access_token/)
 assert.match(txt,/sem integração com Junior\\/WhatsApp/)
})
test('exportação de Murilo preserva agente correto e tolera histórico vazio',()=>{
 assert.match(ragConversationTxt({agent:'murilo',messages:[{role:'user',content:'Olá'}]}),/Agente: Murilo/)
 assert.match(ragConversationTxt({agent:'clara',messages:null}),/Fim da conversa/)
})
