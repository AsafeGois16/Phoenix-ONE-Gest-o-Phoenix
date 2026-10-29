import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/v1/conversations/respond.js'
const token='fake_bridge_token_unit_only'
const conversation_id='8a34238c-fa0e-4420-bb7c-dbb2856d6c1b'
const testCPF='111.444.777-35'
const msgs=(texts)=>texts.map(text=>({direction:'inbound',author:'contact',type:'text',text}))
function request(texts){return {method:'POST',headers:{authorization:'Bearer '+token},body:{
 conversation_id,protocolo:'20261028-0007',mode:'sugestao',agent_hint:'murilo',
 contact:{kind:'desconhecido',phone_e164:'+5511999990000',display_name:'Teste'},
 messages:msgs(texts)
}}}
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(b){this.body=b;return this}}}
function withMock(fn){
 const prevFetch=globalThis.fetch
 const prev={token:process.env.PHOENIX_ONE_TOKEN,key:process.env.OPENAI_API_KEY,url:process.env.VITE_SUPABASE_URL,internal:process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN}
 process.env.PHOENIX_ONE_TOKEN=token
 process.env.OPENAI_API_KEY='not-real-for-unit-test'
 process.env.VITE_SUPABASE_URL='https://test-example.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='not-real-for-unit-test'
 return fn().finally(()=>{
  globalThis.fetch=prevFetch
  for(const [k,v] of Object.entries({PHOENIX_ONE_TOKEN:prev.token,OPENAI_API_KEY:prev.key,VITE_SUPABASE_URL:prev.url,PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN:prev.internal})){if(v===undefined)delete process.env[k];else process.env[k]=v}
 })
}
const json=data=>({ok:true,status:200,async json(){return data}})
test('solicitação de apólices não usa telefone e pede CPF/CNPJ',()=>withMock(async()=>{
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  assert.equal(d.action,'context')
  return json({prompt:'Prompt de teste',sources:[]})
 }
 const res=response();await handler(request(['Quais seguros eu tenho?']),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.match(res.body.reply,/CPF ou CNPJ/)
 assert.equal(res.body.humanHandoff,false)
}))
test('documento recebido gera revisão humana sem contrato v1.1',()=>withMock(async()=>{
 const calls=[]
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body);calls.push(d)
  if(d.action==='context'){assert.ok(!JSON.stringify(d).includes('11144477735'));return json({prompt:'Prompt de teste',sources:[]})}
  if(d.action==='identity_context'){
    assert.equal(d.document,'11144477735')
    assert.equal(d.documentType,'cpf')
    assert.equal(d.conversationId,conversation_id)
    assert.equal(d.protocolo,'20261028-0007')
    return json({status:'unavailable'})
  }
  throw Error('Unexpected fetch')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'comercial')
 assert.ok(!JSON.stringify(res.body).includes('11144477735'))
 assert.ok(!JSON.stringify(res.body).includes(testCPF))
 assert.deepEqual(calls.map(x=>x.action).sort(),['identity_context','intro_status']) // registro de apresentação sem RAG ou modelo
}))
test('documento inválido não consulta apólices nem envia dado ao modelo',()=>withMock(async()=>{
 let identityCalls=0
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body);if(d.action==='identity_context')identityCalls++
  return json({prompt:'Prompt de teste',sources:[]})
 }
 const res=response();await handler(request(['Quais seguros eu tenho?','111.444.777-36']),res)
 assert.equal(res.code,200);assert.match(res.body.reply,/conferir/i)
 assert.equal(identityCalls,0)
}))
test('após verificação a Clara responde diretamente com informação autorizada sem chamar OpenAI',()=>withMock(async()=>{
 let openAiPayload=null
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(url.includes('phoenix-one-bridge')&&d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(url.includes('phoenix-one-bridge')&&d.action==='identity_context')return json({status:'verified',policies:[{numero:'FICTICIO',ramo:'Automóvel'}],installments:[]})
  if(url.includes('api.openai.com')){
    openAiPayload=d;return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Há uma apólice de automóvel associada à titularidade verificada.',humanHandoff:false,handoff:null})}]}]})
  }
  throw Error('Unexpected fetch')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,false)
 assert.equal(openAiPayload,null)
 assert.match(res.body.reply,/FICTICIO/)
 assert.match(res.body.reply,/Automóvel/)
 assert.ok(!JSON.stringify(res.body).includes('11144477735'))
 assert.ok(!JSON.stringify(res.body).includes(testCPF))
}))


test('CPF: verification_required solicita nascimento, sem handoff imediato',()=>withMock(async()=>{
 let calls=0
 globalThis.fetch=async(url,options)=>{
  const data=JSON.parse(options.body)
  if(data.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(data.action==='identity_context'){
   calls++
   assert.equal(data.document,'11144477735')
   assert.equal(data.proof,undefined)
   return json({status:'verification_required',verification:{method:'birth_date',attempts_left:2}})
  }
  throw Error('Nao deveria chamar OpenAI enquanto pede prova')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara');assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/data de nascimento/i);assert.equal(calls,1)
}))
test('CPF: nascimento vai ao Junior e carteira verificada é respondida sem OpenAI',()=>withMock(async()=>{
 let called=false,model=null
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(url.includes('phoenix-one-bridge')&&d.action==='context'){assert.ok(!JSON.stringify(d).includes('25/11/1990'));return json({prompt:'Prompt de teste',sources:[]})}
  if(url.includes('phoenix-one-bridge')&&d.action==='identity_context'){
   called=true;assert.deepEqual(d.proof,{birth_date:'1990-11-25'})
   return json({status:'verified',policies:[{numero:'APOLICE-FICTICIA',ramo:'Auto'}],installments:[]})
  }
  if(url.includes('api.openai.com')){
   model=d;return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Seu seguro foi localizado.',humanHandoff:false,handoff:null})}]}]})
  }
  throw Error('Fetch nao previsto')
 }
 const res=response(),input=request(['Quais seguros eu tenho?',testCPF])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:'Pode informar sua data de nascimento no formato DD/MM/AAAA?'},{direction:'inbound',author:'contact',type:'text',text:'25/11/1990'})
 await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,false);assert.equal(called,true)
 assert.equal(model,null)
 assert.match(res.body.reply,/APOLICE-FICTICIA/)
 assert.ok(!JSON.stringify(res.body).includes('25/11/1990'))
 assert.ok(!JSON.stringify(res.body).includes('1990-11-25'))
 assert.ok(!JSON.stringify(res.body).includes('11144477735'))
}))
test('CNPJ: CEP enviado apenas ao bridge e nova tentativa permitida',()=>withMock(async()=>{
 let called=false
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(d.action==='identity_context'){
   called=true;assert.equal(d.documentType,'cnpj');assert.equal(d.document,'11222333000181')
   assert.deepEqual(d.proof,{cep:'01234567'})
   return json({status:'verification_required',verification:{method:'cep',attempts_left:1}})
  }
  throw Error('OpenAI nao deveria ser chamada')
 }
 const res=response(),input=request(['Quais seguros eu tenho?','11.222.333/0001-81'])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:'Pode informar o CEP cadastrado (8 números)?'},{direction:'inbound',author:'contact',type:'text',text:'01234-567'})
 await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,false);assert.match(res.body.reply,/CEP/)
 assert.ok(called)
}))
test('Limite de tentativas gera encaminhamento humano sem dados privados',()=>withMock(async()=>{
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(d.action==='identity_context')return json({status:'too_many_attempts'})
  throw Error('Nao pode consultar OpenAI')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,true)
 assert.ok(!JSON.stringify(res.body).includes('11144477735'))
}))
test('Junior pede validação humana, não nascimento/CEP',()=>withMock(async()=>{
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='context')return json({prompt:'Prompt de teste',sources:[]})
  if(d.action==='identity_context')return json({status:'verification_required',verification:{method:'human',attempts_left:2}})
  throw Error('Nao pode consultar OpenAI')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.humanHandoff,true)
}))


test('cumprimento curto consulta só prompt e não pesquisa a biblioteca RAG',()=>withMock(async()=>{
 const actions=[]
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(url.includes('phoenix-one-bridge')){
   actions.push(d.action)
   if(d.action==='intro_status')return json({clara_apresentada:false,murilo_apresentado:false})
    assert.equal(d.action,'prompt_only')
   return json({prompt:'Você é Clara, concierge da Phoenix Insurance.',sources:[]})
  }
  if(url.includes('api.openai.com'))return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Olá! 💙 Como posso ajudar você?',humanHandoff:false,handoff:null})}]}]})
  throw Error('chamada inesperada')
 }
 const res=response()
 await handler(request(['Oi']),res)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.deepEqual(actions,['intro_status','prompt_only'])
}))
test('CPF ausente: resposta imediata sem buscar RAG e sem chamar OpenAI',()=>withMock(async()=>{
 let requests=0
 globalThis.fetch=async(url,opts)=>{requests++;const d=JSON.parse(opts.body);assert.equal(d.action,'intro_status');return json({clara_apresentada:false,murilo_apresentado:false})}
 const res=response()
 await handler(request(['Quais seguros eu tenho?']),res)
 assert.equal(res.code,200)
 assert.equal(requests,1) // única consulta à memória; nenhuma consulta a clientes, RAG ou OpenAI
 assert.match(res.body.reply,/CPF ou CNPJ/)
}))
test('CPF inválido: resposta imediata sem consulta externa',()=>withMock(async()=>{
 let requests=0
 globalThis.fetch=async(url,opts)=>{requests++;const d=JSON.parse(opts.body);assert.equal(d.action,'intro_status');return json({clara_apresentada:false,murilo_apresentado:false})}
 const res=response()
 await handler(request(['Quais seguros eu tenho?','111.444.777-36']),res)
 assert.equal(res.code,200)
 assert.equal(requests,1) // única consulta à memória; nenhuma consulta a clientes, RAG ou OpenAI
 assert.match(res.body.reply,/conferir/i)
}))
test('identidade comprovada: RAG e identity_context iniciam antes de aguardar retorno',()=>withMock(async()=>{
 let started=[]
 let contextResolve
 let identityResolve
 const pendingContext=new Promise(resolve=>contextResolve=resolve)
 const pendingIdentity=new Promise(resolve=>identityResolve=resolve)
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(url.includes('phoenix-one-bridge')&&d.action==='context'){started.push('context');await pendingContext;return json({prompt:'Clara',sources:[]})}
  if(url.includes('phoenix-one-bridge')&&d.action==='identity_context'){started.push('identity');await pendingIdentity;return json({status:'verified',policies:[],installments:[]})}
  if(url.includes('api.openai.com'))return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Identidade confirmada. Como posso ajudar?',humanHandoff:false,handoff:null})}]}]})
  throw Error('chamada inesperada')
 }
 const input=request(['Quais seguros eu tenho?',testCPF])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:'Pode informar sua data de nascimento no formato DD/MM/AAAA?'},{direction:'inbound',author:'contact',type:'text',text:'25/11/1990'})
 const res=response()
 const work=handler(input,res)
 // Ao contrário da implementação anterior, ambas requisições devem começar sem depender uma da outra.
 await new Promise(resolve=>setImmediate(resolve))
 assert.deepEqual(started.sort(),['context','identity'])
 contextResolve()
 identityResolve()
 await work
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,false)
}))

test('Murilo apresenta-se ao assumir cotação residencial após Clara, sem consultar CPF de novo',()=>withMock(async()=>{
 let seenModel=false
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(url.includes('phoenix-one-bridge')&&d.action==='context')return json({prompt:'Prompt comercial',sources:[]})
  if(url.includes('api.openai.com')){seenModel=true;return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'É uma casa ou apartamento?',humanHandoff:false,handoff:null})}]}]})}
  throw Error('Não deveria exigir identidade em cotação')
 }
 const input=request(['Quais seguros eu tenho?',testCPF,'Eu queria cotar sobre seguro residencial'])
 input.body.messages.splice(input.body.messages.length-1,0,{direction:'outbound',author:'agent',type:'text',text:'Você possui seguro Auto pela Bradesco.'})
 const res=response();await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'murilo');assert.equal(res.body.humanHandoff,false);assert.ok(seenModel)
 assert.match(res.body.reply,/Sou o Murilo/)
 assert.match(res.body.reply,/casa ou apartamento/)
}))
test('Clara não transfere para patrimônio em consulta autorizada com pendências e prêmio',()=>withMock(async()=>{
 let calledModel=false
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='identity_context')return json({status:'verified',
   policies:[{numero:'APOLICE-AUTO',ramo:'Automóvel',seguradora:'Bradesco',premio_total:1360,capital_segurado:45000}],
   installments:[{apolice:'APOLICE-AUTO',valor:214.41,vencimento:'2026-10-20',vencida:true}],
   pending:[{description:'Comprovante de endereço pendente',status:'aguardando documento',due_date:'2026-11-10'}]
  })
  if(d.action==='context')return json({prompt:'Clara',sources:[]})
  if(url.includes('api.openai.com')){calledModel=true;throw Error('Não deve usar OpenAI para listar dados verificados')}
  throw Error('Unexpected call')
 }
 const res=response();await handler(request(['Quais seguros eu tenho?',testCPF]),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara');assert.equal(res.body.humanHandoff,false)
 assert.equal(calledModel,false)
 assert.match(res.body.reply,/Bradesco/)
 assert.match(res.body.reply,/Prêmio total:/)
 assert.match(res.body.reply,/Parcela:/)
 assert.match(res.body.reply,/Comprovante de endereço pendente/)
}))

test('memória de cotação preserva Murilo quando histórico de mensagens ficou curto',()=>withMock(async()=>{
 let reachedModel=false
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(url.includes('phoenix-one-bridge')){
   assert.equal(d.action,'context')
   assert.equal(d.intent,'neutral')
   assert.equal(d.suggestedAgent,'clara')
   return json({agent:'murilo',prompt:'Você é Murilo, vendedor da Phoenix.',sources:[]})
  }
  if(url.includes('api.openai.com')){
   reachedModel=true;return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Qual é o tipo de imóvel?',humanHandoff:false,handoff:null})}]}]})
  }
  throw Error('Fetch inesperado')
 }
 const res=response();await handler(request(['Fica na região central da cidade']),res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'murilo')
 assert.equal(res.body.humanHandoff,false);assert.match(res.body.reply,/Sou o Murilo/)
 assert.ok(reachedModel)
}))
test('protocolo atribuído ao humano não prossegue atendimento com IA',()=>withMock(async()=>{
 globalThis.fetch=async(url,opts)=>({ok:false,status:409,async json(){return {error:'assigned_to_human'}}})
 const res=response();await handler(request(['Oi']),res)
 assert.equal(res.code,503)
 assert.equal(res.body.error,'assigned_to_human')
}))


test('movimentação inicia pelo CPF/CNPJ do titular, sem transferir nem consultar outros planos',()=>withMock(async()=>{
 globalThis.fetch=async()=>{throw Error('Ainda não consultar API antes do documento')}
 const res=response();await handler(request(['Preciso de ajuda para incluir meu filho no meu plano de saúde']),res)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/)
 assert.doesNotMatch(res.body.reply,/operadora do plano ou a empresa/)
}))
test('mesmo sem produto ou vínculo, primeiro solicita identificação',()=>withMock(async()=>{
 globalThis.fetch=async()=>{throw Error('Sem consulta prévia à identificação')}
 const res=response();await handler(request(['Gostaria de incluir um beneficiário']),res)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/)
}))
test('após CPF, Clara espera prova de identidade do Junior antes de listar Saúde',()=>withMock(async()=>{
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(d.action==='identity_context'){
   assert.equal(d.documentType,'cpf')
   return json({status:'verification_required',verification:{method:'birth_date',attempts_left:2}})
  }
  throw Error('Não consultar modelo ou base de conhecimento')
 }
 const res=response();await handler(request(['Preciso incluir meu filho no plano de saúde',testCPF]),res)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/data de nascimento/)
 assert.doesNotMatch(res.body.reply,/Amil|Unimed/)
}))
test('identidade confirmada: listar apenas apólices de Saúde e aguardar seleção',()=>withMock(async()=>{
 const set=[
  {ramo:'Saúde',numero:'SAU-1111',seguradora:'Amil',linha:'Saúde'},
  {ramo:'Odonto',numero:'ODO-2222',seguradora:'Porto Seguro',linha:'Odonto'},
  {ramo:'Assistência Médica',numero:'SAU-3333',seguradora:'SulAmérica',linha:'Saúde'}
 ]
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(d.action==='identity_context')return json({status:'verified',policies:set,installments:[]})
  throw Error('Não chamar OpenAI nem outro serviço')
 }
 const input=request(['Preciso incluir meu filho no plano de saúde',testCPF])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:'Pode informar a data de nascimento do titular?'},
  {direction:'inbound',author:'contact',type:'text',text:'25/11/1990'})
 const res=response();await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/Amil/)
 assert.match(res.body.reply,/SulAmérica/)
 assert.doesNotMatch(res.body.reply,/Porto Seguro|Odonto/)
 assert.match(res.body.reply,/Qual destes planos de Saúde/)
}))
test('seleção após identidade verificada encaminha resumo somente de Saúde',()=>withMock(async()=>{
 const set=[{ramo:'Saúde',numero:'AP-1111',seguradora:'Amil'},{ramo:'Odonto',numero:'OD-2222',seguradora:'Porto'},{ramo:'Saúde',numero:'AP-3333',seguradora:'SulAmérica'}]
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(d.action==='identity_context')return json({status:'verified',policies:set,installments:[]})
  throw Error('Sem modelo ou acesso operacional')
 }
 const input=request(['Preciso incluir meu filho no plano de saúde',testCPF])
 input.body.messages.push({direction:'outbound',author:'agent',type:'text',text:['Identidade confirmada. Encontrei estes planos de Saúde vinculados ao cadastro verificado:','1. Saúde — Amil · apólice final 1111','2. Saúde — SulAmérica · apólice final 3333','','Qual destes planos de Saúde você deseja movimentar? Responda com o número da opção.'].join('\n')},
  {direction:'inbound',author:'contact',type:'text',text:'2'})
 const res=response();await handler(input,res)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'backoffice')
 assert.match(res.body.handoff.summary,/SulAmérica/)
 assert.doesNotMatch(res.body.handoff.summary,/Porto|OD-2222/)
 assert.doesNotMatch(res.body.reply,/111\.444\.777-35/)
}))
test('sem confirmação da gestão o fluxo encaminha apenas para validação manual',()=>withMock(async()=>{
 globalThis.fetch=async(url,options)=>{
  const d=JSON.parse(options.body)
  if(d.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(d.action==='identity_context')return json({status:'unavailable'})
  throw Error('Não consultar outros serviços')
 }
 const res=response();await handler(request(['Preciso excluir minha filha do plano de saúde',testCPF]),res)
 assert.equal(res.code,200)
 assert.equal(res.body.humanHandoff,true)
 assert.equal(res.body.handoff.department,'backoffice')
 assert.match(res.body.reply,/não consegui concluir a validação/i)
 assert.doesNotMatch(JSON.stringify(res.body),/11144477735|111\.444\.777-35/)
}))
test('Clara encaminha consulta de andamento de movimentação à equipe humana',()=>withMock(async()=>{
 globalThis.fetch=async()=>{throw Error('Não consultar APIs de movimentação não disponíveis')}
 const res=response();await handler(request(['Como está o andamento da minha exclusão?']),res)
 assert.equal(res.code,200)
 assert.equal(res.body.handoff?.department,'backoffice')
 assert.equal(res.body.humanHandoff,true)
 assert.match(res.body.reply,/precisa ser confirmado/i)
}))


test('apresentação da Clara sobrevive à saída do histórico recente',()=>withMock(async()=>{
 const messages=Array.from({length:20},(_,i)=>({direction:i%2?'outbound':'inbound',author:i%2?'agent':'contact',type:'text',text:i%2?'Está bem, posso ajudar.':'Continuando atendimento'}))
 messages[19]={direction:'inbound',author:'contact',type:'text',text:'Preciso excluir minha filha do plano de saúde da Amil'}
 globalThis.fetch=async(url,opts)=>{
  const data=JSON.parse(opts.body)
  assert.equal(data.action,'intro_status')
  assert.equal(data.observedClara,false)
  return json({clara_apresentada:true,murilo_apresentado:false,blocked:false})
 }
 const input=request([]);input.body.messages=messages
 const res=response();await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'clara')
 assert.doesNotMatch(res.body.reply,/Sou a Clara/)
 assert.equal(res.body.humanHandoff,false)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/)
}))
test('Murilo não se apresenta novamente quando histórico perdeu a apresentação',()=>withMock(async()=>{
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(d.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:true})
  if(d.action==='context')return json({agent:'murilo',prompt:'Atenda como Murilo SDR',sources:[]})
  if(url.includes('api.openai.com'))return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'Olá! Sou o Murilo, do time comercial da Phoenix Insurance. O imóvel é casa ou apartamento?',humanHandoff:false,handoff:null})}]}]})
  throw Error('chamada inesperada')
 }
 const input=request(['Quero cotar um seguro residencial'])
 const res=response();await handler(input,res)
 assert.equal(res.code,200);assert.equal(res.body.agent,'murilo')
 assert.doesNotMatch(res.body.reply,/Sou o Murilo/)
 assert.match(res.body.reply,/casa ou apartamento/)
}))
test('cada agente tem sua própria apresentação mesmo após outro agente já ter falado',()=>withMock(async()=>{
 globalThis.fetch=async(url,opts)=>{
  const d=JSON.parse(opts.body)
  if(d.action==='intro_status')return json({clara_apresentada:true,murilo_apresentado:false})
  if(d.action==='context')return json({agent:'murilo',prompt:'Atenda como Murilo SDR',sources:[]})
  if(url.includes('api.openai.com'))return json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'É uma casa ou apartamento?',humanHandoff:false,handoff:null})}]}]})
  throw Error('chamada inesperada')
 }
 const res=response();await handler(request(['Quero cotar seguro residencial']),res)
 assert.equal(res.code,200);assert.match(res.body.reply,/Sou o Murilo/)
 assert.doesNotMatch(res.body.reply,/Sou a Clara/)
}))
test('propostas não são confundidas com apresentações realmente enviadas',async()=>{
 const {observedAgentIntroductions}=await import('../server/conversation-policy.js')
 assert.deepEqual(observedAgentIntroductions([{direction:'inbound',author:'contact',text:'Sou a Clara'}]),{clara:false,murilo:false})
 assert.deepEqual(observedAgentIntroductions([{direction:'outbound',author:'staff',text:'Sou o Murilo'}]),{clara:false,murilo:false})
 const sent=[{direction:'outbound',author:'agent',text:'Olá! Sou a Clara, concierge Phoenix.'},{direction:'outbound',author:'agent',text:'Sou o Murilo, comercial Phoenix.'}]
 assert.deepEqual(observedAgentIntroductions(sent),{clara:true,murilo:true})
})

test('após retorno do Backoffice, Clara responde a novo assunto sem repetir transferência',()=>withMock(async()=>{
 const input=request(['Preciso de ajuda para incluir meu filho no meu plano de saúde'])
 input.body.messages.push(
  {direction:'outbound',author:'agent',type:'text',text:'Concluí a etapa de verificação, mas não consegui identificar um plano de Saúde para seleção nesta consulta. Vou direcionar sua solicitação ao Backoffice para conferência, sem realizar nenhuma movimentação.'},
  {direction:'outbound',author:'staff',type:'text',text:'O Backoffice devolveu o atendimento ao agente.'},
  {direction:'inbound',author:'contact',type:'text',text:'Certo pode me ajudar em mais uma coisa?'}
 )
 let calls=0
 globalThis.fetch=async(url,opts)=>{
  const data=JSON.parse(opts.body);calls++
  assert.equal(data.action,'intro_status')
  return json({clara_apresentada:true,murilo_apresentado:false})
 }
 const res=response();await handler(input,res)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/Como posso ajudar com a sua nova solicitação/)
 assert.doesNotMatch(res.body.reply,/não consegui identificar|Backoffice|Sou a Clara/)
 assert.equal(calls,1)
}))
test('após retorno, nova movimentação não utiliza o documento anterior',()=>withMock(async()=>{
 const input=request(['Quero incluir meu filho no plano de saúde',testCPF])
 input.body.messages.push(
  {direction:'outbound',author:'agent',type:'text',text:'Vou direcionar sua solicitação ao Backoffice para conferência manual.'},
  {direction:'inbound',author:'contact',type:'text',text:'Certo, pode me ajudar em mais uma coisa?'},
  {direction:'outbound',author:'agent',type:'text',text:'Claro! Como posso ajudar?'},
  {direction:'inbound',author:'contact',type:'text',text:'Quero excluir minha esposa do plano Odonto'}
 )
 let calls=0
 globalThis.fetch=async(url,opts)=>{
  const data=JSON.parse(opts.body);calls++
  assert.equal(data.action,'intro_status')
  return json({clara_apresentada:true,murilo_apresentado:false})
 }
 const res=response();await handler(input,res)
 assert.equal(res.code,200)
 assert.equal(res.body.agent,'clara')
 assert.equal(res.body.humanHandoff,false)
 assert.equal(res.body.handoff,null)
 assert.match(res.body.reply,/CPF ou CNPJ do titular/)
 assert.equal(calls,1)
}))
