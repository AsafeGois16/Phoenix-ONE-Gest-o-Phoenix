import test from 'node:test'
import assert from 'node:assert/strict'
import handler,{respondValidated} from '../api/v1/conversations/respond.js'
const user=text=>({direction:'inbound',author:'contact',type:'texto',text})
const bot=text=>({direction:'outbound',author:'agent',type:'texto',text})
const body={conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20261119-0001',mode:'sugestao',contact:{kind:'lead'},messages:[user('Gostaria de cotar um seguro para meu carro.')]}
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}})
const pin=mode=>({mode,revision:2,intro:{blocked:false,clara_apresentada:false,murilo_apresentado:false}})
test('Strategy: mesmo agente Clara, duas estratégias distintas, contrato anterior preservado',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('unexpected network')}
 try{
  for(const strategy of ['clara_only','clara_murilo']){
   const res=response();await respondValidated(body,res,pin(strategy))
   assert.equal(res.code,200);assert.equal(res.data.agent,'clara');assert.equal(res.data.strategy,strategy)
   assert.equal(typeof res.data.reply,'string');assert.equal(res.data.humanHandoff,false);assert.equal(res.data.handoff,null)
  }
 }finally{globalThis.fetch=old}
})
test('Strategy: cotação direta preserva consentimento, departamento e intent',async()=>{
 const res=response();await respondValidated(body,res,pin('clara_only'))
 const accepted=response();await respondValidated({...body,messages:[...body.messages,bot(res.data.reply),user('Sim')]},accepted,pin('clara_only'))
 assert.equal(accepted.code,200);assert.equal(accepted.data.strategy,'clara_only');assert.equal(accepted.data.agent,'clara')
 assert.equal(accepted.data.humanHandoff,true);assert.equal(accepted.data.handoff.department,'patrimonio');assert.equal(accepted.data.handoff.intent,'nova_cotacao')
})
test('Strategy: sem snapshot não inventa modo, nem confia em valor do solicitante',async()=>{
 for(const snapshot of [null,{mode:'invalid',revision:1}]){
  const res=response();await respondValidated({...body,mode:'desligado',strategy:'clara_only'},res,snapshot)
  assert.equal(res.code,200);assert.equal(Object.hasOwn(res.data,'strategy'),false);assert.equal(res.data.humanHandoff,false)
 }
})
test('Strategy: usa snapshot do Bridge autenticado, alterna no mesmo protocolo, e omite em erro',async()=>{
 const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','PHX_ORCHESTRATION_PILOT_ENABLED','PHOENIX_ONE_TOKEN','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch
 Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',PHX_ORCHESTRATION_PILOT_ENABLED:'true',PHOENIX_ONE_TOKEN:'fixture-token',VITE_SUPABASE_URL:'https://fixture.invalid',PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN:'fixture-bridge'})
 let mode='clara_murilo',blocked=false,calls=0
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.equal(url,'https://fixture.invalid/functions/v1/phoenix-one-bridge');assert.equal(JSON.parse(opts.body).action,'orchestration_pilot_pin')
  return {ok:true,json:async()=>({mode,revision:2,blocked,clara_apresentada:false,murilo_apresentado:false})}
 }
 const run=async(authorization,b=body)=>{const res=response();await handler({method:'POST',headers:{authorization},body:b},res);return res}
 try{
  const invalid=await run('Bearer incorrect');assert.equal(invalid.code,401);assert.equal(Object.hasOwn(invalid.data,'strategy'),false);assert.equal(calls,0)
  for(const m of ['clara_murilo','clara_only','clara_murilo']){
   mode=m;const res=await run('Bearer fixture-token',{...body,strategy:'untrusted'})
   assert.equal(res.code,200);assert.equal(res.data.strategy,m);assert.equal(res.data.agent,'clara')
  }
  assert.equal(calls,3)
  const off=await run('Bearer fixture-token',{...body,mode:'desligado'});assert.equal(off.code,200);assert.equal(Object.hasOwn(off.data,'strategy'),false);assert.equal(calls,3)
  blocked=true;const res=await run('Bearer fixture-token');assert.equal(res.code,503);assert.equal(res.data.error,'protocol_not_with_agent');assert.equal(Object.hasOwn(res.data,'strategy'),false)
 }finally{globalThis.fetch=oldFetch;for(const k of keys){if(oldEnv[k]===undefined)delete process.env[k];else process.env[k]=oldEnv[k]}}
})
