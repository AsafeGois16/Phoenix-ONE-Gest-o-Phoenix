import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_bridge_token_test_only'
const conversationId='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const incident='Olá! Sofri uma colisão com meu carro e preciso acionar meu seguro Auto. Ninguém ficou ferido.'
const envKeys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_ONE_V4_VERIFIED_CONTEXT','PHOENIX_MEGABRAIN_SHADOW']
async function simulated(messages,options={}){
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]))
 const orig=globalThis.fetch
 const calls=[]
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake-openai-secret'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-bridge-secret'
 delete process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 globalThis.fetch=async(url,opts)=>{
  if(!url.includes('/phoenix-one-bridge'))throw Error('Não deve chamar OpenAI nem ferramenta de sinistro durante este caminho determinístico')
  const body=JSON.parse(opts.body)
  calls.push(body.action)
  if(body.action==='intro_status')return {ok:true,status:200,async json(){return {clara_apresentada:false,murilo_apresentado:false,blocked:false}}}
  if(body.action==='identity_context'){
   assert.equal(body.conversationId,conversationId)
   assert.equal(body.documentType,'cpf')
   assert.equal(body.document,'11144477735')
   assert.equal(body.proof,undefined)
   return {ok:true,status:200,async json(){return {status:options.identityStatus||'verified',
    policies:options.policies||[
     {ramo:'Auto',seguradora:'Bradesco',numero:'FAKE-123',franquia:4500,coberturas:[{nome:'Colisão',capital_segurado:100000}]},
     {ramo:'Vida',seguradora:'Outra',numero:'LIFE-1',premio_total:9000}
    ],installments:[],pending:[]}}}
  }
  throw Error('Bridge action não esperada: '+body.action)
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
   conversation_id:conversationId,protocolo:'20261106-9876',mode:'sugestao',agent_hint:'clara',
   contact:{kind:'cliente',phone_e164:'+5511999990000',display_name:'Contato fictício'},messages
  }}
  const res={code:200,setHeader(){},status(v){this.code=v;return this},json(body){this.body=body;return this}}
  await handler(req,res)
  return {res,calls}
 }finally{
  globalThis.fetch=orig
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
}
test('Teste 6 real: primeiro responde segurança, sem CPF, RAG ou consulta',async()=>{
 const {res,calls}=await simulated([inc(incident)])
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/local seguro/i)
 assert.match(res.body.reply,/ninguém ficou ferido/i)
 assert.doesNotMatch(res.body.reply,/CPF|CNPJ|seguradora|franquia|coberturas|R\$|100\.000/i)
 assert.deepEqual(calls,['intro_status'])
})
test('segurança confirmada: solicita identidade',async()=>{
 const first=(await simulated([inc(incident)])).res.body.reply
 const {res,calls}=await simulated([inc(incident),out(first),inc('Sim, estamos em local seguro')])
 assert.equal(res.code,200)
 assert.match(res.body.reply,/facilitar o atendimento/i)
 assert.doesNotMatch(res.body.reply,/CPF|CNPJ|cobertura garantida|guincho solicitado/i)
 assert.deepEqual(calls,['intro_status'])
})
test('após guincho dispensado, identifica titular, sem afirmar que abriu sinistro',async()=>{
 const history=[inc(incident),out('Você e o veículo estão em local seguro?'),inc('Sim, estamos seguros'),
  out('Você precisa de guincho ou assistência para o veículo agora?'),inc('Não preciso de guincho')]
 const {res,calls}=await simulated(history)
 assert.equal(res.code,200)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/i)
 assert.equal(res.body.humanHandoff,false)
 assert.deepEqual(calls,['intro_status'])
})
test('apólice consultada após identity VERIFIED: não despeja limites, franquia ou outros ramos',async()=>{
 const history=[inc(incident),out('Você e o veículo estão em local seguro?'),inc('Sim, estamos seguros'),
  out('Você precisa de guincho?'),inc('Não preciso'),
  out('Para localizar sua apólice, informe o CPF ou CNPJ do titular.'),inc('111.444.777-35')]
 const {res,calls}=await simulated(history)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/Bradesco/)
 assert.match(res.body.reply,/Auto\/RE/)
 assert.match(res.body.reply,/não confirma cobertura/i)
 assert.doesNotMatch(res.body.reply,/R\$|4500|100000|franquia|apólice FAKE|Vida|Outra/i)
 assert.doesNotMatch(res.body.reply,/11144477735|111.444.777-35/i)
 assert.deepEqual(calls,['intro_status','identity_context'])
})
test('consentimento de Sinistros Auto gera proposta para patrimonio, sem inventar acionamento',async()=>{
 const m=[inc(incident),out('Identidade confirmada. Encontrei uma apólice Auto. Posso encaminhar você ao Auto/RE para atendimento de Sinistros Auto?'),inc('Sim')]
 const {res,calls}=await simulated(m)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'patrimonio')
 assert.match(res.body.handoff.summary,/colisão\/acidente/i)
 assert.doesNotMatch(res.body.reply,/sinistro aberto|guincho acionado|cobertura confirmada/i)
 assert.deepEqual(calls,['intro_status'])
})
test('sinistro com feridos não aguarda CPF para orientar socorro',async()=>{
 const {res,calls}=await simulated([inc('Sofri um acidente de carro e há uma pessoa ferida.')])
 assert.equal(res.code,200)
 assert.match(res.body.reply,/192|193|socorro/i)
 assert.doesNotMatch(res.body.reply,/CPF|CNPJ/i)
 assert.deepEqual(calls,['intro_status'])
})
test('pedido direto de humano no sinistro: solicita fila Auto/RE imediatamente',async()=>{
 const {res,calls}=await simulated([inc('Sofri uma colisão com meu carro. Quero falar com um atendente de Sinistros Auto agora.')])
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'patrimonio')
 assert.match(res.body.reply,/local seguro|socorro|segurança/i)
 assert.deepEqual(calls,['intro_status'])
})
