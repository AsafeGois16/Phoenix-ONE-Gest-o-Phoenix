import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sanitizeV41Risk,summarizeV41VerifiedQuote,replyV41VerifiedQuote} from '../server/v4-universal-risk.js'
import {v4VerifiedSummary} from '../server/v4-verified-context.js'
import {juniorIdentityContext} from '../server/junior-v1.js'

/**
 * These cases reproduce the ACTUAL KEYS (not mock names) from Junior's
 * uploaded exemplos-resumo-verificado.json and contrato-fase2.openapi.yaml:
 * fleet.quantidade/itens/item, property.atividade, benefits.vidas/plano,
 * insured_person.faixa_etaria. All personal data here is fictitious.
 */
const originalRef='3f9c0a7e1b2d4c5e6f708192a3b4c5d6e7f8091a2b3c4d5e'
const scope=['profile.basic','policies.read','risk.auto.read','risk.frota.read',
 'risk.residencial.read','risk.vida.read','risk.saude.read','profile.age_band','profile.location']
const simulatedTime=new Date().toISOString()
const future=new Date(Date.now()+30*60*1000).toISOString()
const raw={status:'verified',verified_at:simulatedTime,expires_at:future,
 verification_ref:originalRef,verified_profile:{nome_tratamento:'Marina',tipo_pessoa:'PF',
 relacao_com_contrato:'titular'},field_scopes:scope}
const risk=(c,r,sc=scope,pu='service')=>sanitizeV41Risk({product_code:c,risk_summary:r},sc,pu)
const vehicle={marca:'Marca Exemplo',modelo:'Modelo Exemplo',versao:'1.0 Flex 4p',
 zero_km:false,ano_modelo:2022,ano_fabricacao:2021}
const fleet={quantidade:2,itens:[
 {item:1,item_ref:'item-ref-exemplo-1',ano_modelo:2019,marca_modelo:'Utilitário Exemplo A'},
 {item:2,item_ref:'item-ref-exemplo-2',ano_modelo:2020,marca_modelo:'Utilitário Exemplo B'}]}
const panel=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('YAML-derived vehicle shape retains all documented non-sensitive fields',()=>{
 const r=risk('auto',{vehicle})
 assert.equal(r.vehicle.marca,'Marca Exemplo')
 assert.equal(r.vehicle.modelo,'Modelo Exemplo')
 assert.equal(r.vehicle.versao,'1.0 Flex 4p')
 assert.equal(r.vehicle.ano_modelo,2022)
 assert.equal(r.vehicle.ano_fabricacao,2021)
 assert.equal(r.vehicle.zero_km,false)
})
test('JSON original: fleet {quantidade,itens:[{item,item_ref,marca_modelo,ano_modelo}]}',()=>{
 const r=risk('frota',{fleet})
 assert.equal(r.fleet.quantidade_itens_ativos,2)
 assert.equal(r.fleet.items.length,2)
 assert.equal(r.fleet.items[0].numero_item,1)
 assert.equal(r.fleet.items[1].marca_modelo,'Utilitário Exemplo B')
 assert.equal(r.fleet.items[0].item_ref,'item-ref-exemplo-1')
 assert.match(replyV41VerifiedQuote(summarizeV41VerifiedQuote([{product_code:'frota',risk_summary:r}],'frota')),/Qual dos veículos/)
})
test('JSON original: property {tipo_ocupacao,cidade_uf,cep_prefixo} only with quote and location scope',()=>{
 const raw={property:{tipo_ocupacao:'residencial',cidade_uf:'Guarulhos/SP',cep_prefixo:'07020'}}
 const q=risk('residencial',raw,scope,'quote')
 assert.equal(q.property.tipo_ocupacao,'residencial')
 assert.equal(q.property.cidade_uf,'Guarulhos/SP')
 assert.equal(q.property.cep_prefixo,'07020')
 assert.equal(risk('residencial',raw,scope,'service').property.cidade_uf,undefined)
 assert.equal(risk('residencial',raw,scope.filter(s=>s!=='profile.location'),'quote').property.cidade_uf,undefined)
})
test('YAML original: property activity key is atividade, not atividade_risco',()=>{
 const r=risk('residencial',{property:{tipo_ocupacao:'comercial',atividade:'Loja'}})
 assert.equal(r.property.atividade_risco,'Loja')
})
test('JSON original: insured_person faixa_etaria 39-43 only for authorized quote',()=>{
 const r={insured_person:{faixa_etaria:'39-43',capital_segurado:200000,profissao:'Dado não cadastrado',
 beneficiarios:[{nome:'NÃO MOSTRAR'}],nascimento:'1990-01-01'}}
 const q=risk('vida',r,scope,'quote')
 assert.equal(q.insured_person.faixa_etaria,'39-43')
 assert.equal(q.insured_person.capital_segurado,200000)
 assert.doesNotMatch(JSON.stringify(q),/profissao|NÃO MOSTRAR|1990-01-01/)
 assert.equal(risk('vida',r,scope,'service').insured_person.faixa_etaria,undefined)
 assert.equal(risk('vida',r,scope.filter(s=>s!=='profile.age_band'),'quote').insured_person.faixa_etaria,undefined)
 const reply=replyV41VerifiedQuote(summarizeV41VerifiedQuote([{product_code:'vida',risk_summary:q}],'vida'))
 assert.match(reply,/39-43/)
 assert.doesNotMatch(reply,/nascimento|1990/)
})
test('JSON original: company health benefits {vidas:3,operadora} stays aggregated',()=>{
 const r=risk('saude',{benefits:{vidas:3,operadora:'Seguradora Exemplo',plano:'Plano Referência',
 diagnósticos:[{cid:'XYZ'}],dependentes:[{nome:'Pessoa'}]}},scope,'service')
 assert.equal(r.benefits.quantidade_vidas,3)
 assert.equal(r.benefits.plano_titular,'Plano Referência')
 assert.equal(r.benefits.operadora,'Seguradora Exemplo')
 assert.doesNotMatch(JSON.stringify(r),/diagnósticos|Pessoa|XYZ/)
})
test('verification_expired cannot be treated as verified',()=>{
 assert.equal(v4VerifiedSummary({status:'verification_expired',verification:{method:'document_required'}},'service'),null)
 assert.equal(v4VerifiedSummary(raw,'service').verified_profile.nome_tratamento,'Marina')
})
test('Node bridge limits quote Auto to Auto plus permitted Frota and never includes Vida',async()=>{
 const original=globalThis.fetch
 const names=['PHOENIX_ONE_V4_VERIFIED_CONTEXT','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const old=Object.fromEntries(names.map(n=>[n,process.env[n]]))
 process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT='true'
 process.env.VITE_SUPABASE_URL='https://fake.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fictional-token'
 try{
  globalThis.fetch=async()=>({ok:true,status:200,async json(){return {...raw,policies:[
    {product_code:'auto',ramo:'Automóvel',risk_summary:{vehicle}},
    {product_code:'frota',ramo:'Automóvel',risk_summary:{fleet}},
    {product_code:'vida',ramo:'Vida',risk_summary:{insured_person:{capital_segurado:100000}}}
   ]}}})
  const r=await juniorIdentityContext('11111111-2222-4333-8444-555555555555','20261030-9911',null,null,undefined,
   {v4:true,verificationRef:originalRef,purpose:'quote',productCode:'auto'})
  assert.equal(r.status,'verified')
  assert.deepEqual(r.policies.map(p=>p.product_code),['auto','frota'])
  assert.equal(r.policies[1].risk_summary.fleet.items[0].numero_item,1)
 }finally{
  globalThis.fetch=original
  for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}
 }
})
test('Node bridge does not return Frota when risk.frota.read is not granted',async()=>{
 const original=globalThis.fetch
 const names=['PHOENIX_ONE_V4_VERIFIED_CONTEXT','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const old=Object.fromEntries(names.map(n=>[n,process.env[n]]))
 process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT='true'
 process.env.VITE_SUPABASE_URL='https://fake.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fictional-token'
 try{
  globalThis.fetch=async()=>({ok:true,status:200,async json(){return {...raw,
   field_scopes:scope.filter(s=>s!=='risk.frota.read'),
   policies:[{product_code:'auto',ramo:'Automóvel',risk_summary:{vehicle}},
    {product_code:'frota',ramo:'Automóvel',risk_summary:{fleet}}]
  }}})
  const r=await juniorIdentityContext('11111111-2222-4333-8444-555555555555','20261030-9911',null,null,undefined,
   {v4:true,verificationRef:originalRef,purpose:'quote',productCode:'auto'})
  assert.deepEqual(r.policies.map(p=>p.product_code),['auto'])
 }finally{
  globalThis.fetch=original
  for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}
 }
})
test('Edge mapping reads original names and requires V4 feature gates',()=>{
 const src=panel('supabase/functions/phoenix-one-bridge/index.ts')
 for(const term of ["raw.itens","raw.quantidade??","item?.item??","raw.vidas??","raw.plano??",
    "raw.atividade??","raw.faixa_etaria","scopes.includes('profile.age_band')","scopes.includes('risk.frota.read')"])
  assert.ok(src.includes(term),term)
 assert.ok(src.includes("Deno.env.get('PHOENIX_ONE_V4_VERIFIED_CONTEXT')==='true'"))
 assert.ok(src.includes("const limitedPolicies=v4&&purpose==='quote'"))
})
