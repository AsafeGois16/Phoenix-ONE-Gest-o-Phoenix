import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_bridge_token_only'
const conversationId='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const base=[
 inc('Quero cotar seguro Frota para minha empresa.'),
 out('Olá! Sou a Clara, assistente virtual da Phoenix Insurance. Posso te ajudar?'),
 out('Posso encaminhar sua cotação ao Murilo?'),
 inc('Sim'),
 out('Sou o Murilo, do time comercial da Phoenix Insurance.'),
 inc('São três veículos utilitários, mas ainda não tenho os modelos.'),
 out('Ótimo, a frota tem seguro atual ou será primeira contratação?'),
 inc('Antes de continuar a cotação, preciso excluir um dependente do plano odontológico da empresa.')
]
function response(){return {code:200,setHeader(){},status(n){this.code=n;return this},json(o){this.body=o;return this}}}
const keys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_ONE_V4_VERIFIED_CONTEXT','PHOENIX_MEGABRAIN_SHADOW','PHOENIX_MEGABRAIN_V3_READ']
async function simulate(messages,{policies=[{numero:'ODO-TEST-1234',ramo:'Odontológico',linha:'Odonto',seguradora:'Porto'}],identityStatus='verified'}={}){
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 const prevFetch=globalThis.fetch
 const actions=[]
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake-key'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-secret'
 delete process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 delete process.env.PHOENIX_MEGABRAIN_V3_READ
 globalThis.fetch=async (url,opts)=>{
  if(!url.includes('phoenix-one-bridge'))throw Error('Não deve chamar modelo nem Junior para ação diferente')
  const data=JSON.parse(opts.body)
  actions.push(data.action)
  if(data.action==='intro_status'){
   return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:true,blocked:false}}}
  }
  if(data.action==='identity_context'){
   assert.equal(data.conversationId,conversationId)
   assert.equal(data.documentType,'cpf')
   assert.equal(data.document,'11144477735')
   return {ok:true,status:200,async json(){return {status:identityStatus,policies,installments:[]}}}
  }
  throw Error('Ação inesperada: '+data.action)
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
   conversation_id:conversationId,protocolo:'20261106-9990',mode:'sugestao',agent_hint:'murilo',
   contact:{kind:'lead',phone_e164:'+5511999990000',display_name:'Contato fictício'},messages
  }}
  const res=response();await handler(req,res)
  return {res,actions}
 }finally{
  globalThis.fetch=prevFetch
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
}
test('regressão real: exclusão Odonto durante Frota muda diretamente para Clara, não para fila Backoffice',async()=>{
 const {res,actions}=await simulate(base)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/i)
 assert.doesNotMatch(res.body.reply,/sou a Clara|já foi transferido|frota.*cancelada/i)
 assert.deepEqual(actions,['intro_status'])
})
test('consentimento antigo ao Murilo para ir direto ao Backoffice NÃO dispensa CPF',async()=>{
 const b=[...base,
  out('Posso encaminhar sua solicitação ao Backoffice?'),
  inc('Sim')
 ]
 const {res,actions}=await simulate(b)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/i)
 assert.deepEqual(actions,['intro_status'])
})
test('pedido explícito de Clara e Backoffice não transfere antes da validação',async()=>{
 const b=[...base,
  out('O Backoffice poderá orientar o procedimento.'),
  inc('Sim, quero resolver a exclusão odontológica agora. Por favor, me encaminhe para a Clara dar continuidade com o Backoffice. Depois retomamos a cotação da frota.')
 ]
 const {res}=await simulate(b)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/i)
})
test('documento em atendimento da Clara exige validação Junior e seleção de plano Odonto',async()=>{
 const messages=[...base,out('Para localizar o plano, pode informar CPF ou CNPJ do titular?'),inc('111.444.777-35')]
 const {res,actions}=await simulate(messages)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/Confirma que este é o plano de Odonto/i)
 assert.match(res.body.reply,/Porto/)
 assert.doesNotMatch(res.body.reply,/11144477735|111.444.777-35/)
 assert.deepEqual(actions,['intro_status','identity_context'])
})
test('identidade não validada não permite listar apólices nem realizar transferência pronta',async()=>{
 const messages=[...base,out('Pode informar CPF do titular?'),inc('111.444.777-35')]
 const {res}=await simulate(messages,{identityStatus:'verification_required'})
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.doesNotMatch(res.body.reply,/Porto|ODO-TEST-1234/)
})
test('uma apólice selecionada e autorização posterior dão handoff Backoffice sem movimentação',async()=>{
 const withDoc=[...base,out('Pode informar CPF do titular?'),inc('111.444.777-35')]
 const first=(await simulate(withDoc)).res
 assert.match(first.body.reply,/Confirma que este é o plano de Odonto/i)
 const approved=[...withDoc,out(first.body.reply),inc('Sim')]
 const second=(await simulate(approved)).res
 assert.equal(second.body.agent,'clara')
 assert.equal(second.body.humanHandoff,false)
 assert.match(second.body.reply,/Posso encaminhar.*Backoffice/i)
 const confirmed=[...approved,out(second.body.reply),inc('Sim')]
 const final=(await simulate(confirmed)).res
 assert.equal(final.code,200)
 assert.equal(final.body.agent,'clara')
 assert.equal(final.body.humanHandoff,true)
 assert.equal(final.body.handoff.department,'backoffice')
 assert.match(final.body.handoff.summary,/Odonto/)
 assert.match(final.body.handoff.summary,/Porto/)
 assert.doesNotMatch(JSON.stringify(final.body),/11144477735|111.444.777-35/)
 assert.match(final.body.reply,/Nenhuma movimentação foi realizada/i)
})
test('múltiplas apólices não permitem transferência sem o cliente escolher o plano',async()=>{
 const messages=[...base,out('Pode informar CPF ou CNPJ do titular?'),inc('111.444.777-35')]
 const policies=[
  {numero:'ODO-TEST-1234',ramo:'Odontológico',linha:'Odonto',seguradora:'Porto'},
  {numero:'ODO-TEST-5678',ramo:'Odontológico',linha:'Odonto',seguradora:'Bradesco'}
 ]
 const {res}=await simulate(messages,{policies})
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/Qual destes planos de Odonto/i)
 assert.match(res.body.reply,/Porto/)
 assert.match(res.body.reply,/Bradesco/)
})
