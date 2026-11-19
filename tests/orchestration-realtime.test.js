import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolvePilotMode} from '../server/orchestration-pilot.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
const uuid='11111111-1111-4111-8111-111111111111'
const user=text=>({direction:'inbound',author:'contact',type:'texto',text})
const body={conversation_id:uuid,protocolo:'20260101-1234',mode:'sugestao',contact:{kind:'lead'},agent_hint:'murilo',messages:[user('Gostaria de cotar um seguro para meu carro.')]}
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
const sources=['database/edge-runtime/phoenix-one-bridge-v14-orchestration.ts','supabase/functions/phoenix-one-bridge/index.ts']
function action(src,from,to){const start=src.indexOf(from),end=src.indexOf(to,start+from.length);assert.ok(start>=0&&end>start);return src.slice(start,end)}
const reply=(status,data)=>({status,data})
for(const path of sources){
 test('Tempo real: Bridge lê estratégia global, não usa cutoff nem pin anterior: '+path,async()=>{
  const block=action(read(path),"  if(data.action==='orchestration_pilot_pin'){","  if(data.action==='intro_status'){")
  const run=new AsyncFunction('data','uuid','pg','reply',block)
  let config={mode:'clara_murilo',revision:1},stage='with_agent',owner=uuid
  const tx={unsafe:async(q,args)=>{
   if(q.includes('pg_advisory_xact_lock'))return []
   if(q.startsWith('delete from phoenix_one.protocol_agent_state'))return []
   if(q.startsWith('select conversation_id::text,stage'))return [{conversation_id:owner,stage}]
   if(q.startsWith('select mode,revision from phoenix_one.orchestration_pilot_settings'))return [{...config}]
   if(q.startsWith('insert into phoenix_one.protocol_agent_state'))return [{clara_apresentada:true,murilo_apresentado:true}]
   throw Error('unexpected SQL '+q)
  }}
  const pg={begin:f=>f(tx)}
  const bridge=async(action,p)=>{const result=await run({action,...p},x=>x===uuid,pg,reply);assert.equal(result.status,200);return result.data}
  const env={VERCEL_ENV:'production'}
  for(const [mode,revision] of [['clara_murilo',1],['clara_only',2],['clara_murilo',3],['clara_only',4]]){
   config={mode,revision}
   for(const protocolo of [body.protocolo,body.protocolo+'-1','20990101-4321']){
    const r=await resolvePilotMode({...body,protocolo},env,bridge,{clara:true,murilo:true})
    assert.equal(r.mode,mode);assert.equal(r.revision,revision);assert.equal(r.intro.murilo_apresentado,true)
   }
  }
  for(const blocked of ['assigned','resolved']){
   stage=blocked
   await assert.rejects(resolvePilotMode(body,env,bridge),/protocol_not_with_agent/)
  }
  stage='with_agent';owner='22222222-2222-4222-8222-222222222222'
  await assert.rejects(resolvePilotMode(body,env,bridge),/protocol_not_with_agent/)
 })
}
test('Tempo real: seletor administrativo atualiza imediatamente e impede revisão obsoleta',async()=>{
 const src=read('supabase/functions/phoenix-one-admin/index.ts')
 const block=action(src,"   if(action==='orchestration_pilot_set'){","   if(action==='status'){")
 const run=new AsyncFunction('action','request','sql','respond',block)
 let row={mode:'clara_murilo',revision:1,cutoff:'2099-01-01'}
 const tx={unsafe:async(q,args)=>{
  if(q.includes('pg_advisory_xact_lock'))return []
  if(q.startsWith('select mode,revision,cutoff'))return [{...row}]
  if(q.startsWith('update phoenix_one.orchestration_pilot_settings')){
   assert.match(q,/cutoff=null where id=true and revision=\$2/)
   if(args[1]!==row.revision)return []
   row={mode:args[0],revision:row.revision+1,cutoff:null};return [{...row}]
  }
  throw Error('unexpected SQL '+q)
 }}
 const sql={begin:f=>f(tx)}
 for(const mode of ['clara_only','clara_murilo','clara_only']){
  const old=row.revision
  const r=await run('orchestration_pilot_set',{mode,revision:old},sql,reply)
  assert.equal(r.status,200);assert.deepEqual(r.data,{mode,revision:old+1,cutoff:null})
  const stale=await run('orchestration_pilot_set',{mode,revision:old},sql,reply)
  assert.equal(stale.status,409);assert.equal(row.revision,old+1)
 }
 assert.equal((await run('orchestration_pilot_set',{mode:'invalid',revision:row.revision},sql,reply)).status,400)
})
test('Tempo real: mesmo protocolo muda para Clara e volta ao fluxo original sem rede',async()=>{
 let config={mode:'clara_murilo',revision:1}
 const bridge=async()=>({...config,blocked:false,clara_apresentada:false,murilo_apresentado:false})
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('unexpected network')}
 try{
  const run=async()=>{const pin=await resolvePilotMode(body,{VERCEL_ENV:'production'},bridge);const res={code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}};await respondValidated(body,res,pin);assert.equal(res.code,200);return res.data}
  const original=await run();assert.equal(original.humanHandoff,false);assert.match(original.reply,/como posso te chamar/i)
  config={mode:'clara_only',revision:2}
  const changed=await run();assert.equal(changed.agent,'clara');assert.equal(changed.humanHandoff,false);assert.match(changed.reply,/encaminhar sua solicitação de Auto/i)
  config={mode:'clara_murilo',revision:3}
  assert.deepEqual(await run(),original)
 }finally{globalThis.fetch=old}
})
test('Tempo real: painel descreve a mudança global sem agendamento',()=>{
 const src=read('src/IntegrationsAdmin.jsx')
 assert.match(src,/vigência imediata/)
 assert.match(src,/inclusive em protocolos em aberto/)
 assert.doesNotMatch(src,/meia-noite|pilot\.cutoff/)
})
