import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const path=new URL('../supabase/functions/phoenix-one-core/index.ts',import.meta.url)
const source=readFileSync(path,'utf8')
const first=source.indexOf("  if(action==='save_agent'){")
const last=source.indexOf("  if(action==='agent_versions'){",first)
assert.ok(first>=0&&last>first,'save_agent block must be present')
const block=source.slice(first,last)
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
const run=new AsyncFunction('action','role','body','can','validAgent','clean','stringUnder','pg','user','out','err',block)
const base={
 action:'save_agent',role:'owner',
 body:{agent:'clara',prompt:'Clara '.repeat(40),name:'Clara',role:'Atendimento'},
 can:()=>true,
 validAgent:a=>a==='clara',
 clean:x=>String(x||'').trim(),
 stringUnder:(s,max)=>typeof s==='string'&&s.length<=max,
 user:{id:'11111111-1111-4111-8111-111111111111'},
 out:(code,data)=>({code,data}),
 err:(code,error)=>({code,error})
}
function engine({active=true,priorPolicy}={}){
 const queries=[],writes=[]
 const pg={begin:async cb=>cb({unsafe:async(query,args)=>{
  queries.push(query)
  if(query.includes('pg_advisory_xact_lock'))return []
  if(query.includes('coalesce(max(version)'))return [{last:12}]
  if(query.startsWith('select policy,tone'))return active?[{policy:priorPolicy,tone:'Gentil e clara'}]:[]
  if(query.startsWith('insert into phoenix_one.agent_versions'))writes.push(args)
  return []
 }})}
 return {pg,queries,writes}
}
test('Editing prompt retains all policy keys and older tone when the editor omits it',async()=>{
 const previous={versionName:'V12',consentRequired:true,canHandleUrgency:true,source:'imported',review:'approved',
  metadata:{engine:'phoenix-one',sensitive:false}}
 const engine1=engine({priorPolicy:previous})
 const result=await run(base.action,base.role,base.body,base.can,base.validAgent,base.clean,base.stringUnder,engine1.pg,base.user,base.out,base.err)
 assert.deepEqual(result,{code:200,data:{saved:true,version:13}})
 assert.equal(engine1.writes.length,1)
 const inserted=engine1.writes[0]
 assert.equal(inserted[0],'clara')
 assert.equal(inserted[1],13)
 assert.equal(inserted[3],'Gentil e clara')
 const policy=JSON.parse(inserted[4])
 assert.equal(policy.consentRequired,true)
 assert.equal(policy.canHandleUrgency,true)
 assert.equal(policy.metadata.engine,'phoenix-one')
 assert.equal(policy.source,'user_editor')
 assert.equal(policy.review,'manual')
 assert.deepEqual(previous,{versionName:'V12',consentRequired:true,canHandleUrgency:true,source:'imported',review:'approved',metadata:{engine:'phoenix-one',sensitive:false}})
 const lock=engine1.queries.findIndex(s=>s.includes('pg_advisory_xact_lock'))
 const version=engine1.queries.findIndex(s=>s.includes('coalesce(max(version)'))
 assert.ok(lock>=0&&lock<version,'version lock must precede allocation')
})
test('Editing prompt fails closed when there is no active version',async()=>{
 const engine1=engine({active:false,priorPolicy:{}})
 await assert.rejects(run(base.action,base.role,base.body,base.can,base.validAgent,base.clean,base.stringUnder,engine1.pg,base.user,base.out,base.err),/agent_active_version_missing/)
 assert.equal(engine1.writes.length,0)
 assert.equal(engine1.queries.some(q=>q.startsWith('update phoenix_one.agent_versions')),false)
})
