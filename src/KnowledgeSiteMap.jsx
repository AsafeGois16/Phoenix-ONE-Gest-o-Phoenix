import React,{useMemo,useState} from 'react'
import {CheckCircle2,ChevronLeft,ChevronRight,ExternalLink,FolderTree,Globe,Link2,RefreshCcw,ShieldCheck,X} from 'lucide-react'
const SELECT_LIMIT=12
const TYPES=['clara','murilo','grazy_copy']
const LABELS={clara:'Clara',murilo:'Murilo',grazy_copy:'Grazy Copy'}
const errorText={
 invalid_source_url:'Informe uma URL HTTPS pública válida.',
 source_https_required:'Use um endereço HTTPS.',
 source_host_not_allowed:'Domínio não permitido ou endereço de rede privada.',
 site_map_not_supported:'O mapeamento é para sites; use Importar site ou vídeo para YouTube.',
 source_http_unavailable:'O site não permitiu consultar essa página.',
 source_unavailable:'Não foi possível consultar o site.',
 source_timeout:'Tempo de resposta do site excedido.',
 site_map_unavailable:'Não foi possível mapear o site. Tente uma área específica.',
 source_no_extractable_text:'Página sem texto suficiente para importar.',
 forbidden:'Sem permissão para cadastrar conhecimento.',
 video_captions_unavailable:'Legendas inacessíveis.',
 document_too_large:'Conteúdo extenso demais; revise e reduza o texto.',
 invalid_document:'Revise os campos e o texto antes de cadastrar.'
}
const message=e=>errorText[e]||e||'Falha na operação.'
const Btn=({children,onClick,disabled=false,primary=false,type='button'})=>
 <button className={'ops-btn '+(primary?'primary':'secondary')} type={type} disabled={disabled} onClick={onClick}>{children}</button>
async function post(url,accessToken,data){
 const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store'})
 const json=await res.json().catch(()=>({error:'invalid_response'}))
 if(!res.ok)throw Error(json.error||'operation_failed')
 return json
}
export default function KnowledgeSiteMap({session,call,refresh,onClose}){
 const [url,setUrl]=useState('https://phoenixseg.com.br/')
 const [map,setMap]=useState(null),[selected,setSelected]=useState([])
 const [phase,setPhase]=useState('map'),[drafts,setDrafts]=useState([]),[focus,setFocus]=useState(0)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('')
 const [failures,setFailures]=useState([]),[category,setCategory]=useState('Produtos')
 const [sensitivity,setSensitivity]=useState('internal'),[agents,setAgents]=useState(['clara'])
 const grouped=useMemo(()=>{
  const result={}
  for(const p of (map?.pages||[])){
   const key=p.host+' · '+p.section
   if(!result[key])result[key]=[]
   result[key].push(p)
  }
  return result
 },[map])
 const mapIt=async e=>{
  e.preventDefault();if(busy)return
  setBusy(true);setError('');setMap(null);setDrafts([]);setSelected([]);setFailures([]);setPhase('map')
  try{
   const result=await post('/api/phoenix-map-site',session.access_token,{url:url.trim()})
   if(!result.reviewRequired||!Array.isArray(result.pages))throw Error('site_map_unavailable')
   setMap(result);setProgress(result.pages.length+' páginas públicas identificadas. Escolha até '+SELECT_LIMIT+' por lote.')
  }catch(e){setError(message(e.message))}finally{setBusy(false)}
 }
 const toggle=link=>setSelected(previous=>previous.includes(link)?previous.filter(x=>x!==link):previous.length<SELECT_LIMIT?[...previous,link]:previous)
 const prepare=async()=>{
  if(busy||!selected.length)return
  setBusy(true);setError('');setFailures([]);setProgress('Preparando conteúdo selecionado...')
  const chosen=(map?.pages||[]).filter(p=>selected.includes(p.url))
  const gathered=[],errs=[]
  for(let i=0;i<chosen.length;i++){
   const p=chosen[i]
   setProgress('Extraindo '+(i+1)+' de '+chosen.length+': '+p.title)
   try{
    const x=await post('/api/phoenix-import-source',session.access_token,{url:p.url})
    if(!x.reviewRequired||typeof x.content!=='string'||x.content.length<30)throw Error('source_import_unavailable')
    gathered.push({url:p.url,title:String(x.title||p.title).slice(0,180),content:x.content,selected:true,saved:false})
   }catch(e){errs.push({url:p.url,reason:message(e.message)})}
  }
  setDrafts(gathered);setFailures(errs);setFocus(0)
  if(gathered.length)setPhase('review')
  else setError('Nenhuma página pôde ser extraída. Tente outra seção ou links individuais.')
  setProgress(gathered.length+' página(s) preparadas para revisão. Nada foi salvo.')
  setBusy(false)
 }
 const updateDraft=change=>setDrafts(prev=>prev.map((d,i)=>i===focus?{...d,...change}:d))
 const save=async()=>{
  const pending=drafts.filter(d=>d.selected&&!d.saved)
  if(busy||!pending.length||!agents.length&&sensitivity!=='restricted')return
  if(!window.confirm('Cadastrar '+pending.length+' documento(s) no Supabase com status EM REVISÃO? Isso não publicará o conteúdo para os agentes.'))return
  setBusy(true);setError('');const next=[...drafts],errors=[]
  for(let i=0;i<next.length;i++){
   const d=next[i];if(!d.selected||d.saved)continue
   setProgress('Cadastrando '+d.title+' em revisão...')
   try{
    const result=await call('create_document',{title:d.title,content:d.content,category,sensitivity,agents:sensitivity==='restricted'?[]:agents})
    if(!result.created||result.status!=='review')throw Error('operation_failed')
    next[i]={...d,saved:true}
    setDrafts([...next])
   }catch(e){errors.push({url:d.url,reason:message(e.message)})}
  }
  setFailures(prev=>[...prev,...errors]);setBusy(false)
  setProgress(next.filter(d=>d.saved).length+' de '+next.length+' documentos cadastrados em revisão.')
  if(errors.length)setError(errors.length+' documento(s) não foram cadastrados. Revise e tente novamente.')
  try{await refresh()}catch{}
 }
 const remaining=drafts.filter(d=>d.selected&&!d.saved).length
 const done=drafts.filter(d=>d.saved).length
 return <div className="ops-modal-back">
  <div className="ops-modal" role="dialog" aria-modal="true" aria-label="Mapear site completo" style={{maxWidth:'1020px',width:'min(1020px,96vw)'}}>
   <div className="ops-modal-title"><h3><FolderTree size={19}/> Mapear site completo</h3><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={18}/></button></div>
   <div className="ops-scroll" style={{maxHeight:'65vh'}}>
    <p className="ops-muted">Descoberta pontual por links e sitemaps públicos, incluindo subdomínios vinculados ao mesmo domínio-base. Sem monitoramento, login ou publicação automática.</p>
    <form onSubmit={mapIt} className="ops-form-cols">
     <label>Endereço público HTTPS<input type="url" required value={url} onChange={e=>setUrl(e.target.value)} maxLength={2048} disabled={busy} placeholder="https://phoenixseg.com.br/"/></label>
     <div style={{display:'flex',alignItems:'end'}}><Btn type="submit" primary disabled={busy||!url.trim()}><Globe size={15}/> {busy?'Processando...':'Mapear páginas'}</Btn></div>
    </form>
    {error&&<p className="ops-notice" role="alert">{error}</p>}
    {progress&&<p className="ops-muted" role="status">{progress}</p>}
    {phase==='map'&&map&&<>
     <div className="ops-metrics">
      <div><strong>{map.pages.length}</strong><span>Endereços identificados</span></div>
      <div><strong>{Object.keys(grouped).length}</strong><span>Áreas / subdomínios</span></div>
      <div><strong>{selected.length}/{SELECT_LIMIT}</strong><span>Selecionados para este lote</span></div>
     </div>
     {map.truncated&&<p className="ops-notice">Mapeamento limitado por segurança. Para descobrir outras páginas, informe uma seção específica e execute outra busca.</p>}
     <p className="ops-muted">Domínio-base: {map.scope}. Páginas de outros domínios (por exemplo, outra marca ou outro TLD) não são incluídas automaticamente. URLs não listadas ou protegidas não podem ser descobertas com garantia.</p>
     <div className="ops-actions" style={{margin:'12px 0'}}>
      <Btn onClick={()=>setSelected(map.pages.slice(0,SELECT_LIMIT).map(p=>p.url))}>Selecionar primeiras {Math.min(map.pages.length,SELECT_LIMIT)}</Btn>
      <Btn onClick={()=>setSelected([])}>Limpar seleção</Btn>
     </div>
     <div style={{maxHeight:'350px',overflow:'auto',border:'1px solid var(--border, #dbe3ed)',borderRadius:'10px',padding:'10px'}}>
      {Object.entries(grouped).map(([section,pages])=><section key={section} style={{marginBottom:'14px'}}>
       <strong style={{display:'block',marginBottom:'6px'}}><FolderTree size={14} style={{verticalAlign:'middle',marginRight:6}}/>{section} ({pages.length})</strong>
       {pages.map(p=><label key={p.url} style={{display:'flex',alignItems:'start',gap:10,padding:'6px',cursor:'pointer',overflowWrap:'anywhere'}}>
        <input type="checkbox" checked={selected.includes(p.url)} disabled={!selected.includes(p.url)&&selected.length>=SELECT_LIMIT} onChange={()=>toggle(p.url)}/>
        <span><span style={{display:'block'}}>{p.title}</span><small style={{display:'block',opacity:0.75}}>{p.url} · {p.source}</small></span>
       </label>)}
      </section>)}
     </div>
     <div className="ops-info"><ShieldCheck size={17}/> As páginas selecionadas serão extraídas para prévia. Nenhum documento será salvo até você confirmar o cadastro.</div>
    </>}
    {phase==='review'&&drafts.length>0&&<>
     <div className="ops-metrics">
      <div><strong>{drafts.length}</strong><span>Prévias extraídas</span></div>
      <div><strong>{done}</strong><span>Em revisão no banco</span></div>
      <div><strong>{remaining}</strong><span>Aguardando cadastro</span></div>
     </div>
     <p className="ops-muted">Revise cada texto antes de cadastrar. Informações externas podem estar incompletas, desatualizadas ou incorretas. O status dos novos documentos será sempre EM REVISÃO.</p>
     <div className="ops-actions" style={{margin:'10px 0'}}>
      <Btn onClick={()=>setPhase('map')} disabled={busy}><ChevronLeft size={15}/> Voltar ao mapa</Btn>
      <Btn onClick={()=>setFocus(Math.max(0,focus-1))} disabled={focus===0||busy}><ChevronLeft size={15}/></Btn>
      <span>{focus+1} / {drafts.length}</span>
      <Btn onClick={()=>setFocus(Math.min(drafts.length-1,focus+1))} disabled={focus===drafts.length-1||busy}><ChevronRight size={15}/></Btn>
     </div>
     <label style={{display:'block',marginBottom:'8px'}}><input type="checkbox" checked={drafts[focus].selected} disabled={drafts[focus].saved||busy} onChange={e=>updateDraft({selected:e.target.checked})}/> Incluir esta página no cadastro {drafts[focus].saved?'· Já cadastrada em revisão':''}</label>
     <label>Título do documento<input value={drafts[focus].title} maxLength={180} disabled={drafts[focus].saved||busy} onChange={e=>updateDraft({title:e.target.value})}/></label>
     <p className="ops-muted"><Link2 size={14}/> {drafts[focus].url}</p>
     <label>Conteúdo extraído — editável<textarea rows={10} value={drafts[focus].content} disabled={drafts[focus].saved||busy} onChange={e=>updateDraft({content:e.target.value})}/></label>
     <div className="ops-form-cols">
      <label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}>{['Produtos','Operadoras','Institucional','Comercial / qualificação','Procedimentos','Documentos','Outros'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Sensibilidade<select value={sensitivity} onChange={e=>setSensitivity(e.target.value)} disabled={busy}><option value="internal">Interno</option><option value="public">Público</option><option value="restricted">Restrito (sem RAG)</option></select></label>
     </div>
     <div className="ops-checks">Agentes com acesso {TYPES.map(id=><label key={id}><input type="checkbox" disabled={sensitivity==='restricted'||busy} checked={agents.includes(id)&&sensitivity!=='restricted'} onChange={e=>setAgents(old=>e.target.checked?[...old,id]:old.filter(x=>x!==id))}/>{LABELS[id]}</label>)}</div>
     <div className="ops-info"><ShieldCheck size={17}/> Cadastro em revisão não disponibiliza conhecimento para Clara, Murilo ou Grazy Copy. A publicação exige a aprovação humana já existente.</div>
    </>}
    {failures.length>0&&<div className="ops-notice"><strong>{failures.length} página(s) com falha:</strong>{failures.slice(0,12).map((e,i)=><p key={i} style={{overflowWrap:'anywhere'}}>{e.url}: {e.reason}</p>)}</div>}
   </div>
   <div className="ops-modal-footer">
    <Btn onClick={onClose} disabled={busy}>Fechar</Btn>
    {phase==='map'&&map&&<Btn primary disabled={busy||selected.length===0} onClick={prepare}>Preparar {selected.length} página(s) para revisão</Btn>}
    {phase==='review'&&<Btn primary disabled={busy||!remaining} onClick={save}><CheckCircle2 size={15}/> Cadastrar {remaining} documento(s) em revisão</Btn>}
   </div>
  </div>
 </div>
}
