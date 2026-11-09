import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'
const token='fake-junior-token-for-test'
const conversationId='00000000-0000-4000-8000-000000000027'
const cnpj='11.222.333/0001-81'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const base=[
 inc('Olá! Quero acionar o Seguro Fiança do imóvel pela empresa.'),
 out('Olá! Sou a Clara, concierge da Phoenix Insurance. Para localizar o seguro, poderia informar seu CPF ou CNPJ do titular?')
]
const env=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_ONE_V4_VERIFIED_CONTEXT','PHOENIX_MEGABRAIN_SHADOW']
const mockResponse=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(payload){this.body=payload;return this}})
async function simulate(messages,{status='verification_required',proofRequest=false,modelReply='Por favor, informe novamente o CPF ou CNPJ do titular do contrato.'}={}){
 const old=Object.fromEntries(env.map(k=>[k,process.env[k]]))
 const previousFetch=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='model-key-fake'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='bridge-key-fake'
 delete process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 const actions=[],seen=[]
 globalThis.fetch=async (url,options)=>{
  const d=JSON.parse(options.body)
  if(url.includes('phoenix-one-bridge')){
   actions.push(d.action)
   if(d.action==='intro_status')return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:false,blocked:false}}}
   if(d.action==='identity_context'){
    assert.equal(d.protocolo,'20261109-0022')
    assert.equal(d.conversationId,conversationId)
    assert.equal(d.documentType,'cnpj')
    assert.equal(d.document,'11222333000181')
    assert.equal(d.proofRequest,undefined)
    if(proofRequest)assert.deepEqual(d.proof,{cep:'01234567'})
    else assert.equal(d.proof,undefined)
    return {ok:true,status:200,async json(){
     if(status==='verification_required')return {status,verification:{method:'cep',attempts_left:2}}
     if(status==='verified')return {status,policies:[{numero:'FICTICIO-01',ramo:'Fiança Locatícia',seguradora:'Seguradora Exemplo'}],installments:[],pending:[]}
     return {status}
    }}
   }
   if(d.action==='context'){assert.doesNotMatch(JSON.stringify(d),/11222333000181|11\.222\.333\/0001-81|01234567/);return {ok:true,status:200,async json(){return {prompt:'Você é Clara, concierge da Phoenix.',sources:[]}}}}
   if(d.action==='prompt_only')return {ok:true,status:200,async json(){return {prompt:'Você é Clara.',sources:[]}}}
   throw Error('Unexpected bridge action: '+d.action)
  }
  if(url.includes('api.openai.com')){
   const raw=JSON.stringify(d)
   assert.doesNotMatch(raw,/11222333000181|11\.222\.333\/0001-81|01234567/)
   seen.push('model')
   return {ok:true,status:200,async json(){return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:modelReply,humanHandoff:false,handoff:null})}]}]}}}
  }
  throw Error('Unexpected outgoing HTTP call')
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
   conversation_id:conversationId,protocolo:'20261109-0022',mode:'sugestao',agent_hint:'clara',
   contact:{kind:'cliente',phone_e164:'+5511999990000',display_name:'Cliente fictício'},messages
  }}
  const res=mockResponse();await handler(req,res)
  return {res,actions,seen}
 }finally{
  globalThis.fetch=previousFetch
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
}
test('Fiança: primeiro CNPJ informado chega à gestão Junior, sem repetição e sem OpenAI',async()=>{
 const {res,actions,seen}=await simulate([...base,inc(cnpj)])
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/CEP cadastrado/i)
 assert.doesNotMatch(res.body.reply,/informe.*CNPJ|informe.*CPF|reenvie.*CNPJ/i)
 assert.deepEqual(actions,['intro_status','identity_context'])
 assert.deepEqual(seen,[])
 assert.doesNotMatch(JSON.stringify(res.body),/11222333000181|11\.222\.333\/0001-81/)
})
test('Fiança: CNPJ repetido continua tentando consulta, não entra em loop de texto',async()=>{
 const msgs=[...base,inc(cnpj),out('Para sua segurança, poderia informar novamente o CNPJ?'),inc('11222333000181')]
 const {res,actions}=await simulate(msgs)
 assert.equal(res.code,200)
 assert.match(res.body.reply,/CEP cadastrado/i)
 assert.deepEqual(actions,['intro_status','identity_context'])
})
test('Fiança: CEP é enviado somente à gestão, e nunca à IA',async()=>{
 const msgs=[...base,inc(cnpj),out('Para confirmar a representação da empresa, pode informar o CEP cadastrado (8 números)?'),inc('01234-567')]
 const {res,actions,seen}=await simulate(msgs,{status:'verified',proofRequest:true})
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.doesNotMatch(res.body.reply,/informe novamente.*CPF|informe novamente.*CNPJ|por favor.*informe.*CPF/i)
 assert.doesNotMatch(JSON.stringify(res.body),/11222333000181|11\.222\.333\/0001-81|01234567/)
 assert.ok(actions.includes('identity_context'))
 assert.ok(seen.length<=1)
})
test('Fiança: modelo insiste no CPF depois de verified, backend substitui por orientação segura',async()=>{
 const msgs=[...base,inc(cnpj),out('Por favor, informe o CEP cadastrado (8 números)?'),inc('01234-567')]
 const {res,seen}=await simulate(msgs,{status:'verified',proofRequest:true,
  modelReply:'Para confirmar seu acionamento, poderia informar novamente o CPF ou CNPJ do titular?'})
 assert.equal(res.code,200)
 assert.doesNotMatch(res.body.reply,/poderia informar novamente|informe novamente o cpf/i)
 if(seen.length){
  assert.match(res.body.reply,/identidade foi confirmada/i)
  assert.match(res.body.reply,/Auto\/RE/i)
 }
})
test('Fiança: gestão indisponível solicita conferência humana, sem repetir documento',async()=>{
 const {res,actions}=await simulate([...base,inc(cnpj)],{status:'unavailable'})
 assert.equal(res.code,200)
 assert.match(res.body.reply,/Não foi possível|não foi possível|não consegui|Recebi/i)
 assert.doesNotMatch(res.body.reply,/informe novamente o CPF|informe novamente o CNPJ/i)
 assert.deepEqual(actions,['intro_status','identity_context'])
 assert.doesNotMatch(JSON.stringify(res.body),/11222333000181/)
})
