import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'
const token='unit-test-junior-not-real'
const conversationId='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const inc=text=>({direction:'inbound',author:'contact',type:'text',text})
const out=text=>({direction:'outbound',author:'agent',type:'text',text})
const fakeCpf='111.444.777-35'
const envKeys=['PHOENIX_ONE_TOKEN','OPENAI_API_KEY','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','PHOENIX_ONE_V4_VERIFIED_CONTEXT','PHOENIX_MEGABRAIN_SHADOW']
const mockRes=()=>({code:200,setHeader(){},status(c){this.code=c;return this},json(body){this.body=body;return this}})
async function simulate(messages,{policies=[{ramo:'Residencial',seguradora:'Teste'}],identityStatus='verified',agentHint='murilo'}={}){
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]])),priorFetch=globalThis.fetch
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='dummy-test-only'
 process.env.VITE_SUPABASE_URL='https://example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='dummy-internal'
 delete process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT
 delete process.env.PHOENIX_MEGABRAIN_SHADOW
 const calls=[]
 globalThis.fetch=async(url,opts)=>{
  if(!url.includes('phoenix-one-bridge'))throw Error('Sinistro ainda não pode chamar OpenAI nem executar acionamentos')
  const d=JSON.parse(opts.body);calls.push(d.action)
  if(d.action==='intro_status')return {ok:true,status:200,async json(){return {clara_apresentada:true,murilo_apresentado:false,blocked:false}}}
  if(d.action==='identity_context'){
   assert.equal(d.document,'11144477735')
   assert.equal(d.documentType,'cpf')
   assert.equal(d.protocolo,'20261110-0042-1')
   return {ok:true,status:200,async json(){return {
    status:identityStatus,policies,installments:[],pending:[],
    ...(identityStatus==='verification_required'?{verification:{method:'birth_date',attempts_left:2}}:{})
   }}}
  }
  throw Error('Ação Junior não esperada: '+d.action)
 }
 try{
  const req={method:'POST',headers:{authorization:'Bearer '+token},body:{
   conversation_id:conversationId,protocolo:'20261110-0042-1',mode:'sugestao',agent_hint:agentHint,
   contact:{kind:'cliente',phone_e164:'+5511999990000',display_name:'Contato fictício'},messages
  }}
  const res=mockRes();await handler(req,res);return {res,calls}
 }finally{
  globalThis.fetch=priorFetch
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v
 }
}
test('S04 Roubo Auto: Clara pergunta segurança PESSOAL e orienta 190 antes do CPF',async()=>{
 const {res,calls}=await simulate([inc('Roubaram meu carro e preciso acionar meu seguro Auto.')])
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/190/)
 assert.doesNotMatch(res.body.reply,/ve[ií]culo est[aá] em local seguro|CPF|CNPJ/i)
 assert.deepEqual(calls,['intro_status'])
})
test('S07 incêndio Residencial: evacuação e 193 antes de CPF mesmo com hint comercial',async()=>{
 const msg='Minha casa pegou fogo e preciso acionar o seguro residencial.'
 const a=await simulate([inc(msg)])
 assert.equal(a.res.code,200);assert.equal(a.res.body.agent,'clara')
 assert.match(a.res.body.reply,/saia do im[oó]vel/i)
 assert.match(a.res.body.reply,/193/)
 assert.doesNotMatch(a.res.body.reply,/CPF|CNPJ|franquia/i)
 assert.deepEqual(a.calls,['intro_status'])
 const b=await simulate([inc(msg),out(a.res.body.reply),inc('Sim, todos em segurança')])
 assert.match(b.res.body.reply,/CPF ou CNPJ/i)
 assert.equal(b.res.body.humanHandoff,false)
 assert.deepEqual(b.calls,['intro_status'])
 const c=await simulate([inc(msg),out(a.res.body.reply),inc('Sim, todos em segurança'),
  out(b.res.body.reply),inc(fakeCpf)])
 assert.deepEqual(c.calls,['intro_status','identity_context'])
 assert.match(c.res.body.reply,/identidade foi confirmada/i)
 assert.match(c.res.body.reply,/Auto\/RE/)
 assert.doesNotMatch(JSON.stringify(c.res.body),/11144477735|111\.444\.777-35|indeniza[cç][aã]o garantida/)
 const d=await simulate([inc(msg),out(a.res.body.reply),inc('Sim, todos em segurança'),
  out(b.res.body.reply),inc(fakeCpf),out(c.res.body.reply),inc('Sim')])
 assert.equal(d.res.body.humanHandoff,true)
 assert.equal(d.res.body.handoff.department,'patrimonio')
 assert.match(d.res.body.handoff.summary,/Residencial/)
 assert.doesNotMatch(JSON.stringify(d.res.body),/11144477735|111\.444\.777-35/)
})
test('S08 e S09: risco humano antes de confirmação de contrato',async()=>{
 for(const msg of [
  'Houve um incêndio no galpão da empresa e preciso acionar o seguro empresarial.',
  'Ocorreu um incêndio nas áreas comuns do condomínio.'
 ]){
  const {res,calls}=await simulate([inc(msg)])
  assert.equal(res.body.agent,'clara')
  assert.match(res.body.reply,/193/)
  assert.doesNotMatch(res.body.reply,/CPF|CNPJ/)
  assert.deepEqual(calls,['intro_status'])
 }
})
test('S15 Saúde: acolhe e pergunta o quadro clínico, risco grave oferece SAMU 192',async()=>{
 const msg='Preciso de internação urgente pelo meu plano de saúde.'
 const a=await simulate([inc(msg)])
 assert.match(a.res.body.reply,/situa[cç][aã]o cl[ií]nica/i)
 assert.match(a.res.body.reply,/192/)
 assert.doesNotMatch(a.res.body.reply,/CPF|CNPJ/i)
 const b=await simulate([inc(msg),out(a.res.body.reply),inc('Está com dor no peito e falta de ar')])
 assert.match(b.res.body.reply,/192|pronto-socorro/i)
 assert.doesNotMatch(b.res.body.reply,/CPF|CNPJ/i)
})
test('S06: Frota valida unidade interna antes de consultar identidade',async()=>{
 const msg='Um veículo utilitário da frota da empresa sofreu uma colisão.'
 const a=await simulate([inc(msg)])
 assert.match(a.res.body.reply,/feridos|risco imediato/i)
 const b=await simulate([inc(msg),out(a.res.body.reply),inc('Não, sem feridos')])
 assert.match(b.res.body.reply,/qual ve[ií]culo ou unidade/i)
 const c=await simulate([inc(msg),out(a.res.body.reply),inc('Não, sem feridos'),out(b.res.body.reply),inc('É a unidade 2')])
 assert.match(c.res.body.reply,/CPF ou CNPJ/i)
 const d=await simulate([inc(msg),out(a.res.body.reply),inc('Não, sem feridos'),out(b.res.body.reply),inc('É a unidade 2'),out(c.res.body.reply),inc(fakeCpf)],{policies:[{ramo:'Frota'}]})
 assert.deepEqual(d.calls,['intro_status','identity_context'])
 assert.match(d.res.body.reply,/Auto\/RE/)
 assert.doesNotMatch(d.res.body.reply,/placa completa|franquia|cobertura garantida/i)
})
test('S11 Bike: sem perguntas de Auto; depois de não haver feridos, verificar titular',async()=>{
 const msg='Roubaram minha bicicleta e quero acionar Seguro Bike.'
 const a=await simulate([inc(msg)])
 assert.equal(a.res.body.agent,'clara')
 assert.doesNotMatch(a.res.body.reply,/carro|autom[oó]vel|guincho|placa/i)
 const b=await simulate([inc(msg),out(a.res.body.reply),inc('Não')])
 assert.match(b.res.body.reply,/CPF ou CNPJ/i)
})
test('S16, S18 e S20: triagem humana específica não libera consulta sem CPF',async()=>{
 for(const [msg,re] of [
  ['Minha filha sofreu trauma dentário, preciso do plano Odonto.',/sangramento intenso/i],
  ['Sofri acidente e quero acionar Seguro Acidentes Pessoais com DIT.',/atendimento m[eé]dico urgente/i],
  ['Meu pet está doente e preciso do Seguro Pet.',/veterin[aá]rio imediato/i]
 ]){
  const a=await simulate([inc(msg)])
  assert.match(a.res.body.reply,re)
  assert.doesNotMatch(a.res.body.reply,/CPF|CNPJ/i)
  const b=await simulate([inc(msg),out(a.res.body.reply),inc('Não')])
  assert.match(b.res.body.reply,/CPF ou CNPJ/i)
  assert.deepEqual(a.calls,['intro_status'])
 }
})
test('S19: apólice de Viagem somente após identity verified, nunca pela menção no texto',async()=>{
 const msg='Minha mala foi extraviada e quero acionar meu seguro viagem.'
 const a=await simulate([inc(msg)])
 assert.match(a.res.body.reply,/CPF ou CNPJ/i)
 assert.doesNotMatch(a.res.body.reply,/sua ap[oó]lice est[aá] ativa|cobertura ativa confirmada/i)
 const b=await simulate([inc(msg),out(a.res.body.reply),inc(fakeCpf)],{policies:[{ramo:'Viagem'}]})
 assert.deepEqual(b.calls,['intro_status','identity_context'])
 assert.match(b.res.body.reply,/identidade foi confirmada/i)
 assert.match(b.res.body.reply,/Backoffice/i)
 assert.doesNotMatch(b.res.body.reply,/cobertura garantida|reembolso aprovado/i)
})
test('identidade não validada nunca fornece detalhes da apólice no sinistro',async()=>{
 const msg='Meu apartamento pegou fogo e preciso de ajuda do seguro Residencial.'
 const r=await simulate([inc(msg),out('Todos estão em segurança?'),inc('Sim'),
  out('Para agilizar, pode informar CPF ou CNPJ do titular?'),inc(fakeCpf)],{
  policies:[{ramo:'Residencial',numero:'APOLICE-SECRETA-123'}],identityStatus:'verification_required'
 })
 assert.deepEqual(r.calls,['intro_status','identity_context'])
 assert.doesNotMatch(JSON.stringify(r.res.body),/APOLICE-SECRETA|cobertura garantida/i)
 assert.match(r.res.body.reply,/data de nascimento/i)
})
