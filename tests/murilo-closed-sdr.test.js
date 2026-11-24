import test from 'node:test'
import assert from 'node:assert/strict'
import {SDR_PRODUCT_CODES,SDR_QUESTIONNAIRES,approvedQuestionsFor} from '../server/murilo-approved-questions.js'
import {detectSdrQuoteProduct,nextMuriloSdrDecision,muriloMediaReceived} from '../server/murilo-sdr-flow.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
import {confirmedOfferHandoff} from '../server/consent-routing.js'
const inc=(text,extra={})=>({direction:'inbound',author:'contact',type:'texto',text,...extra})
const out=text=>({direction:'outbound',author:'agent',type:'texto',text})
const base=product=>[inc(product),out('Sou o Murilo, do time comercial da Phoenix Insurance.')]
test('SDR: 20 produtos específicos, sem adicionar produtos ou questões de SPIN/BANT',()=>{
 assert.equal(SDR_PRODUCT_CODES.length,20)
 assert.equal(new Set(SDR_PRODUCT_CODES).size,20)
 assert.equal(Object.keys(SDR_QUESTIONNAIRES).length,17) // 3 variações empresariais reutilizam base
 for(const p of SDR_PRODUCT_CODES)assert.ok(approvedQuestionsFor(p).length>0,p)
 assert.deepEqual(approvedQuestionsFor('produto_desconhecido'),[])
})
test('SDR: não há duas perguntas no mesmo texto aprovado',()=>{
 for(const p of SDR_PRODUCT_CODES){
  const sources=[approvedQuestionsFor(p),approvedQuestionsFor(p,{type:'cpf',renewal:false,hasPlan:false,thirdParty:false}),
   approvedQuestionsFor(p,{type:'cnpj',renewal:true,hasPlan:true,thirdParty:true})]
  for(const q of sources.flat()){
   assert.ok((q.text.match(/\?/g)||[]).length<=1,p+'/'+q.id+' '+q.text)
   assert.ok(q.text.length<300,p+'/'+q.id)
  }
 }
})
test('SDR: pergunta única inicial vem do banco para cada produto, sem criar SPIN',()=>{
 const cases=[
  ['Quero cotar plano de Saúde.','saude'],
  ['Quero cotar plano de Saúde empresarial.','saude_empresarial'],
  ['Quero cotar plano Odonto.','odonto'],
  ['Quero cotar Odonto empresarial.','odonto_empresarial'],
  ['Quero cotar Seguro de Vida.','vida'],
  ['Quero cotar Seguro de Vida em grupo.','vida_grupo'],
  ['Quero cotar Seguro Pet.','pet'],
  ['Quero contratar Previdência privada.','previdencia'],
  ['Quero cotar Seguro Auto.','auto'],
  ['Quero cotar Seguro Frota.','frota'],
  ['Quero cotar Seguro Residencial.','residencial'],
  ['Quero cotar Seguro Fiança.','fianca'],
  ['Quero cotar Seguro Viagem.','viagem'],
  ['Quero cotar Seguro Bike.','bike'],
  ['Quero cotar Seguro Empresarial.','empresarial'],
  ['Quero cotar Seguro para Equipamentos.','equipamentos'],
  ['Quero cotar Seguro Responsabilidade Civil.','rc'],
  ['Quero cotar Seguro Cyber.','cyber'],
  ['Quero cotar Seguro Garantia.','garantia'],
  ['Quero cotar Seguro de Crédito.','credito']
 ]
 for(const [input,expected] of cases){
  const msgs=base(input)
  assert.equal(detectSdrQuoteProduct(msgs),expected,input)
  const d=nextMuriloSdrDecision([...msgs,inc('Gostaria de analisar as opções')])
  assert.equal(d.agent,'murilo',input)
  assert.equal(d.humanHandoff,false,input)
  assert.equal(d.handoff,null,input)
  const approved=approvedQuestionsFor(expected,{type:expected.endsWith('empresarial')?'cnpj':null})
  assert.ok(approved.some(q=>d.reply===q.text),input+' / '+d.reply)
 }
})
test('SDR: pergunta já entregue não é repetida; histórico é progressivo',()=>{
 const m=base('Quero cotar seguro Auto')
 const first=nextMuriloSdrDecision([...m,inc('Pode me ajudar na cotação?')])
 assert.match(first.reply,/marca, modelo e ano/i)
 const second=nextMuriloSdrDecision([...m,inc('Pode me ajudar na cotação?'),out(first.reply),inc('Onix 2023')])
 assert.match(second.reply,/seguro novo ou renovação/i)
 assert.doesNotMatch(second.reply,/marca, modelo e ano/i)
 const third=nextMuriloSdrDecision([...m,out(first.reply),inc('Onix 2023'),out(second.reply),inc('É renovação')])
 assert.match(third.reply,/pessoa física|CPF|CNPJ/i)
})
test('SDR: informações adiantadas eliminam perguntas redundantes',()=>{
 const m=base('Quero cotar plano de Saúde empresarial para 12 vidas, pelo CNPJ. Atualmente temos plano Amil.')
 const d=nextMuriloSdrDecision([...m,inc('Buscamos uma rede maior')])
 assert.doesNotMatch(d.reply,/somente para você|CPF ou CNPJ/i)
})
test('SDR: ramo PF/PJ e novo/renovação aplicam somente perguntas de sua trilha',()=>{
 const corpo=base('Quero cotar seguro Auto. Meu carro será renovado.')
 const m=[...corpo,inc('É renovação, pelo CPF')]
 const approved=approvedQuestionsFor('auto',{type:'cpf',renewal:true})
 assert.ok(approved.some(q=>/apólice atual/i.test(q.text)))
 assert.ok(approved.every(q=>!/\bplaca do veículo\b/.test(q.text)))
 const q=nextMuriloSdrDecision(m)
 assert.equal(q.agent,'murilo')
 assert.ok(approved.some(x=>x.text===q.reply),q.reply)
})
test('SDR: imagem só é recebida se houver indicação autenticada do Junior, sem análise de bytes',()=>{
 const questions=approvedQuestionsFor('auto',{type:'cpf',renewal:true})
 const asked=questions.filter(q=>!q.text.includes('O veículo é utilizado')).slice(0,questions.findIndex(q=>/apólice atual/i.test(q.text))+1)
 const m=[...base('Quero renovar meu seguro Auto, pelo CPF.'),inc('É renovação'),...asked.flatMap(q=>[out(q.text),inc('Informação de teste')])]
 const lastAsked=m.filter(x=>x.direction==='outbound').at(-1)
 assert.match(lastAsked.text,/apólice atual/i)
 const media=inc('',{media_received:true,media_kind:'image'})
 assert.equal(muriloMediaReceived(media),true)
 const d=nextMuriloSdrDecision([...m,media],{maxQuestions:12})
 assert.match(d.reply,/Recebi o anexo indicado pelo sistema/i)
 assert.doesNotMatch(d.reply,/identifiquei na foto|a imagem mostra|placa da foto/i)
 assert.ok((d.reply.match(/\?/g)||[]).length<=1)
 assert.equal(muriloMediaReceived(inc('Enviei uma foto')),false)
 const noAck=nextMuriloSdrDecision([...m,inc('Enviei uma foto')],{maxQuestions:12})
 assert.doesNotMatch(noAck.reply,/Recebi o anexo indicado/i)
})
test('SDR: imagens sem prévia pergunta documental não viram reconhecimento de apólice',()=>{
 const m=[...base('Quero cotar Seguro Residencial'),inc('',{media_received:true,media_kind:'image'})]
 const d=nextMuriloSdrDecision(m)
 assert.doesNotMatch(d.reply,/analisei|verifiquei|identifiquei|cobertura aprovada/i)
 assert.equal(d.humanHandoff,false)
})
test('SDR: pergunta de saúde preexistente e CPF do tutor são reservados à equipe segura',()=>{
 const a=approvedQuestionsFor('vida',{type:'cpf'})
 assert.ok(a.some(q=>q.sensitive&&/doença/i.test(q.text)))
 const b=approvedQuestionsFor('pet')
 assert.ok(b.some(q=>q.sensitive&&/CPF do tutor/i.test(q.text)))
 const msgs=base('Quero cotar seguro de vida pelo CPF')
 const turns=[...msgs]
 for(let i=0;i<10;i++){
  const d=nextMuriloSdrDecision([...turns,inc('Pode seguir')],{maxQuestions:20})
  assert.doesNotMatch(d.reply,/doença grave|preexistente/i)
  if(!d.reply.includes('?'))break
  turns.push(out(d.reply),inc('Não sei'))
 }
})
test('SDR: máximo de sete perguntas, depois oferece consultor sem abrir lead antes do aceite',()=>{
 const qs=approvedQuestionsFor('previdencia',{hasPlan:false}).slice(0,7)
 const msgs=[...base('Quero contratar Previdência privada, não tenho previdência atualmente.'),...qs.flatMap(q=>[out(q.text),inc('Resposta fictícia')])]
 const d=nextMuriloSdrDecision(msgs)
 assert.match(d.reply,/Posso encaminhar/i)
 assert.equal(d.humanHandoff,false)
 assert.equal(d.handoff,null)
})
test('SDR: dois produtos não causam qualificação inventada',()=>{
 const msgs=base('Quero cotar plano de Saúde e seguro de Vida.')
 assert.equal(detectSdrQuoteProduct(msgs),null)
 const d=nextMuriloSdrDecision([...msgs,inc('Para a família')])
 assert.match(d.reply,/qual tipo de seguro você deseja cotar/i)
})
test('SDR: o novo mecanismo é opt-in, mantendo Clara e fluxos antigos quando desativado',async()=>{
 const old=process.env.PHX_MURILO_CLOSED_QUESTIONS
 delete process.env.PHX_MURILO_CLOSED_QUESTIONS
 try{
  // The protected production path remains under the existing response branch;
  // no qualification hook runs without the opt-in environment flag.
  const fs=await import('node:fs')
  const src=fs.readFileSync(new URL('../api/v1/conversations/respond.js',import.meta.url),'utf8')
  assert.match(src,/process\.env\.PHX_MURILO_CLOSED_QUESTIONS==='true'/)
  assert.match(src,/if\(process\.env\.PHX_MURILO_CLOSED_QUESTIONS==='true'&&agent==='murilo'\)/)
 }finally{
  if(old===undefined)delete process.env.PHX_MURILO_CLOSED_QUESTIONS
  else process.env.PHX_MURILO_CLOSED_QUESTIONS=old
 }
})
test('SDR: API em laboratório retorna pergunta aprovada sem chamar a OpenAI',async()=>{
 const old=process.env.PHX_MURILO_CLOSED_QUESTIONS
 process.env.PHX_MURILO_CLOSED_QUESTIONS='true'
 const oldFetch=globalThis.fetch
 globalThis.fetch=async()=>{throw Error('unexpected_external_call')}
 try{
  const messages=[
   inc('Quero cotar seguro Auto. Pode me chamar de Cliente Teste.'),
   out('Sou a Clara, concierge de atendimento Phoenix. Posso passar ao Murilo?'),
   inc('Sim'),
   out('Sou o Murilo, do time comercial da Phoenix Insurance. Vamos começar a cotação?'),
   inc('Quero analisar um seguro novo para meu carro.')
  ]
  const body={
   conversation_id:'11111111-1111-4111-8111-111111111111',
   protocolo:'20990101-9876',mode:'sugestao',contact:{kind:'lead'},
   agent_hint:'murilo',messages
  }
  const res={statusCode:200,setHeader(){},status(v){this.statusCode=v;return this},json(v){this.data=v;return v}}
  await respondValidated(body,res,{mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}})
  assert.equal(res.statusCode,200)
  assert.equal(res.data.agent,'murilo')
  assert.equal(res.data.humanHandoff,false)
  assert.ok(approvedQuestionsFor('auto',{renewal:false}).some(q=>res.data.reply.includes(q.text)),res.data.reply)
 }finally{
  globalThis.fetch=oldFetch
  if(old===undefined)delete process.env.PHX_MURILO_CLOSED_QUESTIONS
  else process.env.PHX_MURILO_CLOSED_QUESTIONS=old
 }
})


test('SDR: API aceita fotografia confirmada sem texto e prossegue sem OCR ou OpenAI',async()=>{
 const old=process.env.PHX_MURILO_CLOSED_QUESTIONS
 process.env.PHX_MURILO_CLOSED_QUESTIONS='true'
 const oldFetch=globalThis.fetch
 globalThis.fetch=async()=>{throw Error('photo_must_not_be_fetched_or_read')}
 try{
  const messages=[
   inc('Quero cotar renovação de seguro Auto. Me chamo Marina de Teste.'),
   out('Sou o Murilo, do time comercial da Phoenix Insurance.'),
   out('Pode me encaminhar a apólice atual, por favor?'),
   inc('',{media_received:true,media_kind:'image'})
  ]
  const body={
   conversation_id:'11111111-1111-4111-8111-111111111111',
   protocolo:'20990101-9877',mode:'sugestao',contact:{kind:'lead'},
   agent_hint:'murilo',messages
  }
  const res={statusCode:200,setHeader(){},status(v){this.statusCode=v;return this},json(v){this.data=v;return v}}
  await respondValidated(body,res,{mode:'clara_murilo',revision:7,intro:{blocked:false,clara_apresentada:true,murilo_apresentado:true}})
  assert.equal(res.statusCode,200)
  assert.equal(res.data.agent,'murilo')
  assert.equal(res.data.humanHandoff,false)
  assert.match(res.data.reply,/Recebi o anexo indicado pelo sistema/)
  assert.doesNotMatch(res.data.reply,/analisei a imagem|identifiquei a placa|seguradora é/i)
 }finally{
  globalThis.fetch=oldFetch
  if(old===undefined)delete process.env.PHX_MURILO_CLOSED_QUESTIONS
  else process.env.PHX_MURILO_CLOSED_QUESTIONS=old
 }
})


test('SDR: novo lead de Benefícios segue a fila Benefícios após aceite',()=>{
 const known=approvedQuestionsFor('previdencia').slice(0,7)
 const history=[...base('Quero contratar Previdência privada'),...known.map(q=>out(q.text)),inc('Já informei o que sabia')]
 const offer=nextMuriloSdrDecision(history)
 assert.match(offer.reply,/equipe de Benefícios da Phoenix/)
 assert.equal(offer.humanHandoff,false)
 const yes=confirmedOfferHandoff([...history,out(offer.reply),inc('Sim')],'murilo')
 assert.ok(yes)
 assert.equal(yes.humanHandoff,true)
 assert.equal(yes.handoff.department,'beneficios')
})
test('SDR: cotação de Auto autorizada vai a Patrimônio sem fila fictícia',()=>{
 const q=approvedQuestionsFor('auto',{renewal:false})
 const history=[...base('Quero cotar Seguro Auto, é seguro novo.'),...q.slice(0,7).map(q=>out(q.text)),inc('Não tenho mais informações')]
 const offer=nextMuriloSdrDecision(history)
 assert.match(offer.reply,/Auto\/RE/)
 assert.equal(offer.humanHandoff,false)
 const yes=confirmedOfferHandoff([...history,out(offer.reply),inc('Sim')],'murilo')
 assert.equal(yes?.handoff?.department,'patrimonio')
})
test('SDR: recusa de encaminhamento não reabre a oferta nem gera lead',()=>{
 const hist=[...base('Quero cotar Seguro Auto'),out('Posso encaminhar sua solicitação à equipe de Auto/RE?'),inc('Não, obrigado')]
 const decision=nextMuriloSdrDecision(hist)
 assert.equal(decision.humanHandoff,false)
 assert.equal(decision.handoff,null)
 assert.doesNotMatch(decision.reply,/\?/)
 assert.doesNotMatch(decision.reply,/posso encaminhar/i)
})
