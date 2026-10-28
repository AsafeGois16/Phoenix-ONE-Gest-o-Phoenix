/** O antigo laboratório por código foi desativado. Utilize /api/phoenix-answer com Supabase Auth. */
export default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(410).json({error:'legacy_lab_disabled',replacement:'phoenix-one-authenticated-laboratory'})}
