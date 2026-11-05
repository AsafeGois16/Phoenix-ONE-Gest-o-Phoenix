import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_bridge_token_unit_only'
const conversation='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const messages=[
 inc('Quero uma cotação de seguro Auto para Onix 2023'),
 out('Olá! Sou a Clara, assistente virtual da Phoenix. Como posso te chamar?'),
 inc('Asafe Gois'),
 out('Posso passar seu atendimento ao Murilo para seguir com a cotação?'),
 inc('Sim'),
 out('Prazer, Asafe! Sou o Murilo, do time comercial da Phoenix Insurance.'),
 inc('É meu pessoal'),
 out('Você já possui seguro para esse veículo?'),
 inc('Uma proteção nova'),
 out('Qual o principal objetivo da proteção?'),
 inc('Quero uma proteção padrão')
]
const envKeys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
function withEnvironment(fn){
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]))
 const before=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake-key'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-secret'
 globalThis.fetch=async (url,opts)=>{
  if(!url.includes('phoenix-one-bridge'))throw Error('Não deve chamar modelo nem gestão em roteamento determinístico')
  const data=JSON.parse(opts.body)
  assert.equal(data.action,'intro_status')
  return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:true,blocked:false}}}
 }
 return fn().finally(()=>{
  globalThis.fetch=before
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 })
}
async function call(history){
 const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
  conversation_id:conversation,protocolo:'20261105-0003',mode:'automatico',agent_hint:'murilo',
  contact:{kind:'lead',phone_e164:'+5511999990000',display_name:'Contato fictício'},
  messages:history
 }}
 const res={code:200,setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this}}
 await handler(req,res)
 return res
}
test('solicitação explícita de humano em cotação Auto envia handoff efetivo da API sem IA',()=>withEnvironment(async()=>{
 const res=await call([...messages,out('Tem alguma dúvida?'),inc('Quero que me transfira para um humano')])
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'murilo')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'patrimonio')
 assert.match(res.body.handoff.summary,/Asafe Gois/)
 assert.match(res.body.handoff.summary,/Onix 2023/)
 assert.match(res.body.handoff.summary,/proteção padrão/)
 assert.doesNotMatch(res.body.reply,/já foi transferido/i)
}))
test('triagem suficiente não escolhe franquia nem diz que prepara cotação',()=>withEnvironment(async()=>{
 const res=await call(messages)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'murilo')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/Posso encaminhar.+Auto\/RE/i)
 assert.doesNotMatch(res.body.reply,/franquia mais comum|compartilho aqui|cotação estiver pronta/i)
}))
test('aceite do convite da própria IA em Auto/RE conclui o handoff',()=>withEnvironment(async()=>{
 const history=[...messages,out('Posso encaminhar as informações já fornecidas à equipe de Auto/RE para que um consultor continue o atendimento?'),inc('Sim')]
 const res=await call(history)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'murilo')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'patrimonio')
 assert.match(res.body.handoff.summary,/Asafe Gois/)
}))
