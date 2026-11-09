import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_unit_bridge_token'
const uuid='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const validCnpj='11.222.333/0001-81'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const messages=()=>[
 inc('Preciso acionar meu seguro Fiança locatícia.'),
 out('Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance.'),
 out('Para encaminhar o acionamento do Seguro Fiança, pode informar o CPF ou CNPJ do titular?'),
 inc(validCnpj)
]
const keys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_MEGABRAIN_SHADOW']
async function call(history,opts={}){
 const values=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 const previous=globalThis.fetch
 const calls=[]
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake_openai_key'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake_bridge_key'
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 globalThis.fetch=async(url,options)=>{
  if(!url.includes('phoenix-one-bridge'))throw Error('Não deve chamar modelo nem API sem autorização')
  const body=JSON.parse(options.body)
  calls.push(body.action)
  if(body.action==='intro_status')return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:false,blocked:false}}}
  if(body.action==='identity_context'){
   assert.equal(body.conversationId,uuid)
   assert.equal(body.documentType,'cnpj')
   assert.equal(body.document,'11222333000181')
   if(opts.expectProof)assert.deepEqual(body.proof,{cep:'01234567'})
   else assert.equal(body.proof,undefined)
   return {ok:true,status:200,async json(){return opts.response??{
    status:'verification_required',verification:{method:'cep',attempts_left:2}
   }}}
  }
  throw Error('Unexpected Junior bridge action: '+body.action)
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},
   body:{conversation_id:uuid,protocolo:'20261109-9990',mode:'sugestao',agent_hint:'clara',
    contact:{kind:'cliente',phone_e164:'+5511999990000',display_name:'Cliente de teste'},messages:history}}
  const res={code:200,setHeader(){},status(n){this.code=n;return this},json(j){this.body=j;return this}}
  await handler(req,res)
  return {res,calls}
 }finally{
  globalThis.fetch=previous
  for(const [k,v] of Object.entries(values))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
}
test('acionamento Fiança + CNPJ válido aciona a verificação no Junior e pede CEP, não CNPJ',async()=>{
 const {res,calls}=await call(messages())
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/CEP cadastrado/i)
 assert.doesNotMatch(res.body.reply,/CPF ou CNPJ|informe (?:seu|o) CNPJ|CNPJ do titular/i)
 assert.doesNotMatch(JSON.stringify(res.body),/11222333000181|11\.222\.333\/0001-81/)
 assert.deepEqual(calls,['intro_status','identity_context'])
})
test('fluxo repetido do print: mesmo CNPJ reenviado depois de cobrança indevida consulta Junior',async()=>{
 const h=[...messages(),out('Recebi seu documento, mas preciso que informe o CPF ou CNPJ do titular do contrato.'),
  inc('11222333000181')]
 const {res,calls}=await call(h)
 assert.equal(res.code,200)
 assert.match(res.body.reply,/CEP cadastrado/i)
 assert.doesNotMatch(res.body.reply,/informe (?:novamente|o número do) (?:CPF|CNPJ)/i)
 assert.deepEqual(calls,['intro_status','identity_context'])
})
test('CNPJ e CEP cadastrado: identidade validada oferece Fiança a Auto/RE sem inventar cobertura',async()=>{
 const h=[...messages(),out('Para verificar sua representação da empresa, pode informar o CEP cadastrado (8 números)?'),inc('01234-567')]
 const {res,calls}=await call(h,{expectProof:true,response:{
  status:'verified',policies:[{ramo:'Fiança Locatícia',seguradora:'Seguradora Simulada',numero:'FIANCA-999',capital_segurado:20000}],installments:[]
 }})
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/identidade foi confirmada/i)
 assert.match(res.body.reply,/Auto\/RE/i)
 assert.match(res.body.reply,/não confirma cobertura/i)
 assert.doesNotMatch(res.body.reply,/CNPJ do titular|CPF ou CNPJ|11222333000181|11\.222|01234567|20000|FIANCA-999/i)
 assert.deepEqual(calls,['intro_status','identity_context'])
})
test('Junior não localizou contrato: solicitação Fiança segue à equipe Auto/RE, sem pedir CNPJ de novo',async()=>{
 const {res,calls}=await call(messages(),{response:{status:'not_found'}})
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/Posso encaminhar/i)
 assert.match(res.body.reply,/Auto e Patrimonial/i)
 assert.doesNotMatch(res.body.reply,/CPF|CNPJ|informe o número|CNPJ do titular/i)
 assert.deepEqual(calls,['intro_status','identity_context'])
})
test('após proposta Auto/RE e aceite, o Junior recebe handoff patrimônio sem novo pedido documental',async()=>{
 const h=[...messages(),
  out('A identidade foi confirmada no sistema. Encontrei um contrato de Seguro Fiança. Posso encaminhar seu atendimento à equipe Auto/RE para conferir o acionamento?'),
  inc('Sim')]
 const {res,calls}=await call(h)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'patrimonio')
 assert.doesNotMatch(JSON.stringify(res.body),/11222333000181|11\.222/)
 assert.deepEqual(calls,['intro_status'])
})
test('Documento inválido após pedido: devolver erro específico, não consultar Junior ou repetir genericamente',async()=>{
 const h=[...messages().slice(0,-1),inc('11.222.333/0001-82')]
 const {res,calls}=await call(h)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/validação de formato|não passou/i)
 assert.deepEqual(calls,['intro_status'])
})
