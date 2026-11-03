import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import {validVerificationRef,validV4Purpose,validProductCode,v4VerifiedSummary} from './v4-verified-context.js'
import {sanitizeV41Risk} from './v4-universal-risk.js'

export const origins={phoenix:'https://phoenix-one-ai.vercel.app'}
export function secureMatch(a,b){
 const aa=Buffer.from(String(a||''),'utf8'),bb=Buffer.from(String(b||''),'utf8')
 return aa.length===bb.length&&timingSafeEqual(aa,bb)
}
export function authenticateJunior(req){
 const value=req.headers.authorization||''
 const token=typeof value==='string'&&value.startsWith('Bearer ')?value.slice(7):''
 const expected=process.env.PHOENIX_ONE_TOKEN
 return Boolean(expected&&token&&secureMatch(token,expected))
}
export function uuidValid(x){return typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)}
export function validAgent(a){return a==='clara'||a==='murilo'}
export function safeText(a,max=1000){return typeof a==='string'?a.slice(0,max).trim():''}
export function asServerError(status,code){const e=new Error(code);e.httpStatus=status;return e}
export async function bridge(action,params={},signal){
 const url=process.env.VITE_SUPABASE_URL
 const token=process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN
 if(!url||!token)throw asServerError(503,'bridge_not_configured')
 const response=await fetch(url+'/functions/v1/phoenix-one-bridge',{
  method:'POST',redirect:'error',signal,
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({action,...params})
 })
 const payload=await response.json().catch(()=>({error:'bridge_bad_response'}))
 if(!response.ok)throw asServerError(response.status===400?400:503,payload.error||'bridge_failed')
 return payload
}
export function redact(s){
 return safeText(s,5000).replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,'[EMAIL]')
 .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[DOCUMENTO]')
 .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,'[DOCUMENTO]')
 .replace(/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g,'[CONTATO]')
 .replace(/\b\d{8,}\b/g,'[IDENTIFICADOR]')
}
export async function juniorIdentityContext(conversationId,protocolo,document,proof,signal,options={}){
 if(!uuidValid(conversationId)||!/^\d{8}-\d{4}$/.test(protocolo))return {status:'unavailable'}
 try{
  const v4=process.env.PHOENIX_ONE_V4_VERIFIED_CONTEXT==='true'&&options.v4===true
  const ref=v4&&validVerificationRef(options.verificationRef)?options.verificationRef:null
  if(!ref&&(!document||document.status!=='valid'))return {status:'unavailable'}
  const purpose=v4?(validV4Purpose(options.purpose)?options.purpose:null):'policies_and_installments'
  if(v4&&!purpose)return {status:'unavailable'}
  const productCode=v4&&validProductCode(options.productCode)?options.productCode:null
  const numero=v4&&typeof options.numero==='string'&&/^[\p{L}\p{N} .\/()-]{1,60}$/u.test(options.numero)?options.numero:null
  if(v4&&purpose==='quote'&&!productCode&&!numero)return {status:'unavailable'}
  const payload={conversationId,protocolo,
   ...(ref?{verificationRef:ref}:{documentType:document.type,document:document.number}),
   ...(v4?{v4:true,purpose,...(productCode?{productCode}:{}),...(numero?{numero}:{})}:{})}
  if(!ref&&proof&&Object.keys(proof).length===1){
   if(document.type==='cpf'&&typeof proof.birth_date==='string')payload.proof={birth_date:proof.birth_date}
   if(document.type==='cnpj'&&typeof proof.cep==='string')payload.proof={cep:proof.cep}
  }
  const data=await bridge('identity_context',payload,signal)
  if(data?.status==='verified'){
   if(!v4)return {status:'verified',policies:data.policies||[],installments:data.installments||[],pending:data.pending||[]}
   const summary=v4VerifiedSummary(data,purpose,productCode)
   if(!summary)return {status:'unavailable'}
   // Defense in depth: Vercel also checks every product scope, even if a
   // future Junior/bridge response accidentally includes additional fields.
   const safeString=(x,max)=>typeof x==='string'&&x.length<=max&&!/[\r\n\0-\x1f]/.test(x)?x:null
   const safeMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1e12?x:null
   const sanitizeCoverage=c=>c&&typeof c==='object'&&!Array.isArray(c)?{
    nome:safeString(c.nome,140),capital_segurado:safeMoney(c.capital_segurado),franquia:safeMoney(c.franquia)
   }:null
   const policies=summary.field_scopes.includes('policies.read')&&Array.isArray(data.policies)?
    data.policies.slice(0,12).map(policy=>{
     if(!policy||typeof policy!=='object'||Array.isArray(policy))return null
     const validCode=validProductCode(policy.product_code)?policy.product_code:null
     const risk_summary=sanitizeV41Risk(policy,summary.field_scopes,purpose)
     const vehicle=validCode&&['auto','moto'].includes(validCode)?
      sanitizeV41Risk({product_code:validCode,risk_summary:{vehicle:policy.veiculo}},
       summary.field_scopes,purpose)?.vehicle||null:null
     return {
      numero:safeString(policy.numero,60),ramo:safeString(policy.ramo,60),
      seguradora:safeString(policy.seguradora,90),fim_vigencia:safeString(policy.fim_vigencia,30),
      linha:safeString(policy.linha,60),premio_total:safeMoney(policy.premio_total),
      premio_mensal:safeMoney(policy.premio_mensal),
      capital_segurado:safeMoney(policy.capital_segurado),status:safeString(policy.status,45),
      product_code:validCode,risk_summary,veiculo:vehicle,
      coberturas:Array.isArray(policy.coberturas)?policy.coberturas.slice(0,30)
       .map(sanitizeCoverage).filter(c=>c?.nome):[]
     }
    }).filter(Boolean):[]
   const installments=purpose!=='quote'&&summary.field_scopes.includes('installments.read')&&
    Array.isArray(data.installments)?data.installments.slice(0,12).map(i=>({
      apolice:safeString(i?.apolice,60),ramo:safeString(i?.ramo,50),
      vencimento:safeString(i?.vencimento,30),valor:safeMoney(i?.valor),vencida:i?.vencida===true
    })):[]
   return {...summary,policies,installments,
    pending:Array.isArray(data.pending)?data.pending.slice(0,8).map(p=>({
     description:safeString(p?.description,200),status:safeString(p?.status,45),
     due_date:safeString(p?.due_date,30)
    })).filter(p=>p.description):[]}
  }
  const allowed=['verification_required','verification_expired','verification_failed','not_found','invalid_document','too_many_attempts','protocol_not_open','multiple_matches','unavailable']
  return {status:allowed.includes(data?.status)?data.status:'unavailable',
   method:data?.verification?.method||null,attemptsLeft:Number.isInteger(data?.verification?.attempts_left)?data.verification.attempts_left:null}
 }catch{return {status:'unavailable'}}
}
export function hmacSignature(ts,raw,secret){return 'sha256='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')}
export async function readRaw(req,maxBytes=65536){
 const pieces=[];let length=0
 for await(const chunk of req){length+=chunk.length;if(length>maxBytes)throw asServerError(413,'payload_too_large');pieces.push(chunk)}
 return Buffer.concat(pieces).toString('utf8')
}
export function jsonResponse(res,status,payload){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(payload)}
export function noRawLog(s){return createHash('sha256').update(s).digest('hex')}
