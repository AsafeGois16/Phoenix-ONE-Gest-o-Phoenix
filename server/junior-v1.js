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
export async function juniorContext(conversationId,signal){
 const base=process.env.JUNIOR_MANAGEMENT_API_URL
 const token=process.env.PHOENIX_ONE_API_TOKEN
 if(!base||!token||!uuidValid(conversationId))return null
 let target
 try{
  const url=new URL(base)
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||/^(localhost|127\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname))return null
  target=new URL(url.pathname.replace(/\/+$/,'')+'/conversations/'+encodeURIComponent(conversationId)+'/context',url.origin)
 }catch{return null}
 try{
  const response=await fetch(target,{
   method:'GET',signal,redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  })
  if(!response.ok)return null
  const raw=await response.text()
  if(raw.length>35000)return null
  const data=JSON.parse(raw)
  const policies=Array.isArray(data?.policies)?data.policies.slice(0,8).map(p=>({
   numero:safeText(p?.numero,64),ramo:safeText(p?.ramo,60),seguradora:safeText(p?.seguradora,90),fim_vigencia:safeText(p?.fim_vigencia,30),linha:safeText(p?.linha,60)
  })):[]
  const installments=Array.isArray(data?.installments)?data.installments.slice(0,12).map(i=>({
   apolice:safeText(i?.apolice,64),ramo:safeText(i?.ramo,50),parcela:i?.parcela,vencimento:safeText(i?.vencimento,30),valor:i?.valor,vencida:!!i?.vencida
  })):[]
  return {policies,installments}
 }catch{return null}
}
export function hmacSignature(ts,raw,secret){return 'sha256='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')}
export async function readRaw(req,maxBytes=65536){
 const pieces=[];let length=0
 for await(const chunk of req){length+=chunk.length;if(length>maxBytes)throw asServerError(413,'payload_too_large');pieces.push(chunk)}
 return Buffer.concat(pieces).toString('utf8')
}
export function jsonResponse(res,status,payload){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(payload)}
export function noRawLog(s){return createHash('sha256').update(s).digest('hex')}
