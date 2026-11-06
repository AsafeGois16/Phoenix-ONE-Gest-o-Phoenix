import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_bridge_token_unit_only'
const envKeys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_MEGABRAIN_SHADOW']
const inbound=text=>({direction:'inbound',author:'contact',type:'text',text})
const outbound=text=>({direction:'outbound',author:'agent',type:'text',text})
const messages=[
 inbound('Preciso excluir minha esposa do plano de Saúde empresarial'),
 outbound('Olá! Sou a Clara, assistente virtual da Phoenix Insurance.'),
 outbound('Concluí a etapa de verificação, mas não localizei um plano para seleção. Posso encaminhar você ao Backoffice?'),
 inbound('Sim'),
 outbound('Perfeito, obrigado pela confirmação. Vou solicitar seu encaminhamento à equipe responsável.'),
 {direction:'outbound',author:'staff',type:'text',text:'Esta é uma simulação: recebemos seu pedido no Backoffice. Nenhuma exclusão foi realizada.'},
 inbound('O Backoffice já recebeu minha solicitação. Agora tenho outra dúvida.')
]
test('regressão Teste 3: retorno da Clara encerra triagem antiga sem reconsultar identidade',async()=>{
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]))
 const prevFetch=globalThis.fetch
 const actions=[]
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake-model-key'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-bridge-secret'
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 globalThis.fetch=async (url,opts)=>{
  assert.match(url,/phoenix-one-bridge/)
  const body=JSON.parse(opts.body)
  actions.push(body.action)
  assert.equal(body.action,'intro_status','não deve consultar identidade, RAG ou OpenAI ao abrir outra dúvida')
  return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:false,blocked:false}}}
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
   conversation_id:'8a34238c-fa0e-4420-bb7c-dbb2856d6c1b',
   protocolo:'20261106-9999',mode:'sugestao',agent_hint:'clara',
   contact:{kind:'cliente',phone_e164:'+5511999990000',display_name:'Contato teste'},
   messages
  }}
  const res={code:200,setHeader(){},status(n){this.code=n;return this},json(obj){this.body=obj;return this}}
  await handler(req,res)
  assert.equal(res.code,200)
  assert.equal(res.body.agent,'clara')
  assert.equal(res.body.humanHandoff,false)
  assert.equal(res.body.handoff,null)
  assert.match(res.body.reply,/como posso ajudar com a sua nova solicita[cç][aã]o/i)
  assert.doesNotMatch(res.body.reply,/conclu[ií] a etapa|n[aã]o consegui identificar|encaminhar voc[eê] [aà] equipe de backoffice/i)
  assert.doesNotMatch(res.body.reply,/sou a clara/i)
  assert.deepEqual(actions,['intro_status'])
 }finally{
  globalThis.fetch=prevFetch
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
})
