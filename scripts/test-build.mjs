// Os testes não herdam o alvo Vercel do build. O teste específico de
// isolamento injeta explicitamente preview/branch e verifica HTTP 503.
// O processo de implantação e o runtime continuam com seu ambiente original.
import {readdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const env={...process.env}
delete env.VERCEL_ENV
delete env.VERCEL_GIT_COMMIT_REF
// Lab-only feature flags must be opt-in in their own tests. Otherwise a
// preview build would invalidate baseline legacy regression assertions.
delete env.PHX_MURILO_CLOSED_QUESTIONS
// Vercel Preview may enable only this branch's renewal features at runtime.
// Legacy tests must run with baseline feature flags disabled; dedicated
// renewal tests opt in explicitly via withFlags() within each test file.
delete env.PHX_UNIVERSAL_RENEWAL_LOOKUP
delete env.PHOENIX_ONE_V4_VERIFIED_CONTEXT
const files=readdirSync('tests').filter(f=>f.endsWith('.test.js')).sort().map(f=>'tests/'+f)
if(!files.length)throw Error('no tests')
const result=spawnSync(process.execPath,['--test',...files],{env,stdio:'inherit'})
if(result.error)throw result.error
process.exit(result.status??1)
