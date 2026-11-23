/**
 * One-time, bounded discovery of public website URLs for Phoenix ONE.
 * Discovery never writes to Knowledge Hub, follows no unapproved domains
 * and does not enumerate DNS records. Documents remain subject to human review.
 */
import {safeFetchSource,validateSourceUrl,decodeEntities,SourceImportError,extractPublicPage} from './knowledge-source-import.js'
const TWO_PART_SUFFIXES=new Set(['com.br','net.br','org.br','gov.br','edu.br','co.uk','org.uk','ac.uk','com.au','net.au','co.jp','com.mx','com.ar','com.co','co.nz','co.in'])
const SHARED_SUFFIXES=new Set(['github.io','pages.dev','vercel.app','netlify.app','blogspot.com','wordpress.com','web.app','firebaseapp.com','appspot.com','cloudfront.net','herokuapp.com','azurewebsites.net','notion.site','readthedocs.io'])
const SKIP_PATH=/(?:^|\/)(?:wp-admin|wp-login\.php|login|signin|logout|account|minha-conta|checkout|cart|carrinho|api|graphql|oauth|admin|painel|private|privado|feed)(?:\/|$)/i
const SKIP_EXT=/\.(?:xml|json|pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|svg|mp[34]|mov|avi|zip|rar|css|js|woff2?|ico|exe|apk|csv|txt|rss)$/i
const PAGES=80,REQUESTS=12,DEPTH=2
const clean=s=>decodeEntities(String(s||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,140)
export function siteScopeHost(input){
 const host=validateSourceUrl(input).hostname.toLowerCase()
 const parts=host.split('.')
 if(parts.length<=2)return host
 const last2=parts.slice(-2).join('.')
 const last3=parts.slice(-3).join('.')
 if(SHARED_SUFFIXES.has(last2)||SHARED_SUFFIXES.has(last3))return parts.slice(-3).join('.')
 const suffixCount=TWO_PART_SUFFIXES.has(last2)?3:2
 return parts.slice(-suffixCount).join('.')
}
export function scopeContains(root,host){
 return host===root||host.endsWith('.'+root)
}
export function normalizeSitePage(input,scope){
 let u
 try{u=validateSourceUrl(input)}catch{return null}
 if(!scopeContains(scope,u.hostname.toLowerCase()))return null
 if(SKIP_PATH.test(u.pathname)||SKIP_EXT.test(u.pathname))return null
 u.search='';u.hash=''
 if(u.pathname.length>220)return null
 if(u.pathname!=='/'&&u.pathname.endsWith('/'))u.pathname=u.pathname.replace(/\/+$/,'/')
 return u.href
}
export function extractHtmlLinks(html,base,scope,limit=400){
 if(typeof html!=='string')return []
 const without=html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(?:script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|template|svg)\s*>/gi,' ')
 const links=[],seen=new Set()
 const re=/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
 let match
 while((match=re.exec(without))&&links.length<limit){
  const h=match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
  if(!h)continue
  const raw=decodeEntities(h[1]??h[2]??h[3]??'')
  let absolute
  try{absolute=new URL(raw,base).href}catch{continue}
  const url=normalizeSitePage(absolute,scope)
  if(!url||seen.has(url))continue
  seen.add(url)
  links.push({url,title:clean(match[2])||titleFromUrl(url),source:'link'})
 }
 return links
}
export function titleFromUrl(url){
 let path
 try{path=new URL(url).pathname}catch{return 'Página'}
 if(path==='/')return 'Página inicial'
 const part=path.split('/').filter(Boolean).at(-1)||'Página'
 return decodeEntities(decodeURIComponentSafe(part)).replace(/[-_]+/g,' ').slice(0,140)
}
const decodeURIComponentSafe=value=>{try{return decodeURIComponent(value)}catch{return value}}
export function parseSitemap(xml,base,scope){
 const indexes=[],pages=[]
 if(typeof xml!=='string'||!/^\s*(?:<\?xml[\s\S]*?\?>\s*)?<(?:sitemapindex|urlset)\b/i.test(xml))return {indexes,pages}
 const index=/\<sitemapindex\b/i.test(xml.slice(0,160))
 for(const m of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)){
  if(indexes.length+pages.length>=1000)break
  const raw=decodeEntities(m[1]).trim()
  let u
  try{u=validateSourceUrl(new URL(raw,base).href)}catch{continue}
  if(!scopeContains(scope,u.hostname.toLowerCase()))continue
  if(index){
   if(/\.xml(?:$|\?)/i.test(u.pathname)&&indexes.length<60)indexes.push(u.href)
  }else{
   const path=normalizeSitePage(u.href,scope)
   if(path)pages.push({url:path,title:titleFromUrl(path),source:'sitemap'})
  }
 }
 return {indexes,pages}
}
export function parseRobotSitemaps(text,base,scope){
 const result=[]
 for(const m of String(text||'').matchAll(/^\s*sitemap:\s*(\S+)/gim)){
  let url
  try{url=validateSourceUrl(new URL(m[1],base).href)}catch{continue}
  if(scopeContains(scope,url.hostname.toLowerCase())&&/\.xml(?:$|\?)/i.test(url.pathname))result.push(url.href)
  if(result.length>=10)break
 }
 return result
}
export async function mapPublicSite(input,{
 fetcher=(url,allowed)=>safeFetchSource(url,{allowRedirect:allowed}),
 maxPages=PAGES,maxRequests=REQUESTS,maxMs=18000,now=()=>Date.now()
}={}){
 const origin=validateSourceUrl(input)
 const scope=siteScopeHost(origin.href)
 if(['youtube.com','youtu.be','www.youtube.com','m.youtube.com'].includes(origin.hostname))throw new SourceImportError('site_map_not_supported')
 const start=normalizeSitePage(origin.href,scope)
 if(!start)throw new SourceImportError('invalid_source_url')
 const allowed=url=>scopeContains(scope,url.hostname.toLowerCase())
 const pages=new Map(),seenTasks=new Set(),tasks=[],errors=[]
 let totalRequests=0,truncated=false,checkedSitemaps=0
 const add=(item,depth=0)=>{
  const u=normalizeSitePage(item.url,scope)
  if(!u)return false
  if(pages.has(u)){
   if(pages.get(u).source==='sitemap'&&item.source==='link')pages.set(u,{...pages.get(u),title:item.title||pages.get(u).title,source:'link'})
   return false
  }
  if(pages.size>=maxPages){truncated=true;return false}
  pages.set(u,{url:u,title:clean(item.title)||titleFromUrl(u),host:new URL(u).hostname,section:new URL(u).pathname.split('/').filter(Boolean)[0]||'Início',source:item.source||'link',depth})
  return true
 }
 const enqueue=(type,url,depth=0)=>{
  if(totalRequests+tasks.length>=maxRequests*3)return
  let u
  try{u=validateSourceUrl(url)}catch{return}
  if(!allowed(u)||seenTasks.has(u.href))return
  if(type==='page'&&!normalizeSitePage(u.href,scope))return
  seenTasks.add(u.href);tasks.push({type,url:u.href,depth})
 }
 add({url:start,title:'Página inicial',source:'inicio'})
 enqueue('page',start,0)
 // From a subdomain, include the parent domain. Never discover unrelated sites.
 if(origin.hostname!==scope){const root='https://'+scope+'/';add({url:root,title:'Site principal',source:'inicio'});enqueue('page',root,0)}
 enqueue('robots','https://'+scope+'/robots.txt')
 enqueue('sitemap','https://'+scope+'/sitemap.xml')
 enqueue('sitemap','https://'+scope+'/sitemap_index.xml')
 const started=now()
 for(let index=0;index<tasks.length&&totalRequests<maxRequests;index++){
  if(now()-started>maxMs){truncated=true;break}
  const task=tasks[index]
  totalRequests++
  let response
  try{response=await fetcher(task.url,allowed)}
  catch(e){if(task.type==='page'&&task.depth===0&&task.url===start)throw e;errors.push(task.type);continue}
  const body=String(response?.body||'')
  if(task.type==='robots'){
   for(const xml of parseRobotSitemaps(body,task.url,scope))enqueue('sitemap',xml)
   continue
  }
  if(task.type==='sitemap'){
   checkedSitemaps++
   const found=parseSitemap(body,task.url,scope)
   for(const item of found.pages)add(item)
   for(const xml of found.indexes)if(checkedSitemaps+tasks.filter(x=>x.type==='sitemap').length<8)enqueue('sitemap',xml)
   continue
  }
  if(!body||!/<(?:html|body|main|a)\b/i.test(body))continue
  try{
   const title=extractPublicPage(body).title
   const old=pages.get(task.url)
   if(old)pages.set(task.url,{...old,title:title||old.title})
  }catch{}
  const discovered=extractHtmlLinks(body,task.url,scope)
  for(const item of discovered){
   const fresh=add(item,task.depth+1)
   // Crawl only a handful of pages on the submitted host. Other subdomains
   // are discovered but never fetched without explicit user selection.
   if(fresh&&task.depth<DEPTH&&new URL(item.url).hostname===origin.hostname&&tasks.filter(x=>x.type==='page').length<6)enqueue('page',item.url,task.depth+1)
  }
 }
 if(indexPlaceholder(tasks,totalRequests))truncated=true
 return {scope,root:start,pages:[...pages.values()],requests:totalRequests,limit:maxPages,truncated,errors:errors.length,monitoring:false,publication:false}
}
function indexPlaceholder(tasks,total){return total<tasks.length}
