import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {siteScopeHost,scopeContains,normalizeSitePage,extractHtmlLinks,parseSitemap,parseRobotSitemaps,mapPublicSite} from '../server/knowledge-site-map.js'
import {safeFetchSource} from '../server/knowledge-source-import.js'
import handler from '../api/phoenix-map-site.js'
const root='https://phoenixseg.com.br/'
const home='<html><title>Phoenix Seguros</title><body><a href="/auto/">Seguro Auto</a><a href="/saude/">Plano de Saúde</a><a href="https://lp.phoenixseg.com.br/campanha/">Campanha</a><a href="https://outraempresa.com.br/">Externo</a><a href="/wp-admin/">Interno</a><a href="/manual.pdf">PDF</a><p>Informações institucionais sobre seguros e benefícios para empresas e famílias.</p></body></html>'
const page='<html><title>Área Phoenix</title><main><p>Informações públicas para clientes sobre produtos e serviços oferecidos pela corretora de seguros.</p></main></html>'
test('escopo registrável: .com.br, subdomínios e hospedagens compartilhadas',()=>{
 assert.equal(siteScopeHost('https://www.phoenixseg.com.br'),'phoenixseg.com.br')
 assert.equal(siteScopeHost('https://lp.phoenixseg.com.br'),'phoenixseg.com.br')
 assert.equal(siteScopeHost('https://cliente.github.io'),'cliente.github.io')
 assert.equal(siteScopeHost('https://cliente.vercel.app'),'cliente.vercel.app')
 assert.equal(scopeContains('phoenixseg.com.br','lp.phoenixseg.com.br'),true)
 assert.equal(scopeContains('phoenixseg.com.br','outra-phoenixseg.com.br'),false)
})
test('somente links públicos HTTPS do domínio autorizado',()=>{
 const pages=extractHtmlLinks(home,root,'phoenixseg.com.br')
 assert.deepEqual(pages.map(x=>x.url),[
  'https://phoenixseg.com.br/auto/','https://phoenixseg.com.br/saude/','https://lp.phoenixseg.com.br/campanha/'
 ])
 assert.equal(normalizeSitePage('https://phoenixseg.com.br/admin/','phoenixseg.com.br'),null)
 assert.equal(normalizeSitePage('https://phoenixseg.com.br/doc.pdf','phoenixseg.com.br'),null)
})
test('sitemaps e robots: limites de domínio',()=>{
 const index='<sitemapindex><sitemap><loc>https://phoenixseg.com.br/sitemap-1.xml</loc></sitemap><sitemap><loc>https://outro.com.br/p.xml</loc></sitemap></sitemapindex>'
 assert.deepEqual(parseSitemap(index,root,'phoenixseg.com.br').indexes,['https://phoenixseg.com.br/sitemap-1.xml'])
 const pages='<urlset><url><loc>https://lp.phoenixseg.com.br/novidade/</loc></url><url><loc>https://outro.com.br/</loc></url></urlset>'
 assert.deepEqual(parseSitemap(pages,root,'phoenixseg.com.br').pages.map(x=>x.url),['https://lp.phoenixseg.com.br/novidade/'])
 assert.deepEqual(parseRobotSitemaps('Sitemap: https://phoenixseg.com.br/wp-sitemap.xml',root,'phoenixseg.com.br'),['https://phoenixseg.com.br/wp-sitemap.xml'])
})
test('mapeia áreas, links e subdomínio relacionado sem gravar ou visitar terceiros',async()=>{
 const requests=[]
 const fetcher=async url=>{
  requests.push(url)
  if(url===root)return {body:home}
  if(url.endsWith('/robots.txt'))return {body:'Sitemap: https://phoenixseg.com.br/wp-sitemap.xml'}
  if(url.endsWith('wp-sitemap.xml'))return {body:'<urlset><url><loc>https://lp.phoenixseg.com.br/novidade/</loc></url></urlset>'}
  if(url.endsWith('sitemap.xml'))return {body:'<sitemapindex><sitemap><loc>https://phoenixseg.com.br/sitemap-1.xml</loc></sitemap></sitemapindex>'}
  if(url.endsWith('sitemap-1.xml'))return {body:'<urlset><url><loc>https://phoenixseg.com.br/vida/</loc></url></urlset>'}
  return {body:page}
 }
 const result=await mapPublicSite(root,{fetcher,maxMs:60000})
 for(const path of ['/auto/','/saude/','/vida/'])assert.ok(result.pages.some(x=>x.url===root.slice(0,-1)+path),path)
 assert.ok(result.pages.some(x=>x.host==='lp.phoenixseg.com.br'))
 assert.ok(requests.every(x=>new URL(x).hostname==='phoenixseg.com.br'))
 assert.ok(result.requests<=12)
 assert.equal(result.monitoring,false);assert.equal(result.publication,false)
})
test('mapeamento reverso inclui raiz ao começar de subdomínio',async()=>{
 const r=await mapPublicSite('https://lp.phoenixseg.com.br/',{fetcher:async url=>({body:url.endsWith('.xml')?'<urlset></urlset>':page}),maxMs:60000})
 assert.ok(r.pages.some(x=>x.url===root))
})
test('limita 80 endereços, sem loop de mapeamento',async()=>{
 const home='<html><title>Site</title>'+Array.from({length:190},(_,i)=>'<a href="/produto/'+i+'/">Produto '+i+'</a>').join('')+'</html>'
 const r=await mapPublicSite(root,{fetcher:async u=>({body:u===root?home:page}),maxMs:60000})
 assert.equal(r.pages.length,80);assert.equal(r.truncated,true);assert.ok(r.requests<=12)
})
test('redirecionamento externo não é seguido no mapeador',async()=>{
 let calls=0
 const request=(url,opts,onResponse)=>{
  calls++
  const req=new EventEmitter()
  req.end=()=>queueMicrotask(()=>{const res=new PassThrough();res.statusCode=302;res.headers={location:'https://outro.com.br/'};onResponse(res);res.end()})
  req.destroy=()=>{};return req
 }
 await assert.rejects(safeFetchSource(root,{resolver:async()=>[{address:'8.8.8.8',family:4}],request,allowRedirect:u=>scopeContains('phoenixseg.com.br',u.hostname)}),/source_out_of_scope/)
 assert.equal(calls,1)
})
test('API exige autenticação e não aceita GET',async()=>{
 const req={method:'GET',headers:{},body:{url:root}}
 const res={code:200,setHeader(){},status(n){this.code=n;return this},json(x){this.data=x;return x}}
 await handler(req,res);assert.equal(res.code,405)
})
test('UI exige revisão e confirmação antes de criar documentos',()=>{
 const ui=readFileSync(new URL('../src/KnowledgeSiteMap.jsx',import.meta.url),'utf8')
 const api=readFileSync(new URL('../api/phoenix-map-site.js',import.meta.url),'utf8')
 assert.match(ui,/SELECT_LIMIT=12/);assert.match(ui,/window.confirm/)
 assert.match(ui,/create_document/);assert.match(ui,/result.status!=='review'/)
 assert.doesNotMatch(api,/create_document|publish_document|insert into|setInterval/)
})
test('sitemap WordPress com declaração XML e stylesheet é indexado',()=>{
 const xml='<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="//phoenixseg.com.br/sitemap.xsl"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://phoenixseg.com.br/page-sitemap.xml</loc></sitemap></sitemapindex>'
 const r=parseSitemap(xml,root,'phoenixseg.com.br')
 assert.deepEqual(r.indexes,['https://phoenixseg.com.br/page-sitemap.xml'])
})
