import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildMegaBrainObservation} from '../server/megabrain-observation.js'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const run=(text,agent='clara',reply='Como posso ajudar?',humanHandoff=false)=>buildMegaBrainObservation({agent,reply,humanHandoff,messages:[{direction:'inbound',author:'contact',text}]})

test('MegaBrain safe test button is part of the existing authenticated panel',()=>{
 const v=read('src/MegaBrain.jsx')
 assert.match(v,/Ativar modo de teste/)
 assert.match(v,/Encerrar modo de teste/)
 assert.match(v,/<MegaBrainSandbox onClose=/)
 assert.match(v,/setTestMode(x=>!x)/)
})
test('test panel uses the same classifier and never sends or persists content',()=>{
 const v=read('src/MegaBrainSandbox.jsx')
 assert.match(v,/import \{buildMegaBrainObservation\} from '..\/server\/megabrain-observation.js'/)
 assert.doesNotMatch(v,/\bfetch\s*\(|localStorage|sessionStorage|navigator\.sendBeacon|XMLHttpRequest/)
 assert.doesNotMatch(v,/shadowObserveMegaBrain|api\/v1|phoenix-one-megabrain-context/)
 assert.match(v,/Nenhum dado será gravado/)
})
test('synthetic quote is identified as commercial Life insurance',()=>{
 const o=run('Quero uma cotação de seguro de vida.','murilo','Posso fazer algumas perguntas?')
 assert.equal(o.topic,'cotacao')
 assert.equal(o.product,'vida')
 assert.equal(o.pending,'resposta_pendente')
})
test('synthetic health movement is identified without verifying identity',()=>{
 const o=run('Quero incluir um dependente no plano de saúde.','clara','Pode informar o CPF do titular para validação?')
 assert.equal(o.topic,'inclusao')
 assert.equal(o.product,'saude')
 assert.equal(o.pending,'validacao_pendente')
})
test('synthetic auto invoice is recognized',()=>{
 const o=run('Preciso da segunda via do boleto do meu seguro auto.','clara','Qual é o vencimento que deseja consultar?')
 assert.equal(o.topic,'boleto')
 assert.equal(o.product,'auto')
})
test('synthetic odonto reimbursement handoff is recognized as a proposal',()=>{
 const o=run('Quero solicitar reembolso do meu plano odontológico.','clara','Vou encaminhar para a equipe autorizada.',true)
 assert.equal(o.topic,'reembolso')
 assert.equal(o.product,'odontologico')
 assert.equal(o.next_step,'acompanhar_encaminhamento')
})
test('greeting does not create fictional context',()=>{
 assert.equal(run('Oi, bom dia!'),null)
})
test('test button does not change production capture or legacy response',()=>{
 const v=read('src/MegaBrainSandbox.jsx')
 assert.doesNotMatch(v,/PHOENIX_MEGABRAIN_SHADOW/)
 const helper=read('server/megabrain-observation.js')
 assert.match(helper,/if\(process.env.PHOENIX_MEGABRAIN_SHADOW!=='true'\)return false/)
 const response=read('api/v1/conversations/respond.js')
 assert.doesNotMatch(response,/MegaBrainSandbox/)
})
