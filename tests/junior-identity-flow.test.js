import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'
const token='fake_bridge_token_unit_only'
const conversation_id='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const testCPF='111.444.777-35'
const msgs=(texts)=>texts.map(text=>({direction:'inbound',author:'contact',type:'text',text}))
function request(texts){return {method:'POST',headers:{authorization:'Bearer '+token},body:{
 conversation_id,protocolo:'20261028-0007',mode:'sugestao',agent_hint:'murilo',
 contact:{kind:'desconhecido',phone_e164:'+5511999990000',display_name:'Teste'},
 messages:msgs(texts)
}}}
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(b){this.body=b;return this}}}
function withMock(fn){
 const prevFetch=globalThis.fetch
 const prev={token:process.env.PHOENIX_ONE_TOKEN,key:process.env.OPENAI_API_KEY,url:process.env.VITE_SUPABASE_URL,internal:process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN}
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='not-real-for-unit-test'
 process.env.VITE_SUPABASE_URL='https://test-example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='not-real-for-unit-test'
 return fn().finally(()=>{
  globalThis.fetch=prevFetch
  for(const [k,v] of Object.entries({PHOENIX_ONE_TOKEN:prev.token,OPENAI_API_KEY:prev.key,VITE_SUPABASE_URL:prev.url,PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN:prev.internal})){if(v===undefined)delete process.env[k];else process.env[k]=v}
 })
}
const json=data=>({ok:true,status:200,async json(){return data}})
test('solicitação de apólices não usa telefone e pede CPF/CNPJ',()=>withMock(async()=>{
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  assert.equal(d.action,'context')
  return json({prompt:'Prompt de teste',sources:[]})
 }
 const res=response();await handler(request(['Quais seguros eu tenho?']),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.match(res.body.reply,/CPF ou CNPJ/)
 assert.equal(res.body.humanHandoff,false)
}))
test('documento recebido gera revisão humana sem contrato v1.1',()=>withMock(async()=>{
 const calls=[]
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body);calls.push(d)
  if(d.action==='context'){assert.ok(!JSON.stringify(d).includes('11144477735'));return json({prompt:'Prompt de teste',sources:[]})}
  if(d.action==='identity_context'){
    assert.equal(d.document,'11144477735')
    assert.equal(d.documentType,'cpf')
    assert.equal(d.conversationId,conversation_id)
    assert.equal(d.protocolo,'20261028-0007')
    return json({status:'unavailable'})
  }
  throw Error('Unexpected fetch')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'comercial')
 assert.ok(!JSON.stringify(res.body).includes('11144477735'))
 assert.ok(!JSON.stringify(res.body).includes(testCPF))
 assert.equal(calls.length,2)
}))
test('documento inválido não consulta apólices nem envia dado ao modelo',()=>withMock(async()=>{
 let identityCalls=0
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body);if(d.action==='identity_context')identityCalls++
  return json({prompt:'Prompt de teste',sources:[]})
 }
 const res=response();await handler(request(['Quais seguros eu tenho?','111.444.777-36']),res)
 assert.equal(res.code,200);assert.match(res.body.reply,/conferir/i)
 assert.equal(identityCalls,0)
}))
test('somente após verificação confirmada o modelo recebe dados filtrados sem documento',()=>withMock(async()=>{
 let openAiPayload=null
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(url.includes('phoenix-one-bridge')&&d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(url.includes('phoenix-one-bridge')&&d.action==='identity_context')return json({status:'verified',policies:[{numero:'FICTICIO',ramo:'Automóvel'}],installments:[]})
  if(url.includes('api.openai.com')){
    openAiPayload=d;return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Há uma apólice de automóvel associada à titularidade verificada.',humanHandoff:false,handoff:null})}]}]})
  }
  throw Error('Unexpected fetch')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,false)
 assert.ok(openAiPayload)
 assert.match(openAiPayload.instructions,/FICTICIO/)
 assert.ok(!JSON.stringify(openAiPayload).includes('11144477735'))
 assert.ok(!JSON.stringify(openAiPayload).includes(testCPF))
}))
