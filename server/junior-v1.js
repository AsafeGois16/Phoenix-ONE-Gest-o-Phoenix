import {createHash,createHmac,timingSafeEqual} from 'node:crypto'

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
export async function juniorIdentityContext(conversationId,protocolo,document,proof,signal){
 if(!uuidValid(conversationId)||!/^\d{8}-\d{4}$/.test(protocolo))return {status:'unavailable'}
 try{
  if(!document||document.status!=='valid')return {status:'unavailable'}
  const payload={conversationId,protocolo,documentType:document.type,document:document.number}
  if(proof&&Object.keys(proof).length===1){
   if(document.type==='cpf'&&typeof proof.birth_date==='string')payload.proof={birth_date:proof.birth_date}
   if(document.type==='cnpj'&&typeof proof.cep==='string')payload.proof={cep:proof.cep}
  }
  const data=await bridge('identity_context',payload,signal)
  if(data?.status==='verified')return {status:'verified',policies:data.policies||[],installments:data.installments||[],pending:data.pending||[]}
  const allowed=['verification_required','verification_failed','not_found','invalid_document','too_many_attempts','protocol_not_open','multiple_matches','unavailable']
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
