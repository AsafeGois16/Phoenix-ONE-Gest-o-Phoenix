// Os testes não herdam o alvo Vercel do build. O teste específico de
// isolamento injeta explicitamente preview/branch e verifica HTTP 503.
// O processo de implantação e o runtime continuam com seu ambiente original.
import {readdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const env={...process.env}
delete env.VERCEL_ENV
delete env.VERCEL_GIT_COMMIT_REF
const files=readdirSync('tests').filter(f=>f.endsWith('.test.js')).sort().map(f=>'tests/'+f)
if(!files.length)throw Error('no tests')
const result=spawnSync(process.execPath,['--test',...files],{env,stdio:'inherit'})
if(result.error)throw result.error
process.exit(result.status??1)
