import test from 'node:test'
import assert from 'node:assert/strict'
import {resolvePilotMode} from '../server/orchestration-pilot.js'
import {operationalRouting,LEGACY_COMMERCIAL_ROUTES} from '../server/orchestration-operational.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
const env={VERCEL_ENV:'production',PHX_ORCHESTRATION_PILOT_ENABLED:'true',PHX_ORCHESTRATION_PILOT_PHONE:'+5511999990000'}
const user=text=>({direction:'inbound',author:'contact',type:'texto',text})
const bot=text=>({direction:'outbound',author:'agent',type:'texto',text})
const body={conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20990103-0001',mode:'sugestao',contact:{kind:'lead',phone_e164:env.PHX_ORCHESTRATION_PILOT_PHONE},messages:[user('Gostaria de cotar um seguro para meu carro.')],agent_hint:'murilo'}
const pin={mode:'clara_only',revision:2}
test('Piloto: padrão legado sem chamadas em preview, flag desligada, número ausente ou diferente',async()=>{
 const deny=async()=>{throw Error('NETWORK_FORBIDDEN')}
 for(const e of [{},{...env,VERCEL_ENV:'preview'},{...env,PHX_ORCHESTRATION_PILOT_ENABLED:'false'}])assert.equal(await resolvePilotMode(body,e,deny),null)
 for(const b of [{...body,contact:{}},{...body,contact:{phone_e164:'+5511999990001'}},{...body,mode:'desligado'},{...body,messages:[bot('Olá')]}])assert.equal(await resolvePilotMode(b,env,deny),null)
})
test('Piloto: usa pin do servidor, nunca modo/hint do payload, falhas não ativam Clara',async()=>{
 let times=0
 const r=await resolvePilotMode({...body,mode_override:'clara_only'},env,async(action,p)=>{times++;assert.equal(action,'orchestration_pilot_pin');assert.deepEqual(p,{conversationId:body.conversation_id,protocolo:body.protocolo});return {mode:'clara_murilo',revision:1}})
 assert.equal(times,1);assert.equal(r.mode,'clara_murilo')
 await assert.rejects(resolvePilotMode(body,env,async()=>({mode:'clara_only',revision:0})))
})
test('Piloto: V1.4 cotação Auto com campo intent após confirmação; recusa sem handoff',()=>{
 const route=messages=>operationalRouting({pin,body:{...body,messages},verifiedRoutes:LEGACY_COMMERCIAL_ROUTES})
 const first=route(body.messages);assert.equal(first.humanHandoff,false)
 const next=route([...body.messages,bot(first.reply),user('Sim')]);assert.equal(next.agent,'clara');assert.equal(next.handoff.department,'patrimonio');assert.equal(next.handoff.intent,'nova_cotacao')
 assert.equal(route([...body.messages,bot(first.reply),user('Não')]).humanHandoff,false)
})
test('Piloto: integração no motor real com bridge simulado, sem consulta externa',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.VITE_SUPABASE_URL,oldToken=process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN
 process.env.VITE_SUPABASE_URL='https://fixture.invalid';process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fixture-token'
 let requests=0
 globalThis.fetch=async(url,opts)=>{requests++;assert.equal(url,'https://fixture.invalid/functions/v1/phoenix-one-bridge');assert.equal(JSON.parse(opts.body).action,'intro_status');return {ok:true,json:async()=>({blocked:false,clara_apresentada:false,murilo_apresentado:false})}}
 try{
  const run=async messages=>{const res={code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}};await respondValidated({...body,messages},res,pin);assert.equal(res.code,200);return res.data}
  const first=await run(body.messages);assert.equal(first.agent,'clara');assert.equal(first.humanHandoff,false)
  const result=await run([...body.messages,bot(first.reply),user('Sim')]);assert.equal(result.agent,'clara');assert.equal(result.humanHandoff,true);assert.equal(result.handoff.department,'patrimonio');assert.equal(result.handoff.intent,'nova_cotacao')
  assert.equal(requests,2)
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldToken===undefined)delete process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN;else process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN=oldToken}
})
