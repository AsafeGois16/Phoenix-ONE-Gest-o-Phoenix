import {mapPublicSite} from '../server/knowledge-site-map.js'
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/knowledge-hub-site-map'){
 const start=Date.now()
 try{
  const r=await mapPublicSite('https://phoenixseg.com.br/')
  console.log('SITE_MAP_REAL',JSON.stringify({count:r.pages.length,roots:[...new Set(r.pages.map(x=>x.host))].slice(0,8),requests:r.requests,truncated:r.truncated,errors:r.errors,durationMs:Date.now()-start}))
  if(r.pages.length<4)process.exitCode=1
 }catch(e){console.log('SITE_MAP_REAL_ERROR',e.name,e.message,Date.now()-start);process.exitCode=1}
}
