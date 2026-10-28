/** A verificação é feita por Supabase Edge Function autenticada, sem expor o token. */
export default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(410).json({error:'legacy_probe_disabled',replacement:'phoenix-one-admin:probe'})}
