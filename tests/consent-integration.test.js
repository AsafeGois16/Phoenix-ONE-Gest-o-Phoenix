import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const original=globalThis.fetch
const TOKEN='fake_bridge_token_unit_only'
const UUID='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const msg=(direction,author,text)=>({direction,author,type:'text',text})
const out=text=>msg('outbound','agent',text)
const inc=text=>msg('inbound','contact',text)
const res=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}})
const envKeys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_MEGABRAIN_SHADOW','PHOENIX_MEGABRAIN_V3_READ']
function makeReq(messages){return {method:'POST',headers:{authorization:'Bearer '+TOKEN},body:{
 conversation_id:UUID,protocolo:'20261030-0005',mode:'automatico',agent_hint:'clara',
 contact:{kind:'cliente',phone_e164:'+5511999999999',display_name:'Cliente de Teste'},messages
}}}
async function run(messages,fetchMock){
 const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]))
 process.env.PHOENIX_ONE_TOKEN=TOKEN
 process.env.OPENAI_API_KEY='fake-model-key'
 process.env.VITE_SUPABASE_URL='https://fake-example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-bridge'
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 delete process.env.PHOENIX_MEGABRAIN_V3_READ
 globalThis.fetch=fetchMock
 try{const response=res();await handler(makeReq(messages),response);return response}
 finally{globalThis.fetch=original;for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
}
const intro=out('Olá! Sou a Clara, assistente virtual da Phoenix Insurance.')
const quote=inc('Eu posso fazer cotação do mesmo carro porém em outra seguradora?')
const offer=out('Claro! Posso encaminhar sua conversa ao Murilo, nosso assistente comercial, para continuar a cotação?')
const idMock=(body)=>({ok:true,status:200,async json(){return body}})
test('Clara nunca muda para Murilo no primeiro pedido de cotação sem aceitar a troca',async()=>{
 const requests=[]
 const r=await run([inc('Oi'),intro,quote],async(url,opts)=>{
  const body=JSON.parse(opts.body);requests.push(body.action);assert.equal(body.action,'intro_status');return idMock({clara_apresentada:true,murilo_apresentado:false})
 })
 assert.equal(r.code,200)
 assert.equal(r.body.agent,'clara')
 assert.equal(r.body.humanHandoff,false)
 assert.match(r.body.reply,/Posso encaminhar.*Murilo/)
 assert.deepEqual(requests,['intro_status'])
})
test('com aceite da troca e verificação atual, Murilo reaproveita marca, modelo e ano sem outra pergunta de cadastro',async()=>{
 const steps=[]
 const r=await run([inc('Oi'),intro,inc('Quero consultar meus seguros'),inc('111.444.777-35'),out('Conferi as informações autorizadas dos seus seguros.'),quote,offer,inc('Sim')],async(url,opts)=>{
  const body=JSON.parse(opts.body);steps.push(body.action)
  if(body.action==='intro_status')return idMock({clara_apresentada:true,murilo_apresentado:false})
  if(body.action==='identity_context'){
   assert.equal(body.conversationId,UUID)
   assert.equal(body.document,'11144477735')
   return idMock({status:'verified',policies:[{ramo:'Automóvel',seguradora:'Bradesco',veiculo:{marca:'Toyota',modelo:'Corolla',ano_modelo:2022}}],installments:[]})
  }
  throw Error('Não deveria chamar modelo externo ou endpoint de outra conversa')
 })
 assert.equal(r.code,200)
 assert.equal(r.body.agent,'murilo')
 assert.equal(r.body.humanHandoff,false)
 assert.match(r.body.reply,/Toyota Corolla 2022/)
 assert.doesNotMatch(r.body.reply,/qual o modelo|qual o ano/i)
 assert.deepEqual(steps.sort(),['identity_context','intro_status'].sort())
})
test('com aceite mas consulta não verificada, Murilo não pode alegar veículo confirmado',async()=>{
 const r=await run([inc('Oi'),intro,inc('111.444.777-35'),quote,offer,inc('Sim')],async(url,opts)=>{
  const body=JSON.parse(opts.body)
  if(body.action==='intro_status')return idMock({clara_apresentada:true,murilo_apresentado:false})
  if(body.action==='identity_context')return idMock({status:'verification_required',verification:{method:'human',attempts_left:2}})
  if(body.action==='context')return idMock({agent:'murilo',prompt:'Você é Murilo SDR. Seja claro.',sources:[]})
  if(url.includes('api.openai.com'))return idMock({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Qual é o ano e o modelo do seu carro?',humanHandoff:false,handoff:null})}]}]})
  throw Error('Unexpected '+(body.action||url))
 })
 assert.equal(r.code,200)
 assert.equal(r.body.agent,'murilo')
 assert.doesNotMatch(r.body.reply,/identidade confirmada|modelo verificado/i)
})
