import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_bridge_token_unit_only'
const uuid='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const beginning=[
 inc('Preciso excluir um dependente do plano de saúde'),
 out('Olá! Sou a Clara, assistente virtual da Phoenix.'),
 inc('111.444.777-35'),
 out('Concluí a etapa de verificação. Posso encaminhar para o Backoffice?'),
 inc('Sim'),
 out('Vou solicitar o encaminhamento ao Backoffice.'),
 {direction:'outbound',author:'staff',type:'text',text:'Atendimento humano de teste; nenhuma exclusão executada.'},
 inc('O Backoffice já recebeu minha solicitação. Agora tenho outra dúvida.'),
 out('Claro! Como posso ajudar com sua nova solicitação?')
]
const request=messages=>({
 method:'POST',headers:{authorization:'Bearer '+token},
 body:{conversation_id:uuid,protocolo:'20261106-9999',mode:'sugestao',agent_hint:'clara',
 contact:{kind:'cliente',phone_e164:'+5511999990000',display_name:'Contato fictício'},messages}
})
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(payload){this.body=payload;return this}})
const env=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_ONE_JUNIOR_FINANCEIRO_ENABLED']
async function withMock(options,fn){
 const old=Object.fromEntries(env.map(k=>[k,process.env[k]]))
 const previous=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake-model-key'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-bridge'
 if(options.financeEnabled)process.env.PHOENIX_ONE_JUNIOR_FINANCEIRO_ENABLED='true'
 else delete process.env.PHOENIX_ONE_JUNIOR_FINANCEIRO_ENABLED
 const calls=[]
 globalThis.fetch=async(url,opts)=>{
  if(!url.includes('phoenix-one-bridge'))throw Error('A consulta de segunda via não deve chamar OpenAI ou endpoints de envio')
  const data=JSON.parse(opts.body)
  calls.push(data.action)
  if(data.action==='intro_status')return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:false,blocked:false}}}
  if(data.action==='identity_context'&&options.identityContext){
   assert.equal(data.documentType,'cpf')
   assert.equal(data.document,'11144477735')
   assert.equal(data.proof,undefined)
   return {ok:true,status:200,async json(){return {status:'verified',policies:[{numero:'SAU-TEST',ramo:'Saúde',seguradora:'Operadora Simulada'}],installments:[{apolice:'SAU-TEST',ramo:'Saúde',vencimento:'2026-11-21',valor:215,vencida:false}]}}}
  }
  throw Error('Unexpected bridge action: '+data.action)
 }
 try{return await fn(calls)}
 finally{
  globalThis.fetch=previous
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
}
test('nova dúvida sobre segunda via: não repete documento nem promete envio',()=>withMock({financeEnabled:false},async calls=>{
 const messages=[...beginning,inc('Gostaria de saber como funciona a segunda via de boletos do plano de saúde.')]
 const res=response();await handler(request(messages),res)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/Financeiro/)
 assert.doesNotMatch(res.body.reply,/poderia me informar.*CPF|vou enviar|conseguir enviar|já emiti/i)
 assert.deepEqual(calls,['intro_status'])
}))
test('sim após promessa antiga de verificar envio não volta a pedir CPF',()=>withMock({financeEnabled:false},async calls=>{
 const messages=[...beginning,inc('Gostaria de saber como funciona a segunda via de boletos do plano de saúde.'),
  out('A segunda via é emitida pela seguradora. Posso verificar se consigo enviar o boleto para você?'),inc('Sim')]
 const res=response();await handler(request(messages),res)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.doesNotMatch(res.body.reply,/CPF|emiti|enviei|enviarei|vou verificar se consigo enviar/i)
 assert.deepEqual(calls,['intro_status'])
}))
test('fluxo com confirmação explícita e fila habilitada propõe FINANCEIRO ao Junior',()=>withMock({financeEnabled:true},async calls=>{
 const initial=[...beginning,inc('Gostaria de solicitar segunda via do boleto de saúde.')]
 const first=response();await handler(request(initial),first)
 assert.equal(first.body.humanHandoff,false)
 assert.match(first.body.reply,/Posso encaminhar.*Financeiro/i)
 const second=response();await handler(request([...initial,out(first.body.reply),inc('Sim')]),second)
 assert.equal(second.body.humanHandoff,true)
 assert.equal(second.body.handoff.department,'financeiro')
 assert.doesNotMatch(JSON.stringify(second.body),/11144477735|111.444.777-35/)
 assert.deepEqual(calls,['intro_status','intro_status'])
}))
test('nova consulta de valor pode reutilizar CPF informado antes da mudança de assunto, mas exige API verified',()=>withMock({financeEnabled:false,identityContext:true},async calls=>{
 const messages=[...beginning,inc('Qual é o valor da parcela do plano de saúde?')]
 const res=response();await handler(request(messages),res)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.doesNotMatch(res.body.reply,/informe.*CPF/i)
 assert.ok(calls.includes('identity_context'))
 assert.doesNotMatch(JSON.stringify(res.body),/11144477735|111.444.777-35/)
}))
