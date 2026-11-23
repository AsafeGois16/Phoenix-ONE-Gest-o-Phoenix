import https from 'node:https'
import {lookup} from 'node:dns/promises'
import {safeFetchSource} from '../server/knowledge-source-import.js'
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='fix/knowledge-source-https'){
 const testUrl='https://phoenixseg.com.br/'
 console.log('SITE_PROBE_START')
 try{const data=await safeFetchSource(testUrl);console.log('SITE_PROBE_SOURCE_OK',data.status,data.body.length)}
 catch(e){console.log('SITE_PROBE_SOURCE_ERROR',e.name,e.message)}
 let addresses
 try{addresses=await lookup('phoenixseg.com.br',{all:true,family:4});console.log('SITE_PROBE_DNS_COUNT',addresses.length)}
 catch(e){console.log('SITE_PROBE_DNS_ERROR',e.code||e.name)}
 if(addresses)for(const item of addresses.slice(0,3)){
  const result=await new Promise(resolve=>{
   const r=https.request(testUrl,{method:'GET',lookup:(host,opts,cb)=>cb(null,item.address,4),timeout:5000,headers:{'User-Agent':'PhoenixONE-KnowledgeHub/1.0',Accept:'text/html','Accept-Encoding':'identity'}},res=>{res.resume();res.once('end',()=>resolve({status:res.statusCode,type:res.headers['content-type'],size:res.headers['content-length']}))})
   r.on('error',e=>resolve({error:e.code||e.name,kind:e.name}));r.on('timeout',()=>{r.destroy();resolve({error:'timeout'})});r.end()
  })
  console.log('SITE_PROBE_PINNED',JSON.stringify(result))
 }
 try{const r=await fetch(testUrl,{signal:AbortSignal.timeout(6000)});console.log('SITE_PROBE_FETCH',r.status,r.headers.get('content-type')); await r.body?.cancel()}
 catch(e){console.log('SITE_PROBE_FETCH_ERR',e.name,e.cause?.code||'unknown')}
}