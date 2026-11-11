import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validAgent as validJuniorAgent} from '../server/junior-v1.js'

const file=async path=>readFile(new URL(path,import.meta.url),'utf8')

test('Grazy Copy V1 tem prompt separado, completo e uso interno',async()=>{
 const p=await file('../prompts/grazy-copy-v1.md')
 for(const phrase of ['GRAZY COPY — INTELIGÊNCIA DE COMUNICAÇÃO','PROMPT MESTRE V1.0','Português do Brasil impecável','Mensagem 1 — Consultiva','Mensagem 2 — Direta','Mensagem 3 — Relacionamento','consentimento prévio','franquia','NÃO escreva variações destinadas a disfarçar mensagens em massa']){
   assert.ok(p.includes(phrase),phrase)
 }
 assert.ok(p.length>5000)
})
test('Grazy Copy habilitado no laboratório e no painel, não no Junior',async()=>{
 const api=await file('../api/phoenix-answer.js')
 const core=await file('../supabase/functions/phoenix-one-core/index.ts')
 const ops=await file('../src/Operations.jsx')
 assert.ok(api.includes("'clara','murilo','grazy_copy'"))
 assert.ok(api.includes("agent==='grazy_copy'?{matches:[]}"))
 assert.ok(api.includes("authenticated_editorial_lab"))
 assert.ok(core.includes("'clara','murilo','grazy_copy'"))
 assert.ok(ops.includes("grazy_copy:{name:'Grazy Copy'"))
 assert.ok(ops.includes("selected===key"))
 assert.ok(ops.includes("Sem integração com disparos ou WhatsApp"))
 assert.equal(validJuniorAgent('grazy_copy'),false)
 assert.equal(validJuniorAgent('clara'),true)
 assert.equal(validJuniorAgent('murilo'),true)
})
test('Grazy Copy não recupera automaticamente RAG de Clara ou Murilo',async()=>{
 const code=await file('../api/phoenix-answer.js')
 assert.ok(code.includes("agent==='grazy_copy'?{matches:[]}:await core"))
 assert.ok(code.includes('guardClaraLabAnswer'))
 assert.ok(code.includes('ensureMuriloIntro'))
 const junior=await file('../server/junior-v1.js')
 assert.ok(junior.includes("a==='clara'||a==='murilo'"))
})
test('Migração é exclusiva do novo agente',async()=>{
 const sql=await file('../supabase/migrations/20261111_grazy_copy_agent_v1.sql')
 assert.ok(sql.includes('ADD CONSTRAINT agents_id_check'))
 assert.ok(sql.includes('grazy_copy'))
 assert.ok(sql.includes('INSERT INTO phoenix_one.agents'))
 assert.ok(sql.includes('INSERT INTO phoenix_one.agent_versions'))
 assert.ok(!sql.includes('UPDATE phoenix_one.agent_versions SET active=false'))
 assert.ok(!sql.includes('UPDATE phoenix_one.agents SET'))
})
