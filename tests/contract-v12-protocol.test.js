import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {readFile} from 'node:fs/promises'
import {validJuniorProtocol} from '../server/protocol-contract.js'
import {juniorIdentityContext,hmacSignature} from '../server/junior-v1.js'
import respond from '../api/v1/conversations/respond.js'
import events from '../api/v1/events.js'

const uuid='00000000-0000-4000-8000-000000000001'
const token='fake-junior-token'
const oldValues=keys=>Object.fromEntries(keys.map(k=>[k,process.env[k]]))
const restore=values=>{for(const [k,v] of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
const mockRes=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(value){this.body=value;return this}})
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})

test('contrato Junior v1.2: formato antigo e novos sufixos',()=>{
 for(const p of ['20261109-0001','20261106-0013-1','20261010-0003-2','20261109-9999-123'])
  assert.equal(validJuniorProtocol(p),true,p)
 for(const p of ['20261109-0001-0','20261109-0001-01','20261109-0001-','20261109-001','20261109-00012',
  '20261109-0001-extra','20261109-0001-1-2','20261109-0001/2','20261109-0001%2F','20261109-0001\n'])
  assert.equal(validJuniorProtocol(p),false,p)
})
test('POST respond aceita protocolo com sufixo sem gerar número novo ao cliente',async()=>{
 const keys=['PHOENIX_ONE_TOKEN']
 const old=oldValues(keys)
 process.env.PHOENIX_ONE_TOKEN=token
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
   conversation_id:uuid,protocolo:'20261010-0003-2',mode:'desligado',agent_hint:'clara',
   contact:{kind:'cliente'},messages:[inc('Olá')]
  }}
  const res=mockRes();await respond(req,res)
  assert.equal(res.statusCode,200)
  assert.equal(res.body.humanHandoff,false)
  assert.doesNotMatch(res.body.reply,/20261010-0003-2/)
 }finally{restore(old)}
})
test('juniorIdentityContext encaminha protocolo com sufixo sem desautorizar consulta segura',async()=>{
 const keys=['VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const old=oldValues(keys),priorFetch=globalThis.fetch
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='bridge-token-fake'
 let called=false
 globalThis.fetch=async(_url,opts)=>{
  const data=JSON.parse(opts.body)
  assert.equal(data.action,'identity_context')
  assert.equal(data.protocolo,'20261010-0003-2')
  assert.equal(data.document,'11144477735')
  called=true
  return {ok:true,status:200,async json(){return {status:'verified',policies:[],installments:[],pending:[]}}}
 }
 try{
  const r=await juniorIdentityContext(uuid,'20261010-0003-2',{status:'valid',type:'cpf',number:'11144477735'},null)
  assert.equal(r.status,'verified')
  assert.equal(called,true)
 }finally{globalThis.fetch=priorFetch;restore(old)}
})
test('webhook ticket.assigned.v1 aceita id com sufixo e exige HMAC válido',async()=>{
 const keys=['PHOENIX_ONE_WEBHOOK_SECRET','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const old=oldValues(keys),priorFetch=globalThis.fetch
 process.env.PHOENIX_ONE_WEBHOOK_SECRET='webhook-key-fake'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='bridge-key-fake'
 const event={event_id:'00000000-0000-4000-8000-000000000003',
  event_type:'ticket.assigned.v1',occurred_at:'2026-11-09T11:00:00Z',
  ticket:{id:'20261010-0003-2',conversation_id:uuid,department:'patrimonio',agent:'clara',status:'assigned'}}
 const body=JSON.stringify(event),ts=String(Math.floor(Date.now()/1000))
 let seen=false
 globalThis.fetch=async(_url,opts)=>{
  const data=JSON.parse(opts.body)
  assert.equal(data.action,'event')
  assert.equal(data.event.ticket.id,event.ticket.id)
  seen=true
  return {ok:true,status:200,async json(){return {status:'processed'}}}
 }
 try{
  const req=Readable.from([Buffer.from(body)])
  req.method='POST'
  req.headers={'x-phoenix-timestamp':ts,'x-phoenix-event-id':event.event_id,
   'x-phoenix-signature':hmacSignature(ts,body,process.env.PHOENIX_ONE_WEBHOOK_SECRET)}
  const res=mockRes()
  await events(req,res)
  assert.equal(res.statusCode,200)
  assert.equal(seen,true)
 }finally{globalThis.fetch=priorFetch;restore(old)}
})
test('bridge documenta formato com sufixo nos quatro pontos de entrada',async()=>{
 const code=await readFile(new URL('../supabase/functions/phoenix-one-bridge/index.ts',import.meta.url),'utf8')
 const n=code.split('^\\d{8}-\\d{4}(?:-[1-9]\\d*)?$').length-1
 assert.equal(n,4)
})
