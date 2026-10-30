import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatMegaBrainHint,readMegaBrainHint} from '../server/megabrain-agent-context.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const result={version:'megabrain-v3',available:true,verified:false,context:{
 topic:'assistencia',product:'auto',subtopic:'guincho',previous_agent:'clara',confidence:'inferido'
}}
test('consented context is limited to non-sensitive fixed vocabulary and explicitly unverified',()=>{
 const hint=formatMegaBrainHint(result)
 assert.match(hint,/guincho\/reboque/)
 assert.match(hint,/HIPÓTESE DE CONTEXTO/)
 assert.match(hint,/não prova identidade|não prova identidade/i)
 assert.doesNotMatch(hint,/123\.456\.789|[0-9]{11}/)
})
test('context refuses unsupported, unverified-shape or absent observations',()=>{
 assert.equal(formatMegaBrainHint({...result,available:false}),'')
 assert.equal(formatMegaBrainHint({...result,verified:true}),'')
 assert.equal(formatMegaBrainHint({...result,context:{...result.context,topic:'TEXTO NÃO CONFIÁVEL'}}),'')
 assert.equal(formatMegaBrainHint({...result,context:{...result.context,previous_agent:'staff'}}),'')
})
test('V3 network is disabled by default',async()=>{
 const previous=process.env.PHOENIX_MEGABRAIN_V3_READ
 delete process.env.PHOENIX_MEGABRAIN_V3_READ
 try{assert.equal(await readMegaBrainHint({conversationId:'test',protocolo:'20261030-0005',agent:'clara',mode:'automatico'}),'')}
 finally{if(previous!==undefined)process.env.PHOENIX_MEGABRAIN_V3_READ=previous}
})
test('V3 read query is authenticated, isolated by both identifiers and short-lived',()=>{
 const edge=read('supabase/functions/phoenix-one-megabrain-context/index.ts')
 for(const s of ["body.action==='agent_context'","await isBridgeToken(token)","o.conversation_id=$2::uuid","g.conversation_id=s.conversation_id","g.agent_read_enabled=true","g.enabled=true","g.expires_at>now()","o.observed_at>=now()-interval '20 minutes'","s.stage='with_agent'"])assert.ok(edge.includes(s),s)
 assert.ok(edge.includes("body.confirm!=='AUTORIZAR_LEITURA_IA'"))
 assert.ok(edge.includes("body.action==='revoke_agent_read'"))
 assert.ok(edge.includes("agent_read_enabled=false"))
})
test('V3 permissions are default-off and captured context never becomes identity proof',()=>{
 const migration=read('supabase/migrations/20261030_megabrain_v3_agent_read.sql')
 assert.ok(migration.includes("agent_read_enabled boolean not null default false"))
 const route=read('api/v1/conversations/respond.js')
 assert.ok(route.includes('readMegaBrainHint('))
 assert.ok(route.includes('...(megabrainHint?[megabrainHint]:[])'))
 assert.ok(route.indexOf('readMegaBrainHint(')>route.indexOf('const resultKnowledge='))
 assert.ok(route.indexOf('readMegaBrainHint(')<route.indexOf("fetch('https://api.openai.com"))
 assert.doesNotMatch(read('supabase/functions/phoenix-one-bridge/index.ts'),/megabrain_protocol_grants/)
})
test('admin interface keeps observation and agent reading separate',()=>{
 const ui=read('src/MegaBrainProtocolControl.jsx')
 assert.ok(ui.includes('Ativar leitura para Clara e Murilo'))
 assert.ok(ui.includes('Desativar leitura para Clara e Murilo'))
 assert.ok(ui.includes('read_not_eligible'))
 assert.ok(ui.includes('AUTORIZAR_LEITURA_IA'))
 assert.ok(ui.includes('control.can_authorize_read'))
 assert.ok(ui.includes('window.confirm'))
})
