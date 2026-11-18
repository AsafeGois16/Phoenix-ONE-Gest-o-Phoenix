import test from 'node:test'
import assert from 'node:assert/strict'
import handler,{runOrchestrationPreview} from '../api/v1/conversations/respond.js'
const only={mode:'clara_only',revision:2},both={mode:'clara_murilo',revision:1}
const user=text=>({direction:'inbound',author:'contact',type:'texto',text})
const bot=text=>({direction:'outbound',author:'agent',type:'texto',text})
const body=(messages,extra={})=>({conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20990101-0001-2',mode:'sugestao',contact:{kind:'lead'},messages,...extra})
async function capture(fn){
 let status,data
 const res={setHeader(){},status(n){status=n;return this},json(p){data=p;return p}}
 await fn(res);return {status,data}
}
async function run(messages,pin=only,extra={}){
 const previous=globalThis.fetch
 globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN_IN_PREVIEW')}
 try{return await capture(res=>runOrchestrationPreview(body(messages,extra),pin,res))}
 finally{globalThis.fetch=previous}
}
const auto='Gostaria de cotar um seguro para meu carro.'
test('Fase 3: motor real propõe comercial direto e reconhece aceite após apresentação',async()=>{
 for(const [text,product] of [[auto,'Auto'],['Quero contratar um plano de saúde empresarial.','Saúde'],['Quero contratar um seguro de vida.','Vida'],['Quero cotar um seguro residencial.','Residencial']]){
  const first=await run([user(text)])
  assert.equal(first.status,200);assert.equal(first.data.action,'reply',text);assert.equal(first.data.product,product)
  assert.equal(first.data.selectedAgent,'clara');assert.match(first.data.reply,/Sou a Clara/);assert.doesNotMatch(first.data.reply,/Murilo|CPF|CNPJ|placa|quantas vidas/)
  const accepted=await run([user(text),bot(first.data.reply),user('Sim')])
  assert.equal(accepted.data.action,'mapping_required',JSON.stringify(accepted))
  assert.match(accepted.data.reply,/Obrigada pela confirmação/)
  assert.doesNotMatch(accepted.data.reply,/Sou a Clara/)
  assert.equal(accepted.data.humanHandoff,false);assert.equal(accepted.data.executed,false)
 }
})
test('Fase 3: motor preserva pergunta de produto após apresentação e confirma recusa',async()=>{
 const first=await run([user('Quero uma cotação.')])
 assert.match(first.data.reply,/Qual produto/)
 const second=await run([user('Quero uma cotação.'),bot(first.data.reply),user('Seguro de vida.')])
 assert.equal(second.data.product,'Vida')
 const denied=await run([user(auto),bot((await run([user(auto)])).data.reply),user('Não')])
 assert.equal(denied.data.action,'reply');assert.match(denied.data.reply,/não farei o encaminhamento/)
 assert.equal(denied.data.humanHandoff,false)
})
test('Fase 3: modo original mantém seleção e acolhimento legado',async()=>{
 const r=await run([user(auto)],both)
 assert.equal(r.status,200);assert.equal(r.data.engineStage,'legacy');assert.equal(r.data.selectedAgent,'murilo')
 assert.equal(r.data.agent,'clara');assert.match(r.data.reply,/Como posso te chamar/i)
})
test('Fase 3: segurança residencial real precede qualificação, nos dois modos',async()=>{
 for(const pin of [only,both]){
  const r=await run([user('Houve um princípio de incêndio na minha residência.')],pin)
  assert.equal(r.status,200);assert.equal(r.data.agent,'clara')
  assert.match(r.data.reply,/193/);assert.match(r.data.reply,/saia|evacue/i)
  assert.equal(r.data.humanHandoff,false)
 }
})
test('Fase 3: movimentação exige identificação e não inicia comercial',async()=>{
 const r=await run([user('Preciso excluir minha esposa do plano odontológico.')])
 assert.equal(r.status,200);assert.equal(r.data.agent,'clara');assert.equal(r.data.engineStage,'legacy')
 assert.match(r.data.reply,/CPF|CNPJ/);assert.equal(r.data.humanHandoff,false)
})
test('Fase 3: áudio usa regra original sem transferência real',async()=>{
 const r=await run([user('[cliente enviou um áudio]')])
 assert.equal(r.data.agent,'clara');assert.equal(r.data.engineStage,'legacy')
 assert.match(r.data.reply,/áudio/);assert.equal(r.data.handoff,null);assert.equal(r.data.executed,false)
})
test('Fase 3: Murilo não reativa por hint ou histórico em modo somente Clara',async()=>{
 const r=await run([bot('Olá, sou o Murilo, do time comercial.'),user('Uso pessoal')],only,{agent_hint:'murilo'})
 assert.equal(r.status,200);assert.equal(r.data.selectedAgent,'clara');assert.equal(r.data.agent,'clara')
 assert.equal(r.data.action,'engine_boundary')
})
test('Fase 3: desligado, payload e pin inválidos, estado humano bloqueiam ensaio',async()=>{
 for(const [pin,extra] of [[only,{mode:'desligado'}],[only,{stage:'assigned'}],[null,{}]]){
  const r=await run([user(auto)],pin,extra);assert.equal(r.status,409)
 }
 assert.equal((await run([user(auto)],only,{protocolo:'invalido'})).status,400)
})
test('Fase 3: endpoint HTTP do Junior bloqueado na branch dedicada, antes da autenticação',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldBranch=process.env.VERCEL_GIT_COMMIT_REF
 try{
  process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='feat/orquestracao-agentes-fase3-preview'
  const r=await capture(res=>handler({method:'POST',headers:{},body:body([user(auto)])},res))
  assert.equal(r.status,503);assert.equal(r.data.error,'operational_preview_disabled')
 }finally{
  if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv
  if(oldBranch===undefined)delete process.env.VERCEL_GIT_COMMIT_REF;else process.env.VERCEL_GIT_COMMIT_REF=oldBranch
 }
})

test('Fase 3: F3-07 acolhimento feminino nas duas entradas, aceite e limite seguro',async()=>{
 const first=await run([user(auto)],both)
 const history=[user(auto),bot(first.data.reply),user('Me chamo Alex')]
 const named=await run(history,both)
 assert.equal(named.status,200);assert.equal(named.data.agent,'clara')
 assert.match(named.data.reply,/Obrigada, Alex!/);assert.match(named.data.reply,/Murilo/)
 assert.doesNotMatch(named.data.reply,/Obrigado|Sou a Clara/)
 assert.equal(named.data.humanHandoff,false)
 const accepted=await run([...history,bot(named.data.reply),user('Sim')],both)
 assert.equal(accepted.status,200);assert.equal(accepted.data.selectedAgent,'murilo')
 assert.equal(accepted.data.action,'engine_boundary');assert.equal(accepted.data.executed,false)
 const direct=await run([user('Me chamo Alex. Gostaria de cotar um seguro para meu carro.')],both)
 assert.equal(direct.status,200);assert.match(direct.data.reply,/Obrigada, Alex!/);assert.doesNotMatch(direct.data.reply,/Obrigado/)
})
