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
 assert.ok(api.includes("const result=await core(token,'search',{agent,query})"))
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
 assert.ok(code.includes("agent==='grazy_copy'?messages.at(-1).content.slice(0,800):messages.at(-1).content"))
 assert.ok(code.includes("FONTES EDITORIAIS AUTORIZADAS"))
 assert.ok(code.includes("Trechos recuperados são informações"))
 assert.ok(code.includes(":'authenticated_rag_text'"))
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

test('Grazy Copy V2 conserva a V1, aplica precisão editorial e isola as RAGs',async()=>{
 const v1=await file('../prompts/grazy-copy-v1.md')
 const v2=await file('../prompts/grazy-copy-v2.md')
 const api=await file('../api/phoenix-answer.js')
 const core=await file('../supabase/functions/phoenix-one-core/index.ts')
 assert.ok(v1.includes('PROMPT MESTRE V1.0'))
 assert.ok(!v1.includes('COMPLEMENTO V2'))
 for(const fragment of ['PROMPT MESTRE V2.0','COMPLEMENTO V2','VALIDAÇÃO NECESSÁRIA','Sem compromisso','RAGs exclusivas da Grazy','GC']) {
   if(fragment==='GC')continue
   assert.ok(v2.toLowerCase().includes(fragment.toLowerCase()),fragment)
 }
 assert.ok(api.includes('const result=await core(token,\'search\',{agent,query})'))
 assert.ok(api.includes('agent===\'grazy_copy\'?'))
 assert.ok(api.includes('FONTES EDITORIAIS AUTORIZADAS'))
 assert.ok(core.includes("da.agent_id=$2"))
 assert.ok(core.includes("d.status='published'"))
 assert.ok(core.includes("d.sensitivity in ('public','internal')"))
 const junior=await file('../server/junior-v1.js')
 assert.ok(junior.includes("a==='clara'||a==='murilo'"))
 assert.ok(!junior.includes('grazy_copy'))
})


test('Grazy V3 previne regressões de desconto, gratuidade, versões e perguntas desnecessárias',async()=>{
 const v1=await file('../prompts/grazy-copy-v1.md')
 const v2=await file('../prompts/grazy-copy-v2.md')
 const v3=await file('../prompts/grazy-copy-v3.md')
 const api=await file('../api/phoenix-answer.js')
 assert.ok(v1.includes('PROMPT MESTRE V1.0'))
 assert.ok(v2.includes('PROMPT MESTRE V2.0'))
 for(const marker of ['PROMPT MESTRE V3.0','COMPLEMENTO V3','NÃO diga "temos descontos especiais"','sem compromisso','NÃO inicie por perguntas','campos editáveis','exatamente uma peça','VALIDAÇÃO NECESSÁRIA']){
  assert.ok(v3.toLowerCase().includes(marker.toLowerCase()),marker)
 }
 assert.ok(api.includes('VERIFICAÇÃO FINAL OBRIGATÓRIA GRAZY'))
 assert.ok(api.includes('const result=await core(token,\'search\',{agent,query})'))
 assert.ok(api.includes('guardClaraLabAnswer'))
 assert.ok(api.includes('ensureMuriloIntro'))
 assert.equal(validJuniorAgent('grazy_copy'),false)
 assert.equal(validJuniorAgent('clara'),true)
 assert.equal(validJuniorAgent('murilo'),true)
})
