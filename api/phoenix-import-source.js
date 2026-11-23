import {createClient} from '@supabase/supabase-js'
import {SourceImportError,validateSourceUrl,importPublicSource} from '../server/knowledge-source-import.js'
export const config={api:{bodyParser:{sizeLimit:'12kb'}},maxDuration:25}
const SUPABASE_URL=process.env.VITE_SUPABASE_URL
const KEY=process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ORIGIN='https://phoenix-one-ai.vercel.app'
const ROLES=new Set(['owner','admin','editor'])
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'})
 if(req.headers.origin!==ORIGIN||(req.headers['x-forwarded-host']||req.headers.host)!=='phoenix-one-ai.vercel.app')return res.status(403).json({error:'origin_not_allowed'})
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'')
 if(token.length<40||!SUPABASE_URL||!KEY)return res.status(401).json({error:'unauthorized'})
 let source
 try{source=validateSourceUrl(req.body?.url)}catch(e){return res.status(400).json({error:e instanceof SourceImportError?e.message:'invalid_source_url'})}
 try{
  const supa=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await supa.auth.getUser(token)
  if(error||!user)return res.status(401).json({error:'unauthorized'})
  const permission=await fetch(SUPABASE_URL+'/functions/v1/phoenix-one-core',{
   method:'POST',
   headers:{Authorization:'Bearer '+token,apikey:KEY,Origin:ORIGIN,'Content-Type':'application/json'},
   body:JSON.stringify({action:'bootstrap'}),signal:AbortSignal.timeout(8000),cache:'no-store'
  })
  if(!permission.ok)return res.status(403).json({error:'not_phoenix_one_admin'})
  const state=await permission.json().catch(()=>({}))
  if(!ROLES.has(state.role))return res.status(403).json({error:'forbidden'})
  const result=await importPublicSource(source.href)
  // Extraction is just a preview. Only the existing reviewed create_document
  // flow writes the content to the knowledge base.
  return res.status(200).json({...result,reviewRequired:true,published:false})
 }catch(e){
  const code=e instanceof SourceImportError?e.message:'source_import_unavailable'
  console.warn('phoenix_source_import',JSON.stringify({reason:code}))
  return res.status(e instanceof SourceImportError?422:503).json({error:code})
 }
}
