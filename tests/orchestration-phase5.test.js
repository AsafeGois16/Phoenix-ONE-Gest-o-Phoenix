import test from 'node:test'
import assert from 'node:assert/strict'
import handler,{runOrchestrationJoint} from '../api/v1/conversations/respond.js'
import events from '../api/v1/events.js'
import {JOINT_BRANCH,jointConfig,authorizeJointRequest,makeJointRuntime,makeJointStore} from '../server/joint-test-runtime.js'
const user=text=>({direction:'inbound',author:'contact',type:'texto',text})
const bot=text=>({direction:'outbound',author:'agent',type:'texto',text})
const pin={mode:'clara_only',revision:2}
const body=(messages,extra={})=>({conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20261119-0001',mode:'sugestao',contact:{kind:'lead'},agent_hint:'murilo',messages,...extra})
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}})
const cfg={prompts:{clara:'fake-test-prompt',murilo:'fake-test-prompt'},modelKey:'sk-test-only',dbUrl:'https://fixture.invalid',dbKey:'fake',dbJwt:'fake',activationDate:'20261119',token:'fake-test-only',phone:'+5511999990000'}
const store={async intro(p){return {blocked:false,clara_apresentada:p.observedClara,murilo_apresentado:p.observedMurilo}}}
test('F5: default fail closed e número exclusivo',()=>{
 assert.equal(jointConfig({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:JOINT_BRANCH,PHX_JOINT_ENABLED:'true',PHOENIX_ONE_TOKEN:'legacy'}),null)
 assert.equal(jointConfig({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:JOINT_BRANCH}),null)
 assert.equal(jointConfig({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:JOINT_BRANCH}),null)
 const req={headers:{authorization:'Bearer fake-test-only'},body:{contact:{phone_e164:cfg.phone}}}
 assert.equal(authorizeJointRequest(req,cfg),true)
 assert.equal(authorizeJointRequest({...req,body:{}},cfg),false)
 assert.equal(authorizeJointRequest({...req,headers:{authorization:'Bearer legacy'}},cfg),false)
})
test('F5: endpoints compartilhados bloqueados sem rede',async()=>{
 const old=process.env.VERCEL_GIT_COMMIT_REF,original=globalThis.fetch
 process.env.VERCEL_GIT_COMMIT_REF=JOINT_BRANCH;globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN')}
 try{for(const fn of [handler,events]){const res=response();await fn({method:'POST',headers:{},body:{}},res);assert.equal(res.code,503);assert.equal(res.data.error,'joint_environment_not_ready')}}
 finally{globalThis.fetch=original;if(old===undefined)delete process.env.VERCEL_GIT_COMMIT_REF;else process.env.VERCEL_GIT_COMMIT_REF=old}
})
test('F5: transporte store envia só referências mínimas',async()=>{
 const calls=[]
 const s=makeJointStore(cfg,async(url,opts)=>{calls.push({url,args:JSON.parse(opts.body)});return {ok:true,json:async()=>({environment:'phoenix_joint_v1',mode:'clara_only',revision:2,blocked:false})}})
 assert.equal((await s.pin(body([user('texto privado não persistir')]))).mode,'clara_only')
 assert.equal(calls[0].url,'https://fixture.invalid/rest/v1/rpc/phx_joint_pin');assert.equal(calls[0].args.p_eligible,true)
 assert.doesNotMatch(JSON.stringify(calls),/texto privado|messages|contact/)
})
test('F5: contrato operacional candidato Clara para patrimonio com intent',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN')}
 try{
  const rt=makeJointRuntime(cfg,store,pin,globalThis.fetch)
  const messages=[user('Gostaria de cotar um seguro para meu carro.')]
  const a=response();await runOrchestrationJoint(body(messages),pin,rt,a);assert.equal(a.data.humanHandoff,false)
  const b=response();await runOrchestrationJoint(body([...messages,bot(a.data.reply),user('Sim')]),pin,rt,b);assert.equal(b.code,200);assert.equal(b.data.agent,'clara');assert.equal(b.data.humanHandoff,true);assert.equal(b.data.handoff.department,'patrimonio');assert.equal(b.data.handoff.intent,'nova_cotacao')
  const no=response();await runOrchestrationJoint(body([...messages,bot(a.data.reply),user('Não')]),pin,rt,no);assert.equal(no.data.humanHandoff,false)
  const incident=response();await runOrchestrationJoint(body([user('Acabei de bater meu carro.')]),pin,rt,incident);assert.match(incident.data.reply,/local seguro/);assert.equal(incident.data.handoff,null)
 }finally{globalThis.fetch=original}
})
test('F5: modelo mock, RAG fictícia, identidade fixture e bloqueio sem rede',async()=>{
 const calls=[]
 const rt=makeJointRuntime(cfg,store,pin,async(url,opts)=>{calls.push({url,data:JSON.parse(opts.body)});return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Como posso ajudar?',humanHandoff:false,handoff:null})}]}]})}})
 const res=response();await runOrchestrationJoint(body([user('O que é franquia?')]),pin,rt,res);assert.equal(res.code,200)
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.openai.com/v1/responses');assert.equal(calls[0].data.store,false)
 const skipped=response();await runOrchestrationJoint(body([user('Olá')],{mode:'desligado'}),pin,rt,skipped);assert.equal(skipped.data.humanHandoff,false);assert.equal(calls.length,1)
 assert.equal((await rt.bridge('context',{agent:'clara'})).sources.every(s=>s.title.startsWith('[TESTE]')),true)
 await assert.rejects(rt.bridge('identity_context',{agent:'clara'}),/denied/)
 await assert.rejects(rt.bridge('context',{agent:'murilo'}),/mismatch/)
 const id='11111111-1111-4111-8111-111111111111'
 assert.equal((await rt.identity(id,'20261119-0001',{status:'valid',type:'cpf',number:'00000000000'})).status,'not_found')
 const doc={status:'valid',type:'cpf',number:'11144477735'}
 assert.equal((await rt.identity(id,'20261119-0001',doc)).status,'verification_required')
 assert.equal((await rt.identity(id,'20261119-0001',doc,{birth_date:'1990-01-01'})).policies[0].seguradora,'Seguradora Fictícia Teste')
})
