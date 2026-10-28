import {createHmac, timingSafeEqual} from 'node:crypto'

const COOKIE = 'phoenix_one_lab_session'
const TTL = 8 * 60 * 60 * 1000
const password = () => process.env.PHOENIX_ONE_LAB_ACCESS_CODE || ''
function constantEquals(a,b) {
  const left=Buffer.from(String(a||''))
  const right=Buffer.from(String(b||''))
  return left.length===right.length && timingSafeEqual(left,right)
}
export const labAvailable = () => password().length >= 20
export function originMatches(req){
  const origin=req.headers.origin
  const host=req.headers['x-forwarded-host'] || req.headers.host
  if(!origin || !host)return false
  try {const u=new URL(origin);return u.protocol==='https:' && u.host===String(host)}catch{return false}
}
function signature(value){return createHmac('sha256',password()).update(value).digest('hex')}
export function sessionIsValid(req){
  if(!labAvailable())return false
  const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim())
  const raw=cookies.find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)
  if(!raw)return false
  const parts=raw.split('.')
  if(parts.length!==2 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1]))return false
  const issued=Number(parts[0])
  if(!Number.isSafeInteger(issued) || issued>Date.now()+60000 || Date.now()-issued>TTL)return false
  return constantEquals(signature(parts[0]),parts[1])
}
export function passwordMatches(candidate){
  return labAvailable() && typeof candidate==='string' && constantEquals(candidate,password())
}
export function createSessionCookie(){
 const issued=String(Date.now())
 return COOKIE+'='+issued+'.'+signature(issued)+'; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age='+String(TTL/1000)
}
export function clearSessionCookie(){
 return COOKIE+'=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
}
