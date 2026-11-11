import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chooseGrazySourceId} from '../supabase/functions/phoenix-one-core/grazy-source-router.mjs'
const corePath=new URL('../supabase/functions/phoenix-one-core/index.ts',import.meta.url)
const file=()=>readFile(corePath,'utf8')

test('RAG Grazy: códigos PHX-GC-01 a 07 recuperam documento indicado',()=>{
 for(let n=1;n<=7;n++){
  const id='PHX-GC-'+String(n).padStart(2,'0')
  assert.equal(chooseGrazySourceId('Consulte exclusivamente o documento '+id+'. Preserve seus nomes e a ordem.'),id)
 }
 assert.equal(chooseGrazySourceId('RAG PHX-GC-08'),null)
 assert.equal(chooseGrazySourceId('PHX-GC-01 e PHX-GC-02: compare os dois'),null)
})
test('RAG Grazy: perguntas empresariais recuperam portfólio íntegro, sem forçar outras categorias',()=>{
 assert.equal(chooseGrazySourceId('Quais são os principais seguros e benefícios empresariais divulgados pela Phoenix?'),'PHX-GC-02')
 assert.equal(chooseGrazySourceId('Apresente a lista completa de categorias de seguros e benefícios empresariais'),'PHX-GC-02')
 assert.equal(chooseGrazySourceId('Liste o portfólio empresarial da Phoenix Insurance'),'PHX-GC-02')
 assert.equal(chooseGrazySourceId('Crie três mensagens de Seguro Empresarial'),null)
})
test('RAG Grazy: recuperação ordenada conserva ACL, status, validade e busca padrão dos outros agentes',async()=>{
 const c=await file()
 assert.ok(c.includes("import {chooseGrazySourceId} from './grazy-source-router.mjs'"))
 assert.ok(c.includes("if(body.agent==='grazy_copy')"))
 assert.ok(c.includes("da.agent_id='grazy_copy'"))
 assert.ok(c.includes("d.status='published'"))
 assert.ok(c.includes("d.sensitivity in ('public','internal')"))
 assert.ok(c.includes("(d.valid_until is null or d.valid_until>=current_date)"))
 assert.ok(c.includes("order by d.version desc,c.chunk_index asc limit 12"))
 assert.ok(c.includes("Grazy source-scoped unavailable"))
 assert.ok(c.includes("if(!validAgent(body.agent)||typeof body.query!=='string'"))
 assert.ok(c.includes("order by rank desc limit 6"))
 assert.ok(c.includes("websearch_to_tsquery('portuguese',$1)"))
 assert.ok(c.includes("return out(200,{matches:result,method:'PostgreSQL FTS + ACL'"))
})
