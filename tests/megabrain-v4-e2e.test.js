import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const reference='A'.repeat(48)
const uuid='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const token='fake-phoenix-bridge-token'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const expiry=new Date(Date.now()+30*60*1000).toISOString()
const verifiedAt=new Date(Date.now()-1000).toISOString()
const json=data=>({ok:true,status:200,async json(){return data}})
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}})
const environment=['PHOENIX_ONE_TOKEN','PHOENIX_ONE_V4_VERIFIED_CONTEXT','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_MEGABRAIN_V3_READ','PHOENIX_MEGABRAIN_SHADOW']
async function scenario(messages,requestOptions,mock){
 const previous=Object.fromEntries(environment.map(x=>[x,process.env[x]])),before=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT='true'
 process.env.VITE_SUPABASE_URL='https://fake.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='internal-not-real'
 delete process.env.PHOENIX_MEGABRAIN_V3_READ
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 globalThis.fetch=mock
 try{
  const res=response()
  await handler({method:'POST',headers:{authorization:'Bearer '+token},
   body:{conversation_id:uuid,protocolo:'20261103-0001',mode:'automatico',agent_hint:'clara',
    contact:{kind:'cliente',display_name:'Contato',phone_e164:'+5511999999999'},
    verification_ref:reference,messages,...requestOptions}},res)
  return res
 }finally{globalThis.fetch=before;for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
}
const payload=(policies)=>({
 status:'verified',field_scopes:['profile.basic','policies.read','risk.auto.read','profile.location'],
 verified_profile:{nome_tratamento:'Maria',tipo_pessoa:'pf',relacao_com_contrato:'titular'},
 verified_at:verifiedAt,expires_at:expiry,verification_ref:reference,policies,
 installments:[],pending:[]
})
const car={ramo:'Automóvel',product_code:'auto',seguradora:'Seguradora de teste',
 risk_summary:{vehicle:{marca:'Toyota',modelo:'Corolla',ano_modelo:2022}}}
test('Clara -> Murilo consented quote uses reference without asking document or vehicle again',async()=>{
 const calls=[]
 const messages=[
  inc('Oi'),out('Olá! Sou a Clara, concierge da Phoenix Insurance.'),
  inc('Quero uma cotação do mesmo carro em outra seguradora'),
  out('Posso encaminhar sua conversa ao Murilo, nosso assistente comercial?'),
  inc('Sim')
 ]
 const res=await scenario(messages,{},async(_url,request)=>{
  const body=JSON.parse(request.body)
  calls.push(body.action)
  if(body.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(body.action==='identity_context'){
   assert.equal(body.verificationRef,reference)
   assert.equal(body.document,undefined)
   assert.equal(body.productCode,'auto')
   assert.equal(body.purpose,'quote')
   return json(payload([car]))
  }
  throw Error('Unexpected external request '+body.action)
 })
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'murilo')
 assert.match(res.body.reply,/Maria/)
 assert.match(res.body.reply,/Toyota Corolla 2022/)
 assert.doesNotMatch(JSON.stringify(res.body),/A{48}|[0-9]{11}/)
 assert.deepEqual(calls.sort(),['intro_status','identity_context'].sort())
})
test('verified Clara portfolio uses treatment name only after explicit valid scope',async()=>{
 const messages=[inc('Quero consultar meus seguros')]
 const res=await scenario(messages,{},async(_url,request)=>{
  const b=JSON.parse(request.body)
  if(b.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(b.action==='identity_context')return json(payload([car]))
  throw Error('Unexpected request '+b.action)
 })
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.match(res.body.reply,/Maria/)
 assert.match(res.body.reply,/Automóvel/)
 assert.doesNotMatch(res.body.reply,/A{48}/)
})
test('malformed reference is rejected without querying private data',async()=>{
 let calls=0
 const res=await scenario([inc('Consultar seguro')],{verification_ref:'short'},async()=>{
  calls++;throw Error('should not call bridge')
 })
 assert.equal(res.code,400)
 assert.equal(calls,0)
})
