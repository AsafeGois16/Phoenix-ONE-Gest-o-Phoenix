import test from 'node:test'
import assert from 'node:assert/strict'
import {isAudioOnlyNotice,audioHandoffDecision} from '../server/audio-handoff.js'
import respond from '../api/v1/conversations/respond.js'
const uuid='00000000-0000-4000-8000-000000000001'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const audio='[cliente enviou um áudio]'
const fakeToken='fake-junior-token'
const base={conversation_id:uuid,protocolo:'20261109-0004-1',mode:'sugestao',agent_hint:'murilo',
 contact:{kind:'lead',phone_e164:'+5511999990000'},
 messages:[inc('Quero cotar seguro Auto'),out('Olá, sou o Murilo, do time comercial da Phoenix.'),inc(audio)]}
const response=()=>({code:200,setHeader(){},status(c){this.code=c;return this},json(j){this.body=j;return this}})
test('reconhecer SOMENTE aviso de áudio sem transcrição',()=>{
 assert.equal(isAudioOnlyNotice(inc(audio)),true)
 assert.equal(isAudioOnlyNotice(inc('[cliente enviou um audio]')),true)
 for(const m of ['Áudio do acidente, preciso de guincho','[cliente enviou um documento: audio.mp3]',
  '[cliente enviou um áudio] e quero cotar um seguro','[cliente enviou um áudio: o carro bateu]'])
  assert.equal(isAudioOnlyNotice(inc(m)),false,m)
})
test('áudio: setor informado pelo Junior ou fila geral, nunca comercial',()=>{
 for(const [dep,expected] of [['backoffice','backoffice'],['patrimonio','patrimonio'],
   ['financeiro','financeiro'],['comercial',null],['INVALIDO ; DROP',null],[null,null]]){
  const decision=audioHandoffDecision({...base,contact:{...base.contact,department:dep}})
  assert.equal(decision.agent,'clara')
  assert.equal(decision.humanHandoff,true)
  assert.equal(decision.handoff.department,expected)
  assert.match(decision.reply,/não tenho acesso ao conteúdo/i)
  assert.doesNotMatch(decision.reply,/ouvi o áudio|guincho|sinistro aberto|CPF|apólice|cobertura/i)
  assert.doesNotMatch(JSON.stringify(decision.handoff),/5511|11144477735/)
 }
})
async function simulate(lastDepartment){
 const keys=['PHOENIX_ONE_TOKEN','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_MEGABRAIN_SHADOW']
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),prev=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=fakeToken
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-bridge-token'
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 const actions=[]
 globalThis.fetch=async(url,opts)=>{
  if(!url.includes('phoenix-one-bridge'))throw Error('áudio não pode abrir modelo nem consultar documentos')
  const data=JSON.parse(opts.body);actions.push(data.action)
  assert.equal(data.action,'intro_status')
  assert.equal(data.protocolo,'20261109-0004-1')
  return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:true,blocked:false}}}
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+fakeToken},
   body:{...base,contact:{...base.contact,department:lastDepartment}}}
  const res=response();await respond(req,res)
  return {res,actions}
 }finally{globalThis.fetch=prev;for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v}
}
test('API: áudio em cotação de Murilo vai para Clara e humano, não cria lead',async()=>{
 const {res,actions}=await simulate('patrimonio')
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'patrimonio')
 assert.match(res.body.reply,/áudio/i)
 assert.deepEqual(actions,['intro_status'])
})
test('API: áudio sem departamento segue fila geral (department: null)',async()=>{
 const {res}=await simulate(undefined)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,null)
})
test('API: áudio com departamento comercial não pode criar lead no funil',async()=>{
 const {res}=await simulate('comercial')
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,null)
})
