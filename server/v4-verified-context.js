/**
 * MegaBrain V4: public contract adapter. Strictly server-to-server.
 * The Phoenix ONE never treats a phone number, client-supplied token or a
 * name alone as evidence of identity.
 *
 * IMPORTANT: verified_profile and risk_summary field shapes are derived from
 * Junior's 03/11/2026 technical answer, pending OpenAPI fixture validation.
 * Feature is OFF unless both Vercel and Supabase gates are explicitly enabled.
 */
export const V4_PURPOSES=['service','quote','assistance','policies_and_installments']
export const V4_PRODUCTS=['auto','moto','frota','residencial','empresarial','vida','ap','saude','odonto','vida_grupo','previdencia','viagem','pet','bike','fianca','garantia','rc']
export const validVerificationRef=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{48}$/.test(value)
export const validV4Purpose=value=>V4_PURPOSES.includes(value)
export const validProductCode=value=>V4_PRODUCTS.includes(value)
const SAFE_NAME=/^[\p{L}\p{M}][\p{L}\p{M} .'\u2019-]{0,69}$/u
const safeName=value=>typeof value==='string'&&SAFE_NAME.test(value.trim())?value.trim():null
const safeEnum=(value,allowed)=>allowed.includes(value)?value:null
const safeISO=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d))?$/.test(value)?value:null

export function parseVerifiedProfile(raw,scopes,purpose){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(scopes))return null
 // Avoid showing name in contexts for which the service did not release
 // the profile explicitly. The API is authoritative about field_scopes.
 if(!scopes.includes('verified_profile')&&!scopes.includes('profile:read'))return null
 const name=safeName(raw.nome_tratamento)
 const person=safeEnum(raw.tipo_pessoa,['pf','pj','PF','PJ'])
 const relation=safeEnum(raw.relacao_com_contrato,['titular'])
 if(relation!=='titular')return null
 return name?{
  nome_tratamento:name,
  tipo_pessoa:person?.toLowerCase()||null,
  relacao_com_contrato:relation,
  perfil_atualizado_em:safeISO(raw.perfil_atualizado_em)
 }:null
}
export function sanitizeV4AutoRisk(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const v=raw.vehicle&&typeof raw.vehicle==='object'&&!Array.isArray(raw.vehicle)?raw.vehicle:null
 if(!v)return null
 const label=x=>typeof x==='string'&&/^[\p{L}\p{M}\p{N} .\/()-]{1,80}$/u.test(x.trim())?x.trim():null
 const year=x=>Number.isInteger(x)&&x>=1970&&x<=new Date().getFullYear()+2?x:null
 const vehicle={
  marca:label(v.marca),
  modelo:label(v.modelo),
  marca_modelo:label(v.marca_modelo),
  versao:label(v.versao),
  ano_fabricacao:year(v.ano_fabricacao),
  ano_modelo:year(v.ano_modelo),
  zero_km:typeof v.zero_km==='boolean'?v.zero_km:null
 }
 return Object.values(vehicle).some(x=>x!==null)?{vehicle}:null
}
export function v4VerifiedSummary(raw,purpose='service'){
 if(!raw||raw.status!=='verified'||!validV4Purpose(purpose))return null
 const expires=raw.expires_at,verified=raw.verified_at
 // Ref-based continuation requires protocol-bound explicit verification.
 if(!safeISO(expires)||Date.parse(expires)<=Date.now()||!safeISO(verified))return null
 const scopes=Array.isArray(raw.field_scopes)?raw.field_scopes.filter(x=>typeof x==='string'&&x.length<=70).slice(0,40):[]
 const profile=parseVerifiedProfile(raw.verified_profile,scopes,purpose)
 const dataFreshness=raw.data_freshness&&typeof raw.data_freshness==='object'&&!Array.isArray(raw.data_freshness)?
  Object.fromEntries(Object.entries(raw.data_freshness).filter(([k,v])=>['profile','policies','risk_summary','benefits'].includes(k)&&safeISO(v)).slice(0,4)):null
 return {
  status:'verified',verified_profile:profile,verified_at:verified,expires_at:expires,
  field_scopes:scopes,data_freshness:dataFreshness,
  // Reference is passed only in server-server transport, not copied into replies.
  verification_ref:validVerificationRef(raw.verification_ref)?raw.verification_ref:null
 }
}
export function verifiedGreeting(profile){
 return profile?.relacao_com_contrato==='titular'&&profile.nome_tratamento?
  'Olá, '+profile.nome_tratamento+'! ':''
}
