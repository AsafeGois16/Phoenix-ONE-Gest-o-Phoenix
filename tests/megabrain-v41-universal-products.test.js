import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sanitizeV41Risk,V41_RISK_SCOPES,V41_POLICY_ONLY,detectV41QuoteProduct,summarizeV41VerifiedQuote,replyV41VerifiedQuote} from '../server/v4-universal-risk.js'
import {juniorIdentityContext} from '../server/junior-v1.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const mk=(product_code,risk_summary)=>({product_code,risk_summary})
const scope=(name)=>[name,'policies.read']
const inc=text=>({direction:'inbound',author:'contact',text})
const demoRef='b'.repeat(48)
const date=new Date(Date.now()+20*60*1000).toISOString()
const baseline={status:'verified',verified_at:new Date(Date.now()-1000).toISOString(),
 expires_at:date,verification_ref:demoRef,field_scopes:['profile.basic','policies.read'],
 verified_profile:{nome_tratamento:'Marina',relacao_com_contrato:'titular',tipo_pessoa:'pf'},installments:[]}
const v=(code,risk,scopes)=>sanitizeV41Risk(mk(code,risk),scopes,'quote')

test('universal registry covers documented risk scopes; unsupported products remain policy-only',()=>{
 assert.equal(V41_RISK_SCOPES.frota.scope,'risk.frota.read')
 assert.equal(V41_RISK_SCOPES.residencial.scope,'risk.residencial.read')
 assert.equal(V41_RISK_SCOPES.vida.scope,'risk.vida.read')
 assert.equal(V41_RISK_SCOPES.saude.scope,'risk.saude.read')
 assert.ok(V41_POLICY_ONLY.includes('previdencia'))
 assert.ok(V41_POLICY_ONLY.includes('empresarial'))
 assert.equal(sanitizeV41Risk(mk('viagem',{property:{endereco:'Rua Qualquer, 100'}}),['policies.read'],'quote'),null)
})
test('vehicle fields are allowlisted, without plate, driver, VIN or document',()=>{
 const result=v('auto',{vehicle:{marca:'Toyota',modelo:'Corolla',ano_modelo:2022,placa:'ABC1234',chassi:'SECRET',cpf:'12345678901'}},scope('risk.auto.read'))
 assert.equal(result.vehicle.modelo,'Corolla')
 assert.doesNotMatch(JSON.stringify(result),/ABC1234|SECRET|12345678901/)
 assert.equal(v('auto',{vehicle:{marca:'Toyota'}},['risk.frota.read']),null)
 assert.ok(v('moto',{vehicle:{marca:'Honda'}},scope('risk.auto.read')))
})
test('fleet holds at most 50 logical items and never automatically selects one',()=>{
 const raw={fleet:{
  quantidade_itens_ativos:55,
  items:Array.from({length:55},(_,i)=>({item_ref:'item_'+(i+1),numero_item:i+1,marca_modelo:'Modelo X',ano_modelo:2021,placa:'ABC1234',chassi:'SECRET'}))
 }}
 const result=v('frota',raw,scope('risk.frota.read'))
 assert.equal(result.fleet.items.length,50)
 assert.equal(result.fleet.quantidade_itens_ativos,55)
 assert.doesNotMatch(JSON.stringify(result),/ABC1234|SECRET/)
 assert.match(replyV41VerifiedQuote(summarizeV41VerifiedQuote([mk('frota',result)],'frota')),/Qual dos veículos/)
 assert.equal(v('frota',raw,['risk.auto.read']),null)
})
test('property location is released only for quote/assistance with profile.location',()=>{
 const raw={property:{tipo_ocupacao:'Residencial',atividade_risco:'Moradia',cidade_uf:'Guarulhos/SP',cep_prefixo:'07112',
 endereco:'Rua Fictícia 200',numero:200}}
 const quote=sanitizeV41Risk(mk('residencial',raw),['risk.residencial.read','profile.location'],'quote')
 assert.equal(quote.property.cidade_uf,'Guarulhos/SP')
 assert.equal(quote.property.cep_prefixo,'07112')
 assert.doesNotMatch(JSON.stringify(quote),/Rua Fictícia|numero/)
 const service=sanitizeV41Risk(mk('residencial',raw),['risk.residencial.read','profile.location'],'service')
 assert.equal(service.property.cidade_uf,undefined)
 assert.equal(service.property.cep_prefixo,undefined)
 const noScope=sanitizeV41Risk(mk('residencial',raw),['risk.residencial.read'],'quote')
 assert.equal(noScope.property.cidade_uf,undefined)
 assert.equal(v('residencial',raw,['policies.read']),null)
})
test('Life/AP releases capital only, not profession, beneficiary, birth date',()=>{
 const raw={insured_person:{capital_segurado:250000,profissao:'Enfermeiro',beneficiario:'Pessoa Y',data_nascimento:'1990-01-01'}}
 const output=v('vida',raw,scope('risk.vida.read'))
 assert.deepEqual(output,{insured_person:{capital_segurado:250000}})
 assert.ok(v('ap',raw,scope('risk.vida.read')))
 assert.equal(v('vida',raw,['risk.saude.read']),null)
})
test('Health/Odonto releases aggregated plan fields only, never patient health or dependents',()=>{
 const raw={benefits:{operadora:'Operadora Teste',modalidade:'Empresarial',
 mes_reajuste:8,quantidade_vidas:20,plano_titular:'Plano A',
 diagnostico:'Dado sensível',cid:'CID',dependentes:[{nome:'Pessoa'}],
 coparticipacao:40,acomodacao:'Apartamento'}}
 const output=v('saude',raw,scope('risk.saude.read'))
 assert.deepEqual(output,{benefits:{operadora:'Operadora Teste',modalidade:'Empresarial',
 mes_reajuste:8,quantidade_vidas:20,plano_titular:'Plano A'}})
 assert.ok(v('odonto',raw,scope('risk.saude.read')))
 assert.equal(v('saude',raw,['risk.vida.read']),null)
})
test('no inferred profession, construction type, copay, detailed pension balance',()=>{
 const result=v('residencial',{property:{tipo_ocupacao:'Comercial',tipo_construcao:'Alvenaria'}},scope('risk.residencial.read'))
 assert.equal(result.property.tipo_construcao,undefined)
 assert.equal(v('previdencia',{pension:{saldo:1000000,modalidade:'VGBL'}},scope('risk.vida.read')),null)
})
test('quotation product detection respects explicit quote messages, ignoring generic conversation',()=>{
 assert.equal(detectV41QuoteProduct([inc('Gostaria de cotar meu seguro residencial'),inc('Sim')]),'residencial')
 assert.equal(detectV41QuoteProduct([inc('Quero fazer uma cotação de seguro de vida')]),'vida')
 assert.equal(detectV41QuoteProduct([inc('Gostaria de fazer cotação de saúde empresarial')]),'saude')
 assert.equal(detectV41QuoteProduct([inc('Tenho direito a guincho?')]),null)
 assert.equal(detectV41QuoteProduct([inc('Quero cotação do meu carro'),inc('Quero cotação de vida')]),'vida')
})
test('multiple policies are ambiguous regardless of same product',()=>{
 const s=summarizeV41VerifiedQuote([mk('vida',{insured_person:{capital_segurado:50000}}),mk('vida',{insured_person:{capital_segurado:250000}})],'vida')
 assert.equal(s.status,'multiple')
 assert.match(replyV41VerifiedQuote(s),/qual contrato/)
})
test('unknown/missing fields trigger question and never a fabricated coverage or age',()=>{
 const s=summarizeV41VerifiedQuote([mk('vida',null)],'vida')
 assert.equal(s.status,'found')
 assert.match(replyV41VerifiedQuote(s),/não trouxe todos os detalhes/)
 assert.doesNotMatch(replyV41VerifiedQuote(s),/50\.000|profiss|tem cobertura/)
})
test('V4 Junior client sanitizes categories as second validation gate',async()=>{
 const names=['PHOENIX_ONE_V4_VERIFIED_CONTEXT','VITE_SUPABASE_URL','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN']
 const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]))
 const original=globalThis.fetch
 process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT='true'
 process.env.VITE_SUPABASE_URL='https://fake.supabase.co'
 process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN='fake-service-only'
 try{
  globalThis.fetch=async()=>({ok:true,status:200,async json(){return {...baseline,
   field_scopes:[...baseline.field_scopes,'risk.vida.read'],
   policies:[{product_code:'vida',ramo:'Vida',
    risk_summary:{insured_person:{capital_segurado:100000,profissao:'Não enviar'}}},
   {product_code:'residencial',ramo:'Residencial',
    risk_summary:{property:{tipo_ocupacao:'Residencial',endereco:'Rua X 999'}}}]
  }}})
  const result=await juniorIdentityContext('8a34238c-fa0e-4420-bb7c-dbb2856d6c1b','20261103-0007',null,null,undefined,
   {v4:true,verificationRef:demoRef,purpose:'service'})
  assert.equal(result.status,'verified')
  assert.deepEqual(result.policies[0].risk_summary,{insured_person:{capital_segurado:100000}})
  assert.equal(result.policies[1].risk_summary,null)
  assert.doesNotMatch(JSON.stringify(result.policies),/profissao|Rua X/)
 }finally{globalThis.fetch=original;for(const [n,v] of Object.entries(previous)){if(v===undefined)delete process.env[n];else process.env[n]=v}}
})
test('Bridge only releases risk scoped to product and V4 remains default-off',()=>{
 const edge=read('supabase/functions/phoenix-one-bridge/index.ts')
 assert.ok(edge.includes("scopes.includes(rule[0])"))
 assert.ok(edge.includes("risk_summary:safeRisk(p)"))
 assert.ok(edge.includes("risk.frota.read"))
 assert.ok(edge.includes("risk.residencial.read"))
 assert.ok(edge.includes("risk.vida.read"))
 assert.ok(edge.includes("risk.saude.read"))
 assert.ok(edge.includes("Deno.env.get('PHOENIX_ONE_V4_VERIFIED_CONTEXT')==='true'"))
 const route=read('api/v1/conversations/respond.js')
 assert.ok(route.includes("requestedV41Product"))
 assert.ok(route.includes("verifiedProduct.status==='verified'"))
 assert.ok(route.includes("purpose:'quote',productCode:requestedV41Product"))
})

test('profile age and city are released only for authorized purpose and product',async()=>{
 const {parseVerifiedProfile}=await import('../server/v4-verified-context.js')
 const raw={nome_tratamento:'Marina',tipo_pessoa:'pf',relacao_com_contrato:'titular',
  cidade_uf:'Guarulhos/SP',faixa_etaria:'30-39',data_nascimento:'1987-01-02',cpf:'11122233344'}
 const scopes=['profile.basic','profile.location','profile.age_band']
 const quote=parseVerifiedProfile(raw,scopes,'quote','vida')
 assert.equal(quote.faixa_etaria,'30-39')
 assert.equal(quote.cidade_uf,'Guarulhos/SP')
 assert.doesNotMatch(JSON.stringify(quote),/1987-01-02|11122233344/)
 const service=parseVerifiedProfile(raw,scopes,'service','vida')
 assert.equal(service.faixa_etaria,undefined)
 assert.equal(service.cidade_uf,undefined)
 const home=parseVerifiedProfile(raw,scopes,'quote','residencial')
 assert.equal(home.faixa_etaria,undefined)
 assert.equal(home.cidade_uf,'Guarulhos/SP')
 const unauthorized=parseVerifiedProfile(raw,['profile.basic'],'quote','vida')
 assert.equal(unauthorized.faixa_etaria,undefined)
 assert.equal(unauthorized.cidade_uf,undefined)
 const personMessage=replyV41VerifiedQuote(
   summarizeV41VerifiedQuote([mk('vida',{insured_person:{capital_segurado:100000}})],'vida'),quote)
 assert.match(personMessage,/faixa etária autorizada é 30-39/)
 assert.doesNotMatch(personMessage,/1987|idade exata/)
})
