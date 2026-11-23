import test from 'node:test'
import assert from 'node:assert/strict'
import {JUNIOR_PRODUCT_CODES,JUNIOR_PRODUCT_LINES,juniorProductForLabel,juniorProductFromMessages,enrichClaraHandoff} from '../server/junior-handoff-contract.js'
import {respondValidated} from '../api/v1/conversations/respond.js'
import {operationalRouting,LEGACY_COMMERCIAL_ROUTES} from '../server/orchestration-operational.js'
const incoming=text=>({direction:'inbound',author:'contact',type:'texto',text})
const agent=text=>({direction:'outbound',author:'agent',type:'texto',text})
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}})
const pin=mode=>({mode,revision:4,intro:{blocked:false,clara_apresentada:false,murilo_apresentado:false}})
const body={conversation_id:'11111111-1111-4111-8111-111111111111',protocolo:'20261123-9999',mode:'sugestao',contact:{kind:'lead'},messages:[]}

test('Junior v1.1: 20 specific codes + outro, mapped to agreed two product lines',()=>{
 assert.equal(JUNIOR_PRODUCT_CODES.length,21)
 assert.equal(new Set(JUNIOR_PRODUCT_CODES).size,21)
 assert.equal(JUNIOR_PRODUCT_LINES.viagem,'patrimonio')
 assert.equal(JUNIOR_PRODUCT_LINES.fianca,'patrimonio')
 assert.equal(JUNIOR_PRODUCT_LINES.credito,'patrimonio')
 assert.equal(JUNIOR_PRODUCT_LINES.pet,'beneficios')
 assert.equal(Object.hasOwn(JUNIOR_PRODUCT_LINES,'outro'),false)
})
test('Junior v1.1: explicit variants identified, ambiguous or unknown products omitted',()=>{
 const cases=[
  ['Quero cotar seguro de moto.','auto'],
  ['Quero cotar frota de carros.','frota'],
  ['Quero cotar seguro viagem.','viagem'],
  ['Quero cotar seguro fiança.','fianca'],
  ['Quero cotar seguro de crédito.','credito'],
  ['Quero contratar um plano de saúde empresarial.','saude_empresarial'],
  ['Quero cotar plano odontológico empresarial.','odonto_empresarial'],
  ['Quero cotar seguro de vida em grupo.','vida_grupo'],
  ['Quero cotar seguro pet.','pet']
 ]
 for(const [message,expected] of cases){
  assert.equal(juniorProductFromMessages([incoming(message)]),expected,message)
 }
 assert.equal(juniorProductFromMessages([incoming('Quero cotar seguro de carro e vida.')]),null)
 assert.equal(juniorProductFromMessages([incoming('Quero cotar seguro rural.')]),null)
 assert.equal(juniorProductForLabel('Desconhecido','texto'),null)
})
test('Junior v1.1: operational intent overrides commercial department without guessing product',()=>{
 const original={agent:'clara',reply:'Solicitação recebida',humanHandoff:true,
  handoff:{department:'comercial',reason:'Apoio operacional',summary:'Documento de cobrança'}}
 const out=enrichClaraHandoff(original,[incoming('Preciso da segunda via do boleto')],{claraOnly:true})
 assert.equal(out.handoff.intent,'operacional')
 assert.equal(Object.hasOwn(out.handoff,'product'),false)
 assert.equal(Object.hasOwn(original.handoff,'intent'),false)
 const duo=enrichClaraHandoff(original,[incoming('Quero cotar seguro saúde')],{claraOnly:false})
 assert.deepEqual(duo,original)
 assert.deepEqual(enrichClaraHandoff({...original,humanHandoff:false},[incoming('Quero cotar seguro saúde')],{claraOnly:true}),{...original,humanHandoff:false})
})
test('Junior v1.1: specific normal operations never create quote intent',()=>{
 for(const [department,text] of [
  ['backoffice','Preciso incluir um dependente no plano de saúde'],
  ['beneficios','Não consigo acessar minha carteirinha de saúde'],
  ['patrimonio','Quero abrir um sinistro do meu carro'],
  ['financeiro','Preciso da segunda via do boleto']
 ]){
  const payload={agent:'clara',reply:'Encaminhado',humanHandoff:true,handoff:{department,reason:'Contato operacional',summary:'Apoio'}}
  const result=enrichClaraHandoff(payload,[incoming(text)],{claraOnly:true})
  assert.equal(result.handoff.intent,'operacional',department)
 }
})
test('Junior v1.1: quote consent yields correct optional metadata and queue for all product lines',async()=>{
 const cases=[
  ['Gostaria de cotar um seguro para meu carro.','auto','patrimonio'],
  ['Gostaria de cotar um seguro viagem.','viagem','patrimonio'],
  ['Quero cotar seguro fiança.','fianca','patrimonio'],
  ['Quero cotar seguro de crédito.','credito','patrimonio'],
  ['Quero cotar plano de saúde.','saude','comercial'],
  ['Quero contratar um plano de saúde empresarial.','saude_empresarial','comercial'],
  ['Quero cotar plano odontológico empresarial.','odonto_empresarial','comercial'],
  ['Quero cotar seguro de vida em grupo.','vida_grupo','comercial']
 ]
 for(const [text,product,department] of cases){
  const first=response()
  await respondValidated({...body,messages:[incoming(text)]},first,pin('clara_only'))
  assert.equal(first.code,200,text)
  assert.equal(first.data.humanHandoff,false,text)
  assert.equal(first.data.handoff,null,text)
  const accepted=response()
  await respondValidated({...body,messages:[incoming(text),agent(first.data.reply),incoming('Sim')]},accepted,pin('clara_only'))
  assert.equal(accepted.code,200,text)
  assert.equal(accepted.data.agent,'clara',text)
  assert.equal(accepted.data.strategy,'clara_only',text)
  assert.equal(accepted.data.humanHandoff,true,text)
  assert.equal(accepted.data.handoff?.department,department,text)
  assert.equal(accepted.data.handoff?.intent,'nova_cotacao',text)
  assert.equal(accepted.data.handoff?.product,product,text)
 }
})
test('Junior v1.1: no customer consent means no handoff metadata or lead trigger',async()=>{
 const question=response()
 await respondValidated({...body,messages:[incoming('Quero cotar plano de saúde.')]},question,pin('clara_only'))
 const no=response()
 await respondValidated({...body,messages:[incoming('Quero cotar plano de saúde.'),agent(question.data.reply),incoming('Não')]},no,pin('clara_only'))
 assert.equal(no.code,200)
 assert.equal(no.data.humanHandoff,false)
 assert.equal(no.data.handoff,null)
})
test('Junior v1.1: unknown product does not invent destination or product',()=>{
 const plan=operationalRouting({pin:{mode:'clara_only',revision:4},body:{...body,messages:[incoming('Quero cotar seguro rural')]},verifiedRoutes:LEGACY_COMMERCIAL_ROUTES})
 assert.equal(plan.humanHandoff,false)
 assert.equal(plan.handoff,null)
})
