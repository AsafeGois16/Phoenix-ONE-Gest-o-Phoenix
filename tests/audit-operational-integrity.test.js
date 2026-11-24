import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import health from '../api/health.js'
const source=readFileSync(new URL('../src/Operations.jsx',import.meta.url),'utf8')
const reply=()=>{
 const obj={statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(data){this.body=data;return this}}
 return obj
}
test('health returns liveness only, never hardcoded integration or agent status',()=>{
 const res=reply();health({method:'GET'},res)
 assert.equal(res.statusCode,200)
 assert.equal(res.body.status,'responding')
 assert.equal(res.body.scope,'application_liveness_only')
 assert.equal(res.body.dependencies.supabase,'not_checked')
 assert.equal(res.body.dependencies.junior_management,'not_checked')
 assert.equal(res.body.dependencies.orchestration_bridge,'not_checked')
 assert.equal(Object.hasOwn(res.body,'agents'),false)
 assert.equal(res.headers['Cache-Control'],'no-store')
 const bad=reply();health({method:'POST'},bad);assert.equal(bad.statusCode,405)
})
test('editing a live prompt requires explicit warning and cannot claim sandbox-only publication',()=>{
 assert.match(source,/window\.confirm\('ATENÇÃO: salvar este prompt ativa imediatamente/)
 assert.match(source,/atendimento operacional/)
 assert.match(source,/call\('save_agent'/)
 assert.doesNotMatch(source,/Versão '\+r\.version\+' publicada no banco e disponível para o laboratório\./)
})
test('published knowledge without historic reviewer remains visible but flagged for review',()=>{
 assert.match(source,/status==='published'&&!d\.reviewed_at/)
 assert.match(source,/Revisão sem registro histórico/)
 assert.match(source,/Nenhum conteúdo foi despublicado/)
})
