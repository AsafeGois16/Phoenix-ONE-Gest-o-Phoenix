/**
 * Liveness only. This endpoint MUST NOT claim that Bridge, Junior, RAG, or
 * Supabase are healthy without actually probing their authenticated APIs.
 * Keep it public, stable, fast, and free of operational or personal data.
 */
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'})
 const revision=String(process.env.VERCEL_GIT_COMMIT_SHA||'')
 return res.status(200).json({
  service:'phoenix-one',
  status:'responding',
  scope:'application_liveness_only',
  revision:/^[0-9a-f]{40}$/i.test(revision)?revision.slice(0,12):null,
  dependencies:{
   supabase:'not_checked',
   junior_management:'not_checked',
   openai:'not_checked',
   rag:'not_checked',
   orchestration_bridge:'not_checked'
  }
 })
}
