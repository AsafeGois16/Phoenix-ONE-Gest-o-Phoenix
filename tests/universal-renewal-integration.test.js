import test from 'node:test'
import assert from 'node:assert/strict'
import {respondValidated} from '../api/v1/conversations/respond.js'

const inc=text=>({direction:'inbound',author:'contact',type:'texto',text})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const pin={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:false}}
const base=()=>[inc('Quero renovar meu seguro de vida.'),
 out('Olá! Sou a Clara, concierge da Phoenix Insurance. Como posso te chamar?'),
 inc('Mariana Silva')]
const response=()=>({statusCode:200,setHeader(){},status(v){this.statusCode=v;return this},json(v){this.data=v;return v}})
const payload=messages=>({conversation_id:'11111111-1111-4111-8111-111111111111',
 protocolo:'20990101-9890',mode:'sugestao',contact:{kind:'lead'},agent_hint:'murilo',messages})
const withFlags=async fn=>{
 const keys=['PHX_UNIVERSAL_RENEWAL_LOOKUP','PHOENIX_ONE_V4_VERIFIED_CONTEXT','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const before=keys.map(key=>process.env[key])
 const original=globalThis.fetch
 process.env.PHX_UNIVERSAL_RENEWAL_LOOKUP='true'
 process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT='true'
 process.env.VITE_SUPABASE_URL='https://junior-test.invalid'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fixture-only'
 try{await fn()}
 finally{
  globalThis.fetch=original
  keys.forEach((key,i)=>before[i]===undefined?delete process.env[key]:process.env[key]=before[i])
 }
}
test('API Clara oferece consulta da categoria sem chamar Junior antes do aceite',async()=>{
 await withFlags(async()=>{
  globalThis.fetch=async()=>{throw Error('lookup_before_consent')}
  const r=response()
  await respondValidated(payload(base()),r,pin)
  assert.equal(r.statusCode,200)
  assert.equal(r.data.agent,'clara')
  assert.match(r.data.reply,/posso confirmar sua identidade e consultar/i)
  assert.equal(r.data.humanHandoff,false)
  const declined=response()
  await respondValidated(payload([...base(),out(r.data.reply),inc('Não')]),declined,pin)
  assert.match(declined.data.reply,/posso encaminhar sua renovação ao Murilo/i)
 })
})
test('API consulta contexto verified de Vida e oferece Murilo sem citar a apólice',async()=>{
 await withFlags(async()=>{
  const first=response()
  globalThis.fetch=async()=>{throw Error('lookup_before_consent')}
  await respondValidated(payload(base()),first,pin)
  let calls=0
  globalThis.fetch=async (_url,options)=>{
   const body=JSON.parse(options.body)
   calls++
   assert.equal(body.action,'identity_context')
   assert.equal(body.purpose,'quote')
   assert.equal(body.productCode,'vida')
   assert.equal(body.verificationRef,'a'.repeat(48))
   return {ok:true,json:async()=>({
    status:'verified',verified_at:new Date(Date.now()-30000).toISOString(),
    expires_at:new Date(Date.now()+300000).toISOString(),
    field_scopes:['policies.read','profile.basic'],
    coverage_check:{product_code:'vida',numero:null,result:'found',count:1},
    verified_profile:{nome_tratamento:'Mariana',tipo_pessoa:'pf',relacao_com_contrato:'titular'},
    policies:[{product_code:'vida',seguradora:'Porto',fim_vigencia:'2026-12-15'}]
   })}
  }
  const body={...payload([...base(),out(first.data.reply),inc('Sim')]),verification_ref:'a'.repeat(48)}
  const r=response()
  await respondValidated(body,r,pin)
  assert.equal(r.statusCode,200)
  assert.equal(calls,1)
  assert.equal(r.data.agent,'clara')
  assert.match(r.data.reply,/confirmei que existe Seguro Vida/i)
  assert.match(r.data.reply,/ao Murilo/i)
  assert.doesNotMatch(r.data.reply,/Porto|2026-12-15|apólice n/i)
 })
})
