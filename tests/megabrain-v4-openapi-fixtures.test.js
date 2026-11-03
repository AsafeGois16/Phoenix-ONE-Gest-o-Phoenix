import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseVerifiedProfile,safeV4Timestamp,v4VerifiedSummary,sanitizeV4AutoRisk,validProductCode} from '../server/v4-verified-context.js'
import {summarizeVerifiedAutoForQuote,sameCarQuoteReply} from '../server/auto-quote-continuity.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const date5=value=>value.replace(/\.([0-9]{3})(Z|[+-]\d\d:\d\d)$/,'$&').replace('Z','Z')
const ts=ms=>new Date(ms).toISOString().replace(/\.(\d{3})Z$/,'.$113Z')
const now=Date.now()
const documented='2026-11-03T11:50:04.13873-03:00'
const payload={
 status:'verified',
 verified_at:ts(now-2000),
 expires_at:ts(now+20*60*1000),
 field_scopes:['profile.basic','policies.read','risk.auto.read','risk.frota.read','profile.location','installments.read'],
 verified_profile:{tipo_pessoa:'PF',nome_tratamento:'Maria',perfil_atualizado_em:documented,relacao_com_contrato:'titular'},
 verification_ref:'3f9c0a7e1b2d4c5e6f708192a3b4c5d6e7f8091a2b3c4d5e',
 data_freshness:{
  profile:{source:'cadastro_gestao',updated_at:documented},
  policies:{source:'cadastro_gestao',updated_at:documented}
 }
}
test('Junior PDF page 4 fractional seconds are valid and retain original timestamp',()=>{
 assert.equal(safeV4Timestamp(documented),documented)
 assert.equal(safeV4Timestamp('2026-11-03T11:50:04-03:00'),'2026-11-03T11:50:04-03:00')
 assert.equal(safeV4Timestamp('yesterday'),null)
})
test('Junior PDF actual scope profile.basic permits titular first name but no unsupported profile fields',()=>{
 const p=parseVerifiedProfile(payload.verified_profile,payload.field_scopes,'service')
 assert.equal(p.nome_tratamento,'Maria')
 assert.equal(p.tipo_pessoa,'pf')
 assert.equal(p.perfil_atualizado_em,documented)
 assert.equal(p.relacao_com_contrato,'titular')
 assert.deepEqual(Object.keys(p).sort(),['nome_tratamento','tipo_pessoa','relacao_com_contrato','perfil_atualizado_em'].sort())
 assert.equal(parseVerifiedProfile(payload.verified_profile,['policies.read'],'service'),null)
})
test('Junior data_freshness object is retained as {source, updated_at}, not flattened string',()=>{
 const v=v4VerifiedSummary(payload,'service')
 assert.equal(v.status,'verified')
 assert.equal(v.verified_profile.nome_tratamento,'Maria')
 assert.deepEqual(v.data_freshness,{
  profile:{source:'cadastro_gestao',updated_at:documented},
  policies:{source:'cadastro_gestao',updated_at:documented}
 })
})
test('unknown freshness sources or unexpected keys are omitted',()=>{
 const data={...payload,data_freshness:{
  profile:{source:'cliente_informou',updated_at:documented},
  policies:{source:'cadastro_gestao',updated_at:documented,internal_token:'secret'},
  hidden:{source:'cadastro_gestao',updated_at:documented}
 }}
 assert.deepEqual(v4VerifiedSummary(data,'service').data_freshness,{policies:{source:'cadastro_gestao',updated_at:documented}})
})
test('real Junior risk_summary.vehicle is sufficient for same-car quote without identification fields',()=>{
 const raw={vehicle:{marca:'Marca Exemplo',modelo:'Modelo Exemplo',versao:'1.0 Flex 4p',ano_fabricacao:2021,ano_modelo:2022,zero_km:false,placa:'ABC1D23',chassi:'SECRET'}}
 const safe=sanitizeV4AutoRisk(raw)
 assert.equal(safe.vehicle.modelo,'Modelo Exemplo')
 assert.equal(safe.vehicle.ano_modelo,2022)
 assert.doesNotMatch(JSON.stringify(safe),/ABC1D23|SECRET/)
 const q=summarizeVerifiedAutoForQuote([{ramo:'Automóvel',product_code:'auto',risk_summary:safe}])
 assert.match(sameCarQuoteReply(q),/Marca Exemplo Modelo Exemplo 2022/)
})
test('bridge requires actual risk.auto.read scope for risk_summary and prevents cross-product release',()=>{
 const source=read('supabase/functions/phoenix-one-bridge/index.ts')
 assert.ok(source.includes("scopes.includes('profile.basic')"))
 assert.ok(source.includes("scopes.includes('risk.auto.read')"))
 assert.ok(source.includes("canAutoRisk&&p?.product_code==='auto'"))
 assert.ok(source.includes("(!v4||canAutoRisk)"))
 assert.ok(source.includes("v.source==='cadastro_gestao'"))
 assert.ok(source.includes("verified_at"))
 assert.ok(source.includes("expires_at"))
})
test('product_code outros is recognized by contract adapter',()=>{assert.equal(validProductCode('outros'),true)})
