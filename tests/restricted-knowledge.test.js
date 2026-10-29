import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const core=readFileSync(new URL('../supabase/functions/phoenix-one-core/index.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/Operations.jsx',import.meta.url),'utf8')
test('manual técnico restrito sem vínculo obrigatório a agente',()=>{
 assert.match(core,/body\.sensitivity!=='restricted'&&!audience\.length/)
 assert.match(core,/body\.sensitivity==='restricted'\?\[\]:audience/)
 assert.match(ui,/disabled=\{form\.sensitivity==='restricted'\}/)
})
test('somente administração vê metadados e conteúdo restrito',()=>{
 assert.match(core,/where \(\$1::boolean or d\.sensitivity<>'restricted'\)/)
 assert.match(core,/docs\[0\]\.sensitivity==='restricted'&&!isAdmin/)
 assert.match(core,/if\(!can\(role,'documents'\)&&!can\(role,'documents:review'\)\)/)
})
test('revisor não pode publicar manual restrito, agente não recupera restricted',()=>{
 assert.match(core,/current\[0\]\.sensitivity==='restricted'&&!isAdmin/)
 assert.match(core,/d\.sensitivity in \('public','internal'\)/)
})
