import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildMegaBrainObservation,shadowObserveMegaBrain} from '../server/megabrain-observation.js'
const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const input=t=>({messages:[{author:'contact',direction:'inbound',text:t}],reply:'Posso ajudar?',agent:'murilo'})
test('MegaBrain creates categorical context without retaining raw customer text or identifiers',()=>{
 const customer='Olá, sou João Silva, CPF 123.456.789-09, telefone 11999998888. Quero uma cotação de seguro de vida.'
 const obs=buildMegaBrainObservation(input(customer))
 assert.equal(obs.topic,'cotacao')
 assert.equal(obs.product,'vida')
 assert.equal(obs.confidence,'inferido')
 const saved=JSON.stringify(obs)
 for(const secret of ['João','123.456.789-09','11999998888','Silva','CPF'])assert.equal(saved.includes(secret),false)
})
test('MegaBrain detects operational topics and never asserts verified identity',()=>{
 const result=buildMegaBrainObservation({messages:[{direction:'inbound',author:'contact',text:'Quero incluir dependente no meu plano de saúde'}],reply:'Informe o CPF do titular para validação.',agent:'clara'})
 assert.equal(result.topic,'inclusao')
 assert.equal(result.product,'saude')
 assert.equal(result.next_step,'validar_titular')
 assert.equal(result.pending,'validacao_pendente')
 assert.deepEqual(result.facts,['assunto_identificado','produto_mencionado'])
 assert.equal(result.source,'mensagem_cliente')
})
test('MegaBrain ignores greetings and never sends raw conversation to storage',()=>{
 assert.equal(buildMegaBrainObservation(input('Oi, boa tarde')),null)
 const helper=text('server/megabrain-observation.js')
 assert.match(helper,/body:JSON.stringify\(\{action:'observe',conversationId,protocolo,observation\}\)/)
 assert.doesNotMatch(helper,/body:JSON.stringify\(\{[^}]*messages/)
})
test('MegaBrain shadow mode stays off without opt-in flag',async()=>{
 const previous=process.env.PHOENIX_MEGABRAIN_SHADOW
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 try{assert.equal(await shadowObserveMegaBrain({conversationId:'test',protocolo:'test',...input('Quero seguro de vida')}),false)}
 finally{if(previous!==undefined)process.env.PHOENIX_MEGABRAIN_SHADOW=previous}
})
test('MegaBrain server verifies protocol, strict categorical input and staff role',()=>{
 const edge=text('supabase/functions/phoenix-one-megabrain-context/index.ts')
 assert.match(edge,/await isBridgeToken\(token\)/)
 assert.match(edge,/s\.conversation_id=\$2::uuid/)
 assert.match(edge,/g\.enabled=true/)
 assert.match(edge,/g\.expires_at>now\(\)/)
 assert.match(edge,/enums\[field\]\.includes\(value\)/)
 assert.match(edge,/!\['owner','admin'\]\.includes/)
 assert.match(edge,/from phoenix_one\.protocol_agent_state/)
 assert.match(edge,/megabrain_context_observations/)
 assert.doesNotMatch(edge,/knowledge_chunks|learning_candidates|public\.leads/)
})
test('MegaBrain never feeds observation context into either agent',()=>{
 const response=text('api/v1/conversations/respond.js')
 assert.match(response,/if\(body\.mode==='automatico'&&last\?\.direction==='inbound'/)
 assert.match(response,/await shadowObserveMegaBrain\(/)
 const bridge=text('supabase/functions/phoenix-one-bridge/index.ts')
 assert.doesNotMatch(bridge,/megabrain_context_observations/)
 const v1=text('supabase/functions/phoenix-one-megabrain/index.ts')
 assert.doesNotMatch(v1,/megabrain_context_observations/)
})
