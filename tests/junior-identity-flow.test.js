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


test('CPF: verification_required solicita nascimento, sem handoff imediato',()=>withMock(async()=>{
 let calls=0
 globalThis.fetch=async(url,options)=>{
  const data=JSON.parse(options.body)
  if(data.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(data.action==='identity_context'){
   calls++
   assert.equal(data.document,'11144477735')
   assert.equal(data.proof,undefined)
   return json({status:'verification_required',verification:{method:'birth_date',attempts_left:2}})
  }
  throw Error('Nao deveria chamar OpenAI enquanto pede prova')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara');assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/data de nascimento/i);assert.equal(calls,1)
}))
test('CPF: data de nascimento vai apenas ao Junior e é removida da OpenAI',()=>withMock(async()=>{
 let called=false,model=null
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(url.includes('phoenix-one-bridge')&&d.action==='context'){assert.ok(!JSON.stringify(d).includes('25/11/1990'));return json({prompt:'Prompt de teste',sources:[]})}
  if(url.includes('phoenix-one-bridge')&&d.action==='identity_context'){
   called=true;assert.deepEqual(d.proof,{birth_date:'1990-11-25'})
   return json({status:'verified',policies:[{numero:'APOLICE-FICTICIA',ramo:'Auto'}],installments:[]})
  }
  if(url.includes('api.openai.com')){
   model=d;return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Seu seguro foi localizado.',humanHandoff:false,handoff:null})}]}]})
  }
  throw Error('Fetch nao previsto')
 }
 const res=response(),input=request(['Quais seguros eu tenho?',testCPF])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:'Pode informar sua data de nascimento no formato DD/MM/AAAA?'},{direction:'inbound',author:'contact',type:'text',text:'25/11/1990'})
 await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,false);assert.ok(called&&model)
 assert.ok(!JSON.stringify(model).includes('25/11/1990'))
 assert.ok(!JSON.stringify(model).includes('1990-11-25'))
 assert.ok(!JSON.stringify(model).includes('11144477735'))
}))
test('CNPJ: CEP enviado apenas ao bridge e nova tentativa permitida',()=>withMock(async()=>{
 let called=false
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(d.action==='identity_context'){
   called=true;assert.equal(d.documentType,'cnpj');assert.equal(d.document,'11222333000181')
   assert.deepEqual(d.proof,{cep:'01234567'})
   return json({status:'verification_required',verification:{method:'cep',attempts_left:1}})
  }
  throw Error('OpenAI nao deveria ser chamada')
 }
 const res=response(),input=request(['Quais seguros eu tenho?','11.222.333/0001-81'])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:'Pode informar o CEP cadastrado (8 números)?'},{direction:'inbound',author:'contact',type:'text',text:'01234-567'})
 await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,false);assert.match(res.body.reply,/CEP/)
 assert.ok(called)
}))
test('Limite de tentativas gera encaminhamento humano sem dados privados',()=>withMock(async()=>{
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(d.action==='identity_context')return json({status:'too_many_attempts'})
  throw Error('Nao pode consultar OpenAI')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,true)
 assert.ok(!JSON.stringify(res.body).includes('11144477735'))
}))
test('Junior pede validação humana, não nascimento/CEP',()=>withMock(async()=>{
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(d.action==='identity_context')return json({status:'verification_required',verification:{method:'human',attempts_left:2}})
  throw Error('Nao pode consultar OpenAI')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,true)
}))
