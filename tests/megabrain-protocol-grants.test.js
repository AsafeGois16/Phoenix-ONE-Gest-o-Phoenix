import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const edge=read('supabase/functions/phoenix-one-megabrain-context/index.ts')
const migration=read('supabase/migrations/20261030_megabrain_protocol_grants.sql')
const ui=read('src/MegaBrainProtocolControl.jsx')
test('capture requires current authorization for same protocol and conversation',()=>{
 for(const snippet of ["megabrain_protocol_grants g","g.conversation_id=s.conversation_id","g.enabled=true","g.revoked_at is null","g.expires_at>now()","s.stage='with_agent'"])assert.ok(edge.includes(snippet),snippet)
 assert.ok(edge.includes('accepted:writes.length>0'))
})
test('admin must explicitly approve a limited-time grant',()=>{
 for(const snippet of ["body.action==='grant'","body.action==='revoke'","body.action==='control_status'","body.confirm!=='AUTORIZAR_TESTE'","now()+interval '30 minutes'"])assert.ok(edge.includes(snippet),snippet)
 assert.ok(migration.includes('enable row level security'))
 assert.ok(migration.includes('constraint megabrain_protocol_grant_ttl'))
})
test('protocol UI controls are explicit and reversible',()=>{
 assert.ok(ui.includes('Ativar observação deste protocolo por 30 minutos'))
 assert.ok(ui.includes('Desativar observação deste protocolo'))
 assert.ok(ui.includes('window.confirm'))
 assert.ok(read('src/MegaBrainContext.jsx').includes('<MegaBrainProtocolControl'))
})
test('automatic capture remains behind server opt-in',()=>{
 assert.ok(read('server/megabrain-observation.js').includes("PHOENIX_MEGABRAIN_SHADOW!=='true'"))
})
