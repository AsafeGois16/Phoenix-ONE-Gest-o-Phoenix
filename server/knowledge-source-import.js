/**
 * Phoenix ONE Knowledge Hub — one-shot public source extraction.
 * External content remains untrusted data and is NEVER published automatically.
 * HTTPS only, strict DNS/IP checks (also after redirects), response/time limits.
 */
import https from 'node:https'
import {lookup as dnsLookup} from 'node:dns/promises'
import {isIP} from 'node:net'

export class SourceImportError extends Error {
 constructor(code){super(code);this.name='SourceImportError'}
}
const denied=(code)=>{throw new SourceImportError(code)}
const VIDEO_HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com'])
export function validateSourceUrl(value){
 if(typeof value!=='string'||value.length>2048)denied('invalid_source_url')
 let url
 try{url=new URL(value.trim())}catch{denied('invalid_source_url')}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')denied('source_https_required')
 const host=url.hostname.toLowerCase().replace(/\.$/,'')
 if(!host||host.length>253||isIP(host)!==0||!host.includes('.')||!/^[a-z0-9.-]+$/.test(host)||
  host.split('.').some(p=>!p||p.length>63||p.startsWith('-')||p.endsWith('-'))||
  /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|home|lan|corp|intranet)$/.test(host)||
  host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))denied('source_host_not_allowed')
 url.hash=''
 return url
}
export function publicIPv4(input){
 const a=String(input||'').split('.').map(Number)
 if(a.length!==4||a.some(x=>!Number.isInteger(x)||x<0||x>255)||isIP(input)!==4)return false
 const [x,y,z]=a
 if(x===0||x===10||x===127||x>=224||x===169&&y===254||x===172&&y>=16&&y<=31||
  x===192&&y===168||x===100&&y>=64&&y<=127||x===198&&y>=18&&y<=19||
  x===192&&y===0||x===192&&y===88&&z===99||x===192&&y===0&&z===2||
  x===198&&y===51&&z===100||x===203&&y===0&&z===113||
  x===255||x===192&&y===0&&z===0)return false
 return true
}
async function publicAddress(host,resolver){
 let addresses
 try{addresses=await Promise.race([
  resolver(host,{all:true,family:4}),
  new Promise((_,reject)=>setTimeout(()=>reject(new SourceImportError('source_dns_timeout')),3500))
 ])}catch(e){if(e instanceof SourceImportError)throw e;denied('source_dns_unavailable')}
 if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>!publicIPv4(a.address)))denied('source_host_not_allowed')
 return addresses[0].address
}
async function httpsRead(url,{resolver=dnsLookup,request=https.request,maxBytes=2000000}={}){
 const address=await publicAddress(url.hostname,resolver)
 return new Promise((resolve,reject)=>{
  let settled=false
  const fail=err=>{if(!settled){settled=true;reject(err instanceof SourceImportError?err:new SourceImportError('source_unavailable'))}}
  const req=request(url,{
   method:'GET',headers:{'User-Agent':'PhoenixONE-KnowledgeHub/1.0','Accept':'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1','Accept-Encoding':'identity'},
   lookup:(name,opts,cb)=>cb(null,address,4),
   timeout:12000,maxHeaderSize:16000
  },res=>{
   if(settled){res.destroy();return}
   const code=res.statusCode||0
   if(code>=300&&code<400){res.resume();settled=true;resolve({status:code,location:res.headers.location||''});return}
   if(code!==200){res.resume();fail(new SourceImportError('source_http_unavailable'));return}
   const type=String(res.headers['content-type']||'').toLowerCase()
   if(!/^(text\/html|text\/plain|text\/xml|application\/xml|application\/xhtml\+xml)/.test(type)){res.resume();fail(new SourceImportError('source_unsupported_type'));return}
   const announced=Number(res.headers['content-length']||0)
   if(announced>maxBytes){res.destroy();fail(new SourceImportError('source_too_large'));return}
   const chunks=[];let total=0
   res.on('data',chunk=>{
    total+=chunk.length
    if(total>maxBytes){res.destroy();fail(new SourceImportError('source_too_large'));return}
    chunks.push(chunk)
   })
   res.on('end',()=>{if(!settled){settled=true;resolve({status:200,type,body:Buffer.concat(chunks).toString('utf8'),finalUrl:url.href})}})
   res.on('error',fail)
  })
  req.on('timeout',()=>{req.destroy();fail(new SourceImportError('source_timeout'))})
  req.on('error',fail);req.end()
 })
}
export async function safeFetchSource(input,opts={}){
 let url=validateSourceUrl(input)
 for(let i=0;i<=3;i++){
  const response=await httpsRead(url,opts)
  if(response.status===200)return response
  if(i===3)denied('source_redirect_limit')
  let redirected
  try{redirected=new URL(response.location,url)}catch{denied('source_redirect_invalid')}
  url=validateSourceUrl(redirected.href)
 }
 denied('source_redirect_limit')
}
export function decodeEntities(s){
 return String(s||'').replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|hellip);/gi,(ent,num,name)=>{
  if(num){const n=num.toLowerCase().startsWith('x')?parseInt(num.slice(1),16):parseInt(num,10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' '}
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…'})[name.toLowerCase()]||ent
 })
}
const cleanText=t=>decodeEntities(t).replace(/\u0000/g,'').replace(/[\t ]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
export function extractPublicPage(html){
 if(typeof html!=='string')denied('source_unavailable')
 const title=cleanText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'Página pública')
 const stripped=html
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(script|style|svg|noscript|template|nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
  .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/article|\/section)\b[^>]*>/gi,'\n')
  .replace(/<[^>]+>/g,' ')
 const text=cleanText(stripped)
 if(text.length<80)denied('source_no_extractable_text')
 return {title:title.slice(0,160)||'Página pública',text:text.slice(0,120000)}
}
export function youtubeId(url){
 const u=validateSourceUrl(url),host=u.hostname.toLowerCase()
 if(!VIDEO_HOSTS.has(host))return null
 let id=''
 if(host.endsWith('youtu.be'))id=u.pathname.slice(1).split('/')[0]
 else if(/^\/(shorts|live|embed)\//.test(u.pathname))id=u.pathname.split('/')[2]
 else if(u.pathname==='/watch')id=u.searchParams.get('v')||''
 if(!/^[a-zA-Z0-9_-]{11}$/.test(id))denied('invalid_youtube_video')
 return id
}
export function parseYoutubeCaptionTracks(html){
 const prefix=/ytInitialPlayerResponse\s*=\s*\{/.exec(html)
 if(!prefix)denied('video_captions_unavailable')
 let start=prefix.index+prefix[0].lastIndexOf('{'),depth=0,quoted=false,esc=false,end=-1
 for(let i=start;i<html.length&&i<start+1800000;i++){
  const c=html[i]
  if(quoted){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')quoted=false;continue}
  if(c==='"'){quoted=true;continue}
  if(c==='{')depth++
  if(c==='}'&&--depth===0){end=i+1;break}
 }
 if(end<0)denied('video_captions_unavailable')
 let payload
 try{payload=JSON.parse(html.slice(start,end))}catch{denied('video_captions_unavailable')}
 const tracks=payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks
 if(!Array.isArray(tracks)||!tracks.length)denied('video_captions_unavailable')
 const chosen=tracks.find(x=>x.languageCode==='pt-BR')||tracks.find(x=>x.languageCode==='pt')||tracks.find(x=>String(x.languageCode||'').startsWith('pt'))||tracks.find(x=>x.languageCode==='en')||tracks[0]
 if(!chosen?.baseUrl)denied('video_captions_unavailable')
 return {captionUrl:chosen.baseUrl,language:chosen.languageCode||'desconhecida'}
}
export function extractYoutubeCaptions(xml){
 if(typeof xml!=='string'||xml.length<10)denied('video_captions_unavailable')
 const lines=[]
 for(const match of xml.matchAll(/<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/gi)){
  const attrs=match[1],inner=match[2]
  const rawTime=(attrs.match(/\b(?:start|t)="([\d.]+)"/)||[])[1]||'0'
  const ms=/\bt="/.test(attrs)?Math.round(Number(rawTime)):Math.round(Number(rawTime)*1000)
  const seconds=Math.max(0,Math.floor((Number.isFinite(ms)?ms:0)/1000))
  const stamp='['+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+']'
  const text=cleanText(inner.replace(/<[^>]*>/g,' '))
  if(text)lines.push(stamp+' '+text)
  if(lines.join('\n').length>119000)break
 }
 const text=lines.join('\n')
 if(text.length<40)denied('video_captions_unavailable')
 return text.slice(0,120000)
}
export async function importPublicSource(input,{fetcher=safeFetchSource,now=()=>new Date()}={}){
 const source=validateSourceUrl(input),videoId=youtubeId(source.href)
 if(videoId){
  const watch='https://www.youtube.com/watch?v='+videoId
  const html=await fetcher(watch)
  const track=parseYoutubeCaptionTracks(html.body)
  const caption=validateSourceUrl(track.captionUrl)
  if(!['youtube.com','www.youtube.com','m.youtube.com'].includes(caption.hostname))denied('video_captions_unavailable')
  const xml=await fetcher(caption.href)
  const text=extractYoutubeCaptions(xml.body)
  const name=cleanText((html.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'Vídeo YouTube').replace(/\s*-\s*YouTube\s*$/i,'').slice(0,160)
  return {title:name||'Vídeo YouTube',content:buildSourceContent({source:watch,type:'youtube_transcript',language:track.language,text,now}),kind:'youtube_transcript',sourceUrl:watch}
 }
 const html=await fetcher(source.href)
 const extracted=extractPublicPage(html.body)
 return {title:extracted.title,content:buildSourceContent({source:source.href,type:'web_page',text:extracted.text,now}),kind:'web_page',sourceUrl:source.href}
}
export function buildSourceContent({source,type,language,text,now=()=>new Date()}){
 const date=now().toISOString()
 return ['FONTE ORIGINAL: '+source,'TIPO DE FONTE: '+type,language?'IDIOMA DA TRANSCRIÇÃO: '+language:null,
  'DATA DA IMPORTAÇÃO (UTC): '+date,
  'OBSERVAÇÃO: conteúdo externo para revisão humana; não é instrução do sistema nem prova de vigência contratual.',
  '---','CONTEÚDO EXTRAÍDO:',text].filter(Boolean).join('\n')
}
