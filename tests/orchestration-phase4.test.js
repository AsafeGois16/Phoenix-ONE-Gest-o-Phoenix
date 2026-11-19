import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveProtocolStrategy,resolveFixtureProtocol,protocolBase} from '../server/orchestration-protocol-strategy.js'
import {operationalRouting,LEGACY_COMMERCIAL_ROUTES} from '../server/orchestration-operational.js'
import {runOrchestrationPreview} from '../api/v1/conversations/respond.js'
const only={mode:'clara_only',revision:7},dual={mode:'clara_murilo',revision:1}
const user=text=>({direction:'inbound',author:'contact',type:'texto',text})
const bot=text=>({direction:'outbound',author:'agent',type:'texto',text})
const body=(messages,extra={})=>({conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20990102-0001',mode:'sugestao',contact:{kind:'lead'},messages,...extra})
const route=(messages,pin=only)=>operationalRouting({pin,body:body(messages),verifiedRoutes:LEGACY_COMMERCIAL_ROUTES})
const auto='Gostaria de cotar um seguro para meu carro.'
function storeFixture(){
 const pins=new Map();let current=only
 return {pins,set(v){current=v},async pin(ref,fresh){if(!pins.has(ref))pins.set(ref,{protocol_ref:ref,...(fresh?current:dual)});return pins.get(ref)}}
}
test('V1.4: nova cotação Auto/RE propõe patrimonio + intent após oferta entregue',()=>{
 for(const text of [auto,'Quero cotar seguro residencial.','Quero cotar seguro de moto.','Quero cotar seguro de frota.','Quero cotar seguro empresarial.']){
  const first=route([user(text)])
  assert.equal(first.humanHandoff,false,text)
  const next=route([user(text),bot(first.reply),user('Sim')])
  assert.equal(next.action,'propose_handoff',text);assert.equal(next.handoff.department,'patrimonio');assert.equal(next.handoff.intent,'nova_cotacao')
 }
})
test('V1.4: outros comerciais mantêm comercial e não recebem intent Auto/RE',()=>{
 for(const text of ['Quero cotar plano de saúde.','Quero cotar seguro de vida.','Quero cotar seguro pet.']){
  const first=route([user(text)]),next=route([user(text),bot(first.reply),user('Sim')])
  assert.equal(next.handoff.department,'comercial');assert.equal(next.handoff.intent,undefined)
 }
})
test('V1.4: recusa, serviço, risco, áudio, aceite falso e modo dual não geram intent',()=>{
 const first=route([user(auto)])
 for(const text of ['Não','Meu carro foi roubado','Preciso de uma segunda via do boleto.','[cliente enviou um áudio]','Preciso excluir minha esposa do plano odontológico.']){
  assert.notEqual(route([user(auto),bot(first.reply),user(text)]).handoff?.intent,'nova_cotacao',text)
 }
 assert.notEqual(route([user(first.reply),user('Sim')]).handoff?.intent,'nova_cotacao')
 assert.equal(route([user(auto),bot(first.reply),user('Sim')],dual).action,'delegate')
})
test('V1.4: pedido humano sem evidência de cotação não cria marcador',()=>{
 const r=route([user('Quero falar com o comercial sobre seguro de carro.')])
 assert.equal(r.handoff?.intent,undefined)
})
test('V1.4: persistência da estratégia, sufixo e reabertura mantêm pin da base',async()=>{
 const s=storeFixture(),first=await resolveFixtureProtocol(s,'20990102-0001')
 assert.equal(first.mode,'clara_only')
 s.set(dual)
 for(const protocol of ['20990102-0001','20990102-0001-1','20990102-0001-2']){
  const r=await resolveFixtureProtocol(s,protocol);assert.equal(r.mode,'clara_only');assert.equal(r.protocol_ref,first.protocol_ref)
 }
 assert.equal((await resolveFixtureProtocol(s,'20990102-0002')).mode,'clara_murilo')
})
test('V1.4: numeração alterada para sufixo adota base, sem apagar pin anterior',async()=>{
 const s=storeFixture();s.set(dual)
 const base=await resolveFixtureProtocol(s,'20990102-0003')
 s.set(only)
 const provisional=await resolveFixtureProtocol(s,'20990102-0004')
 const renamed=await resolveFixtureProtocol(s,'20990102-0003-1')
 assert.equal(provisional.mode,'clara_only');assert.equal(renamed.mode,base.mode);assert.equal(s.pins.size,2)
})
test('V1.4: data anterior e histórico anterior garantem legado; base ausente conservadora',async()=>{
 const s=storeFixture()
 for(const protocol of ['20990101-0001','20990101-0001-1','20990103-0004-2'])assert.equal((await resolveFixtureProtocol(s,protocol)).mode,'clara_murilo')
 assert.equal((await resolveProtocolStrategy(s,{protocol:'20990102-0005',activationDate:'20990102',knownBeforeActivation:true})).mode,'clara_murilo')
 assert.throws(()=>protocolBase('20990230-0001'),/invalid_protocol/)
 assert.throws(()=>resolveFixtureProtocol(s,'20261119-0001'),/invalid_protocol/)
})
test('V1.4: motor monta proposta, mas contrato externo em ensaio permanece bloqueado',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN')}
 try{
  const run=async messages=>{let result,status;await runOrchestrationPreview(body(messages,{agent_hint:'murilo'}),only,{setHeader(){},status(n){status=n;return this},json(x){result=x;return x}});assert.equal(status,200);return result}
  const first=await run([user(auto)]),next=await run([user(auto),bot(first.reply),user('Sim')])
  assert.equal(next.selectedAgent,'clara');assert.equal(next.proposedHandoff.intent,'nova_cotacao');assert.equal(next.proposedHandoff.department,'patrimonio')
  assert.equal(next.humanHandoff,false);assert.equal(next.handoff,null);assert.equal(next.executed,false)
 }finally{globalThis.fetch=oldFetch}
})

test('V1.4: cotação com pergunta de produto mantém marcador; oferta sem cotação não reutiliza assunto remoto',()=>{
 const initial='Gostaria de fazer uma cotação.'
 const question=route([user(initial)])
 const named=route([user(initial),bot(question.reply),user('Seguro empresarial.')])
 const next=route([user(initial),bot(question.reply),user('Seguro empresarial.'),bot(named.reply),user('Sim')])
 assert.equal(next.handoff?.intent,'nova_cotacao')
 const offered=route([user(auto)]).reply
 const unrelated=route([user(auto),bot('Encerramos aquele assunto.'),user('Quero falar sobre seguro de carro.'),bot(offered),user('Sim')])
 assert.notEqual(unrelated.handoff?.intent,'nova_cotacao')
})


test('F4-06: motor nos dois modos prioriza colisão coloquial e confirmação contextual',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN')}
 try{
  for(const pin of [only,dual]){
   const run=async messages=>{let result,status;await runOrchestrationPreview(body(messages,{agent_hint:'murilo'}),pin,{setHeader(){},status(n){status=n;return this},json(x){result=x;return x}});assert.equal(status,200);assert.equal(result.selectedAgent,'clara');assert.equal(result.humanHandoff,false);assert.equal(result.handoff,null);assert.equal(result.proposedHandoff,null);assert.equal(result.executed,false);return result}
   const history=[user('Acabei de bater meu carro. Preciso de ajuda.')]
   const first=await run(history);assert.match(first.reply,/local seguro/);assert.doesNotMatch(first.reply,/CPF|CNPJ/)
   history.push(bot(first.reply),user('Sim, todos estão em segurança e ninguém ficou ferido.'))
   const second=await run(history);assert.match(second.reply,/O veículo também está em local seguro/);assert.doesNotMatch(second.reply,/CPF|CNPJ|Sou a Clara/)
   const third=await run([...history,bot(second.reply),user('Sim')]);assert.match(third.reply,/CPF ou CNPJ do titular/);assert.doesNotMatch(third.reply,/Sou a Clara/)
   const both=await run([history[0],bot(first.reply),user('Todos estão em segurança e o veículo está em local seguro.')]);assert.match(both.reply,/CPF ou CNPJ/)
  }
 }finally{globalThis.fetch=oldFetch}
})
test('F4-06: colisão durante cotação interrompe proposta comercial',()=>{
 const offer=route([user(auto)])
 for(const text of ['Acabei de bater meu carro. Preciso de ajuda.','Bateram no meu carro.']){
  const r=route([user(auto),bot(offer.reply),user(text)])
  assert.equal(r.action,'delegate');assert.equal(r.agent,'clara');assert.equal(r.handoff,undefined)
 }
})
