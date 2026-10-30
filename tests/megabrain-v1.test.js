import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const edge=read('supabase/functions/phoenix-one-megabrain/index.ts')
const ui=read('src/MegaBrain.jsx')
const app=read('src/App.jsx')
const ops=read('src/Operations.jsx')

test('MegaBrain V1 is a separate administrative route with no impact on WhatsApp or existing handlers',()=>{
 assert.match(app,/\['megabrain','MegaBrain'/)
 assert.match(ops,/page==='megabrain'/)
 assert.match(ops,/<MegaBrain session=\{session\}/)
 assert.doesNotMatch(read('api/v1/conversations/respond.js'),/phoenix-one-megabrain/)
 assert.doesNotMatch(read('supabase/functions/phoenix-one-bridge/index.ts'),/phoenix-one-megabrain/)
})
test('MegaBrain endpoint authenticates and authorizes administrators before querying private state',()=>{
 assert.match(edge,/supa\.auth\.getUser\(token\)/)
 assert.match(edge,/phoenix_one\.admin_users/)
 assert.match(edge,/!\['owner','admin'\]\.includes/)
 assert.match(edge,/body\.action!=='snapshot'/)
 assert.match(edge,/origin_not_allowed/)
})
test('MegaBrain never reads message bodies or private customer documents',()=>{
 assert.match(edge,/phoenix_one\.protocol_agent_state/)
 assert.match(edge,/select external_ticket_id as protocolo,last_agent as agent/)
 assert.doesNotMatch(edge,/select\s+\*/i)
 assert.doesNotMatch(edge,/\b(?:knowledge_chunks|knowledge_documents|client_data|crm_leads)\b/i)
 assert.doesNotMatch(edge,/\b(?:insert into|update phoenix_one|delete from|drop table|alter table)\b/i)
 assert.match(edge,/expires_at>now\(\)/)
 assert.match(edge,/limit 60/)
})
test('UI has explicit read-only indicators, filters and no controls to change protocol state',()=>{
 assert.match(ui,/Somente leitura/)
 assert.match(ui,/Memória operacional de protocolos/)
 assert.match(ui,/Filtrar protocolo/)
 assert.match(ui,/Filtrar agente/)
 assert.match(ui,/clara_apresentada/)
 assert.match(ui,/murilo_apresentado/)
 assert.match(ui,/não modifica a memória/)
 assert.doesNotMatch(ui,/action:'(?:save|update|delete|transfer|handoff|event)'/)
})
