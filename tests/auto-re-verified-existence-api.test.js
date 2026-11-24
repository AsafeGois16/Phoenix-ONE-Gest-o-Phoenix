import test from 'node:test'
import assert from 'node:assert/strict'
import {respondValidated} from '../api/v1/conversations/respond.js'
const inc=text=>({direction:'inbound',author:'contact',type:'texto',text})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const initial='Olá! Quero renovar o seguro do meu Hyundai Creta 2023. Minha apólice vence em 15/12/2026.'
const docPrompt='Para ajudar a equipe a localizar seu cadastro e evitar perguntas repetidas, pode me informar o número do CPF do titular? Se preferir não informar, seguimos com a cotação normalmente.'
const offer='Encontrei um Seguro Auto cadastrado após a confirmação de identidade. Posso encaminhar sua renovação diretamente à equipe Auto/RE?'
const conversation=[
 inc(initial),out('Olá! Sou a Clara, concierge da Phoenix Insurance. Como posso te chamar?'),
 inc('Pode me chamar de Asafe'),out('Posso passar sua cotação de seguro Auto ao Murilo?'),inc('Sim'),
 out('Olá! Sou o Murilo, do time comercial da Phoenix Insurance. O veículo está no nome de pessoa física (CPF) ou jurídica (CNPJ)?'),
 inc('CPF'),out(docPrompt),inc('529.982.247-25')
]
const pin={mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}}
const body=messages=>({
 conversation_id:'11111111-1111-4111-8111-111111111111',
 protocolo:'20990101-1105',mode:'sugestao',contact:{kind:'lead'},agent_hint:'murilo',
 verification_ref:'b'.repeat(48),messages
})
const response=()=>({code:200,data:null,setHeader(){},status(n){this.code=n;return this},json(v){this.data=v;return v}})
async function withVerifiedBridge(policyList,run){
 const previous={fetch:globalThis.fetch,values:Object.fromEntries([
  'PHX_AUTO_RE_DOCUMENT_INTAKE','PHX_AUTO_RE_VERIFIED_LOOKUP','PHOENIX_ONE_V4_VERIFIED_CONTEXT',
  'PHX_MURILO_CLOSED_QUESTIONS','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN'
 ].map(k=>[k,process.env[k]]))}
 const calls=[]
 try{
  process.env.PHX_AUTO_RE_DOCUMENT_INTAKE='true'
  process.env.PHX_AUTO_RE_VERIFIED_LOOKUP='true'
  process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT='true'
  process.env.PHX_MURILO_CLOSED_QUESTIONS='true'
  process.env.VITE_SUPABASE_URL='https://example.supabase.co'
  process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='integration-fixture-secret'
  globalThis.fetch=async (url,opts)=>{
   calls.push({url,body:JSON.parse(opts.body)})
   return {ok:true,status:200,json:async()=>({
    status:'verified',verified_at:new Date(Date.now()-60000).toISOString(),
    expires_at:new Date(Date.now()+3600000).toISOString(),
    field_scopes:['policies.read'],policies:policyList,verification_ref:'b'.repeat(48)
   })}
  }
  return await run(calls)
 }finally{
  globalThis.fetch=previous.fetch
  for(const [k,v] of Object.entries(previous.values)){
   if(v===undefined)delete process.env[k]
   else process.env[k]=v
  }
 }
}
test('PORT API1: consulta autenticada: existe Auto, resposta sem marca/placa/modelo',async()=>{
 await withVerifiedBridge([{product_code:'auto',ramo:'Automóvel',numero:'SEGREDO',seguradora:'SEGREDO'}],async calls=>{
  const res=response()
  await respondValidated(body(conversation),res,pin)
  assert.equal(res.code,200)
  assert.equal(res.data.agent,'murilo')
  assert.equal(res.data.humanHandoff,false)
  assert.match(res.data.reply,/Encontrei um Seguro Auto cadastrado/)
  assert.doesNotMatch(res.data.reply,/Creta|Hyundai|SEGREDO|automóvel|2023|placa|modelo/i)
  assert.equal(calls.length,1)
  assert.equal(calls[0].body.action,'identity_context')
  assert.equal(calls[0].body.purpose,'quote')
  assert.equal(calls[0].body.productCode,'auto')
  assert.equal(calls[0].body.protocolo,'20990101-1105')
 })
})
test('PORT API2: cliente aceita, consulta novamente o mesmo protocolo e encaminha patrimonio',async()=>{
 await withVerifiedBridge([{product_code:'auto',ramo:'Automóvel',numero:'SEGREDO'}],async calls=>{
  const res=response()
  await respondValidated(body([...conversation,out(offer),inc('Sim')]),res,pin)
  assert.equal(res.code,200)
  assert.equal(res.data.agent,'murilo')
  assert.equal(res.data.humanHandoff,true)
  assert.equal(res.data.handoff?.department,'patrimonio')
  assert.equal(res.data.handoff?.intent,'nova_cotacao')
  assert.equal(res.data.handoff?.product,'auto')
  assert.equal(calls.length,1)
  assert.doesNotMatch(res.data.reply,/Creta|SEGREDO|placa|modelo/i)
 })
})
test('PORT API3: cliente recusa e Murilo segue o roteiro sem abrir lead',async()=>{
 await withVerifiedBridge([{product_code:'auto',ramo:'Automóvel'}],async calls=>{
  const res=response()
  await respondValidated(body([...conversation,out(offer),inc('Não')]),res,pin)
  assert.equal(res.code,200)
  assert.equal(res.data.agent,'murilo')
  assert.equal(res.data.humanHandoff,false)
  assert.equal(res.data.handoff,null)
  assert.equal(calls.length,1)
  assert.doesNotMatch(res.data.reply,/Encontrei um Seguro Auto cadastrado|Posso encaminhar sua renovação diretamente/i)
 })
})
test('PORT API4: sem Auto cadastrado, não inventa existência e continua triagem',async()=>{
 await withVerifiedBridge([{product_code:'vida',ramo:'Vida'}],async calls=>{
  const res=response()
  await respondValidated(body(conversation),res,pin)
  assert.equal(res.code,200)
  assert.equal(res.data.humanHandoff,false)
  assert.doesNotMatch(res.data.reply,/Encontrei um Seguro Auto cadastrado|SEGREDO/i)
  assert.equal(calls.length,1)
 })
})
test('PORT API5: sem nova verificação, SIM não libera transferência',async()=>{
 await withVerifiedBridge([{product_code:'vida',ramo:'Vida'}],async calls=>{
  const res=response()
  await respondValidated(body([...conversation,out(offer),inc('Sim')]),res,pin)
  assert.equal(res.code,200)
  assert.equal(res.data.humanHandoff,false)
  assert.equal(res.data.handoff,null)
  assert.equal(calls.length,1)
 })
})
