import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'

const token='fake_bridge_token_unit_only'
const inbound=text=>({direction:'inbound',author:'contact',type:'text',text})
const outbound=text=>({direction:'outbound',author:'agent',type:'text',text})
const env=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
test('resposta "Uso pessoal" com Murilo no histórico nunca devolve agent Clara',async()=>{
 const previous=Object.fromEntries(env.map(k=>[k,process.env[k]]))
 const priorFetch=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='fake-model-key'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-bridge-key'
 const calls=[]
 globalThis.fetch=async(url,opts)=>{
  if(url.includes('phoenix-one-bridge')){
   const body=JSON.parse(opts.body)
   calls.push(body.action)
   if(body.action==='intro_status')return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:false,blocked:false}}}
   if(body.action==='context'){
    assert.equal(body.suggestedAgent,'murilo')
    return {ok:true,status:200,async json(){return {agent:'murilo',prompt:'Você é Murilo, agente comercial.',sources:[]}}}
   }
   throw Error('Ação não permitida no teste: '+body.action)
  }
  if(url.includes('api.openai.com'))return {ok:true,status:200,async json(){return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
   reply:'Entendi, o uso é pessoal. O seguro será novo ou uma renovação?',
   humanHandoff:false,handoff:null
  })}]}]}}}
  throw Error('Rede externa inesperada')
 }
 try{
  const req={
   method:'POST',
   headers:{authorization:'Bearer '+token},
   body:{
    conversation_id:'8a34238c-fa0e-4420-bb7c-dbb2856d6c1b',
    protocolo:'20261105-0123',mode:'sugestao',agent_hint:'murilo',
    contact:{kind:'lead',phone_e164:'+5511999990000',display_name:'Pessoa fictícia'},
    messages:[
     outbound('Prazer! Sou o Murilo, do time comercial da Phoenix Insurance. Para começar, utiliza o carro para uso pessoal ou trabalho?'),
     inbound('Uso pessoal')
    ]
   }
  }
  const res={code:200,setHeader(){},status(n){this.code=n;return this},json(o){this.body=o;return this}}
  await handler(req,res)
  assert.equal(res.code,200)
  assert.equal(res.body.agent,'murilo')
  assert.equal(res.body.humanHandoff,false)
  assert.equal(res.body.handoff,null)
  assert.match(res.body.reply,/uso pessoal|uso é pessoal/i)
  assert.doesNotMatch(res.body.reply,/sou a Clara|vou transferir para Clara/i)
  assert.deepEqual(calls.sort(),['context','intro_status'].sort())
 }finally{
  globalThis.fetch=priorFetch
  for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
})
