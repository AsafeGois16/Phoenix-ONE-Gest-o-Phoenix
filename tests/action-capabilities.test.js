import test from 'node:test'
import assert from 'node:assert/strict'
import {ACTION_CAPABILITIES,checkCapability} from '../server/action-capabilities.js'
test('only approved reads and human handoff proposals are enabled',()=>{
 assert.ok(ACTION_CAPABILITIES.some(c=>c.id==='policy_lookup'))
 assert.ok(ACTION_CAPABILITIES.filter(c=>c.kind==='write').every(c=>c.state!=='enabled'))
})
test('Clara cannot read contract data without both authorization and scope',()=>{
 const scopes=['identity:resolve','policies:read']
 assert.equal(checkCapability('policy_lookup',{agent:'clara',identityVerified:false,scopes}).allowed,false)
 assert.equal(checkCapability('policy_lookup',{agent:'clara',identityVerified:true,scopes:['policies:read']}).allowed,false)
 assert.equal(checkCapability('policy_lookup',{agent:'clara',identityVerified:true,scopes}).allowed,true)
 assert.equal(checkCapability('policy_lookup',{agent:'murilo',identityVerified:true,scopes}).allowed,false)
})
test('actions pending with Junior are not executable even when scopes are enabled',()=>{
 assert.equal(checkCapability('second_copy',{agent:'clara',identityVerified:true,scopes:['installments:read']}).reason,'not_homologated')
 assert.equal(checkCapability('new_quote',{agent:'murilo'}).reason,'not_homologated')
 assert.equal(checkCapability('send_whatsapp',{agent:'clara'}).reason,'system_junior_exclusive')
})
test('guidance allowed to both agents; unknown capability denied',()=>{
 assert.equal(checkCapability('general_guidance',{agent:'clara'}).allowed,true)
 assert.equal(checkCapability('general_guidance',{agent:'murilo'}).allowed,true)
 assert.equal(checkCapability('nonexistent',{agent:'clara'}).allowed,false)
})
