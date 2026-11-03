import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {UNIVERSAL_SCENARIOS,UNIVERSAL_GROUPS,runUniversalScenario,runUniversalSuite,qaReportText} from '../server/megabrain-universal-qa.js'
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('Laboratório Universal executa todos os casos sem falhas determinísticas',()=>{
 const report=runUniversalSuite()
 assert.ok(report.scenarioCount>=15,'pelo menos 15 cenários seguros')
 assert.ok(report.total>=45,'cobrir verificações por cenário')
 assert.equal(report.passed,report.total,
  report.scenarios.filter(s=>!s.ok).map(s=>s.id+': '+s.checks.filter(c=>!c.pass).map(c=>c.name)).join('; '))
 assert.equal(report.failed,0)
 assert.equal(report.score,100)
 assert.equal(report.approved,true)
 assert.equal(report.networkCalls,0)
 assert.equal(report.simulation,true)
})
test('Cobre Auto, Frota, Saúde, Odonto, Vida, Residencial e produtos com dados limitados',()=>{
 const names=new Set(UNIVERSAL_SCENARIOS.map(s=>s.product))
 for(const x of ['Auto','Frota','Vida','Residencial','Saúde','Odonto','Empresarial'])assert.ok(names.has(x),x)
 for(const x of ['Segurança','Consentimento','Continuidade','Contexto verificado'])assert.ok(UNIVERSAL_GROUPS.includes(x),x)
})
test('Cada cenário informa objetivo, conversa e verificações rastreáveis',()=>{
 for(const scene of UNIVERSAL_SCENARIOS){
  assert.ok(scene.id&&scene.title&&scene.objective&&scene.product)
  assert.ok(scene.dialogue.length>=2)
  assert.ok(scene.dialogue.every(x=>Array.isArray(x)&&x.length===2))
  const result=runUniversalScenario(scene.id)
  assert.equal(result.id,scene.id)
  assert.ok(result.total>=3,'mínimo três verificações por cenário: '+scene.id)
  assert.ok(result.checks.every(c=>c.name&&typeof c.pass==='boolean'))
 }
})
test('Proteção contra variação de protocolo, ausência de consentimento e dados sensíveis tem cenário próprio',()=>{
 const ids=new Set(UNIVERSAL_SCENARIOS.map(s=>s.id))
 for(const id of ['no-proof','expired-ref','handoff-request','handoff-accepted','handoff-refused',
  'human-handoff-consent','human-handoff-no','one-introduction','change-product','profile-scope'])assert.ok(ids.has(id),id)
})
test('Relatório TXT não inclui informações reais nem implica homologação com Junior',()=>{
 const report=runUniversalSuite(['auto-verified','human-handoff-consent','expired-ref'])
 const contents=qaReportText(report)
 assert.equal(report.scenarioCount,3)
 assert.match(contents,/MODO|Modo: LOCAL/i)
 assert.match(contents,/APROVADO/)
 assert.match(contents,/homologação com o Junior/i)
 assert.doesNotMatch(contents,/verification_ref|cpf:|chassi:|12345678901/)
})
test('UI reutiliza o MegaBrain existente e não chama APIs, nem persiste resultados',()=>{
 const child=file('src/MegaBrainSandbox.jsx')
 const ui=file('src/MegaBrainUniversalLab.jsx')
 assert.ok(child.includes("mode==='universal'&&<MegaBrainUniversalLab/>"))
 assert.ok(child.includes("mode==='classifier'&&<>"))
 assert.ok(ui.includes('runUniversalSuite()'))
 assert.ok(ui.includes('runUniversalScenario(item.id)'))
 assert.ok(ui.includes('qaReportText(data)'))
 assert.ok(ui.includes('Baixar relatório TXT'))
 for(const source of [file('server/megabrain-universal-qa.js'),ui]){
  assert.doesNotMatch(source,/fetch\s*\(/)
  assert.doesNotMatch(source,/localStorage|sessionStorage|supabase\.from\s*\(/)
 }
})
test('Cenário desconhecido não produz um falso sucesso',()=>{
 assert.throws(()=>runUniversalScenario('not-a-real-case'),/não encontrado/i)
})
