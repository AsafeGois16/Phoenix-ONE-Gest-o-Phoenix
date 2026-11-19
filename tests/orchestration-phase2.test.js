import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {operationalRouting} from '../server/orchestration-operational.js'
import {isolatedConfig,centralStore,authorizedAdmin} from '../server/orchestration-central-store.js'
import handler from '../api/orchestration-central-preview.js'
import {previewDecision,newPreviewProtocol,MODES} from '../server/orchestration-preview.js'

const actor='11111111-1111-4111-8111-111111111111'
const protocol='22222222-2222-4222-8222-222222222222'
const only={mode:'clara_only',revision:2}
const both={mode:'clara_murilo',revision:1}
const user=text=>({direction:'inbound',author:'contact',text})
const bot=text=>({direction:'outbound',author:'agent',text})
const staff=text=>({direction:'outbound',author:'staff',text})
const route=(messages,pin=only,verifiedRoutes={},extra={})=>operationalRouting({pin,body:{mode:'sugestao',stage:'with_agent',messages,...extra},verifiedRoutes})
const auto='Gostaria de cotar um seguro para meu carro.'
const quote=t=>[user(t)]
const verified={Auto:{verified:true,department:'patrimonio'},Saúde:{verified:true,department:'comercial'},Residencial:{verified:true,department:'patrimonio'},Vida:{verified:true,department:'comercial'}}

test('Fase 2: padrão delega o handler original sem impor novo agente',()=>{
 assert.deepEqual(route(quote(auto),both),{action:'delegate',agent:null,reason:'legacy_unchanged',executed:false})
})
test('Fase 2: bloqueia protocolo atribuído, encerrado, desligado ou pin ausente',()=>{
 for(const stage of ['assigned','resolved'])assert.equal(route(quote(auto),only,{}, {stage}).action,'blocked')
 assert.equal(route(quote(auto),only,{}, {mode:'desligado'}).action,'blocked')
 assert.equal(route(quote(auto),null).action,'blocked')
 assert.equal(route([bot('Sim')]).action,'blocked')
})
test('Fase 2: cotação direta Auto, Saúde, Residencial, Vida, sem triagem comercial',()=>{
 for(const [text,product,target] of [[auto,'Auto','auto_re'],['Quero contratar um plano de saúde para minha empresa.','Saúde','health'],['Quero cotar seguro residencial.','Residencial','auto_re'],['Quero cotar seguro de vida.','Vida','life']]){
  const messages=quote(text),off=route(messages)
  assert.equal(off.action,'reply',text);assert.equal(off.product,product,text)
  assert.equal(off.logicalTarget,target);assert.equal(off.humanHandoff,false)
  assert.doesNotMatch(off.reply,/Murilo|CPF|CNPJ|placa|quantas vidas/)
  const actual=route([...messages,bot(off.reply),user('Sim')],only,verified)
  assert.equal(actual.action,'propose_handoff',text);assert.equal(actual.handoff.department,verified[product].department)
  assert.equal(actual.agent,'clara');assert.match(actual.reply,/Obrigada/)
 }
})
test('Fase 2: mapeamento não validado bloqueia proposta de handoff, sem fallback Backoffice',()=>{
 const off=route(quote(auto)),history=[user(auto),bot(off.reply),user('Sim')]
 for(const routes of [{},{Auto:{verified:false,department:'patrimonio'}},{Auto:{verified:true,department:'backoffice'}},{Auto:{verified:true,department:'inventada'}}]){
  const r=route(history,only,routes);assert.equal(r.action,'mapping_required')
  assert.equal(r.humanHandoff,false);assert.equal(r.handoff,null)
 }
})
test('Fase 2: produto indefinido, ambiguidade e confirmação sem oferta',()=>{
 const first=route(quote('Gostaria de fazer uma cotação.'))
 assert.match(first.reply,/Qual produto/)
 const second=route([user('Gostaria de fazer uma cotação.'),bot(first.reply),user('Seguro de vida.')])
 assert.equal(second.product,'Vida')
 assert.equal(route(quote('Quero cotar seguro de carro e de vida.')).product,undefined)
 assert.equal(route(quote('Sim'),only,verified).action,'delegate')
})
test('Fase 2: apenas oferta entregue pelo agente autoriza o aceite',()=>{
 const off=route(quote(auto))
 const fake=route([user(off.reply),user('Sim')],only,verified)
 assert.notEqual(fake.action,'propose_handoff')
 const interrupted=route([user(auto),bot(off.reply),staff('Olá'),user('Sim')],only,verified)
 assert.notEqual(interrupted.action,'propose_handoff')
 const changed=route([user(auto),bot(off.reply),user('Quero cotar seguro de vida.')],only,verified)
 assert.equal(changed.product,'Vida');assert.equal(changed.humanHandoff,false)
})
test('Fase 2: recusa, negativa composta e mensagem vaga nunca acionam humano',()=>{
 const off=route(quote(auto))
 for(const text of ['Não','Não quero falar com o comercial de Auto.','Talvez','Não me encaminhe']){
  const r=route([user(auto),bot(off.reply),user(text)],only,verified)
  assert.equal(r.humanHandoff,false,text)
 }
})
test('Fase 2: serviços, urgências e áudio usam Clara, não a nova rota comercial',()=>{
 for(const text of ['Houve um princípio de incêndio na minha residência.','Meu carro foi roubado e quero uma cotação.','Preciso excluir minha esposa do plano odontológico.','Preciso de uma segunda via do boleto.','[cliente enviou um áudio]','Preciso de atendimento hospitalar urgente.']){
  const r=route(quote(text),only,verified);assert.equal(r.action,'delegate',text);assert.equal(r.agent,'clara')
 }
 const off=route(quote(auto))
 const r=route([user(auto),bot(off.reply),user('Preciso de uma segunda via do boleto.')],only,verified)
 assert.equal(r.action,'delegate');assert.equal(r.agent,'clara')
})
test('Fase 2: ajuste editorial mantém o simulador homologado',()=>{
 const r=previewDecision(newPreviewProtocol(MODES.CLARA_ONLY),auto)
 assert.match(previewDecision(r.state,'Sim').reply,/Obrigada pela confirmação/)
})
test('Fase 2: isolamento exige preview específico, flag e chave publicável do projeto autorizado',()=>{
 const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/orquestracao-agentes-fase3-preview',PHX_ORCH_TEST_ENABLED:'true',VITE_SUPABASE_URL:'https://cxyxrhmpjehrqhwihxul.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}
 assert.equal(isolatedConfig(env).url,env.VITE_SUPABASE_URL)
 for(const change of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{PHX_ORCH_TEST_ENABLED:'false'},{VITE_SUPABASE_URL:'https://example.com'},{VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'},{VITE_SUPABASE_PUBLISHABLE_KEY:''}]){
  assert.equal(isolatedConfig({...env,...change}),null)
 }
})
test('Fase 2: autorização requer sessão validada e permissão RLS do schema',async()=>{
 const client={auth:{getUser:async token=>({data:{user:{id:actor}},error:token==='valid'?null:{message:'invalid'}})},rpc:async()=>({data:{mode:'clara_murilo',revision:1}})}
 assert.equal(await authorizedAdmin(client,'Bearer valid'),actor)
 assert.equal(await authorizedAdmin({...client,rpc:async()=>({data:null})},'Bearer valid'),null)
 assert.equal(await authorizedAdmin(client,'Bearer invalid'),null)
 assert.equal(await authorizedAdmin(client,'Basic valid'),null)
})
test('Fase 2: persistência central usa RPCs específicos e não aceita revisão falsa ou pin divergente',async()=>{
 const calls=[],client={rpc:async(name,args)=>{calls.push([name,args]);return {data:{mode:'clara_murilo',revision:1, ...(name.endsWith('_pin')?{protocol_ref:protocol}:{})},error:null}}}
 const store=centralStore(client)
 assert.equal((await store.get()).revision,1)
 await store.set('clara_only',1,actor);assert.deepEqual(calls[1],['phx_orch_test_set',{p_mode:'clara_only',p_expected_revision:1,p_actor:actor}])
 const pinned=await store.pin(protocol,false);assert.equal(pinned.protocol_ref,protocol)
 assert.throws(()=>store.set('invalid',1,actor),/invalid_configuration/)
 await assert.rejects(store.pin('bad',true),/invalid_protocol/)
 const mismatch=centralStore({rpc:async()=>({data:{mode:'clara_only',revision:2,protocol_ref:actor}})})
 await assert.rejects(mismatch.pin(protocol,true),/invalid_protocol_pin/)
})
test('Fase 2: em memória, dois operadores e pins preservam revisão; conflitos não sobrescrevem',async()=>{
 // Test double da interface RPC; NÃO comprova execução do SQL no Supabase.
 let conf={mode:'clara_murilo',revision:1};const pins=new Map()
 const rpc=async(name,args)=>{
  if(name.endsWith('_get'))return {data:{...conf}}
  if(name.endsWith('_set')){
   if(args.p_expected_revision!==conf.revision)return {data:{...conf,conflict:true}}
   if(args.p_mode!==conf.mode)conf={mode:args.p_mode,revision:conf.revision+1}
   return {data:{...conf}}
  }
  const ref=args.p_protocol_ref
  if(!pins.has(ref))pins.set(ref,{protocol_ref:ref,...(args.p_new_protocol?conf:both)})
  return {data:pins.get(ref)}
 }
 const a=centralStore({rpc}),b=centralStore({rpc})
 await a.pin(protocol,true)
 await a.set('clara_only',1,actor)
 assert.equal((await b.get()).mode,'clara_only')
 assert.equal((await b.set('clara_murilo',1,actor)).conflict,true)
 assert.equal((await b.pin(protocol,false)).mode,'clara_murilo')
 assert.equal((await b.pin(actor,true)).mode,'clara_only')
 assert.equal((await b.pin('33333333-3333-4333-8333-333333333333',false)).mode,'clara_murilo')
})
test('Fase 2: API não configurada responde 503 sem rede e SQL limita acesso',async()=>{
 const env=process.env.PHX_ORCH_TEST_ENABLED;delete process.env.PHX_ORCH_TEST_ENABLED
 try{
  let status,data;const res={setHeader(){},status(n){status=n;return this},json(x){data=x;return this}}
  await handler({method:'POST',headers:{},body:{action:'get'}},res)
  assert.equal(status,503);assert.equal(data.error,'isolated_environment_not_configured')
 }finally{if(env!==undefined)process.env.PHX_ORCH_TEST_ENABLED=env}
 const sql=await readFile(new URL('../docs/sql/orchestration-phase2-isolated.sql',import.meta.url),'utf8')
 assert.match(sql,/for update/i);assert.match(sql,/on conflict\(protocol_ref\) do nothing/i)
 assert.match(sql,/enable row level security/);assert.doesNotMatch(sql,/security definer/i)
 const api=await readFile(new URL('../api/orchestration-central-preview.js',import.meta.url),'utf8')
 assert.match(api,/humanHandoff:false,handoff:null,executed:false/)
 const live=await readFile(new URL('../api/v1/conversations/respond.js',import.meta.url),'utf8')
 assert.match(live,/operational_preview_disabled/);assert.match(live,/runOrchestrationPreview/);assert.doesNotMatch(live,/orchestration-central-preview/)
})
