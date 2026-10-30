import React,{useCallback,useEffect,useMemo,useState} from 'react'
import {BrainCircuit,RefreshCcw,ShieldCheck,History,ArrowLeftRight,Search,LockKeyhole,Database,Clock3} from 'lucide-react'
import './megabrain.css'
import MegaBrainContext from './MegaBrainContext.jsx'
import MegaBrainSandbox from './MegaBrainSandbox.jsx'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const endpoint=url?url+'/functions/v1/phoenix-one-megabrain':''
const safeLabel=(value)=>String(value||'—')
const dateLabel=value=>{
 if(!value)return '—'
 const d=new Date(value)
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
}
const stageLabel={with_agent:'Com agente',assigned:'Com atendente humano',resolved:'Encerrado',queued:'Em fila'}
const intentLabel={sales:'Comercial',service:'Atendimento',neutral:'Não definida'}
const agentLabel={clara:'Clara Concierge',murilo:'Murilo SDR'}
function Metric({label,value,Icon}){
 return <div className="mb-metric"><Icon size={19}/><strong>{Number(value||0)}</strong><span>{label}</span></div>
}
export default function MegaBrain({session}){
 const [snapshot,setSnapshot]=useState(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [filter,setFilter]=useState('all')
 const [agent,setAgent]=useState('all')
 const [search,setSearch]=useState('')
 const [selected,setSelected]=useState(null)
 const [testMode,setTestMode]=useState(false)
 const load=useCallback(async()=>{
  if(!session?.access_token||!endpoint){setError('Sessão ou conexão não disponível.');setLoading(false);return}
  setLoading(true);setError('')
  try{
   const response=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{
    Authorization:'Bearer '+session.access_token,apikey:key,'Content-Type':'application/json'
   },body:JSON.stringify({action:'snapshot'})})
   const data=await response.json().catch(()=>({}))
   if(!response.ok)throw Error(data.error==='megabrain_admin_only'?'Esta área é exclusiva para administradores do Phoenix ONE.':'Não foi possível consultar a memória neste momento.')
   if(!data.readonly||data.version!=='megabrain-v1'||!Array.isArray(data.protocols))throw Error('Resposta inesperada da consulta de memória.')
   setSnapshot(data)
  }catch(e){setError(e.message||'Falha na consulta.')}finally{setLoading(false)}
 },[session?.access_token])
 useEffect(()=>{load()},[load])
 const protocols=useMemo(()=> (snapshot?.protocols||[]).filter(p=>
  (filter==='all'||p.stage===filter)&&
  (agent==='all'||p.agent===agent)&&
  (!search.trim()||safeLabel(p.protocolo).toLowerCase().includes(search.trim().toLowerCase()))
 ),[snapshot,filter,agent,search])
 const detail=selected?protocols.find(p=>p.protocolo===selected):null
 return <div className="ops-stack mb-root">
  <section className="mb-hero">
   <div className="mb-hero-icon"><BrainCircuit size={32}/></div>
   <div className="mb-hero-copy">
    <span className="mb-eyebrow">PHOENIX ONE · INTELIGÊNCIA COMPARTILHADA</span>
    <h2>MegaBrain <span>V2 · Observação</span></h2>
    <p>Visão unificada do estado dos protocolos entre Clara e Murilo, sem interferir nas respostas, no WhatsApp ou no sistema do Junior.</p>
   </div>
   <div className="mb-hero-badge"><ShieldCheck size={15}/> Somente leitura</div>
  </section>
  <div className="mb-test-controls">
   <div><strong>Homologação do MegaBrain</strong><p>Execute casos fictícios antes de liberar qualquer observação de atendimentos reais.</p></div>
   <button type="button" className="mb-test-toggle" onClick={()=>setTestMode(x=>!x)} aria-expanded={testMode}>{testMode?'Encerrar modo de teste':'Ativar modo de teste'}</button>
  </div>
  {testMode&&<MegaBrainSandbox onClose={()=>setTestMode(false)}/>}
  <div className="mb-metrics">
   <Metric Icon={Database} label="Protocolos válidos" value={snapshot?.counts?.total}/>
   <Metric Icon={BrainCircuit} label="Com agente" value={snapshot?.counts?.with_agent}/>
   <Metric Icon={ArrowLeftRight} label="Em atendimento humano" value={snapshot?.counts?.assigned}/>
   <Metric Icon={History} label="Encerrados" value={snapshot?.counts?.resolved}/>
  </div>
  <div className="mb-panel">
   <div className="mb-panel-head">
    <div><h3>Memória operacional de protocolos</h3><p>Dados existentes na memória privada do Phoenix ONE. Nenhuma mensagem ou informação pessoal é copiada.</p></div>
    <button className="ops-btn secondary" onClick={load} disabled={loading}><RefreshCcw size={16}/> {loading?'Consultando...':'Atualizar'}</button>
   </div>
   <div className="mb-filters">
    <label className="mb-search"><Search size={16}/><input aria-label="Filtrar protocolo" placeholder="Buscar protocolo" value={search} onChange={e=>setSearch(e.target.value)} maxLength={40}/></label>
    <label><span>Etapa</span><select aria-label="Filtrar etapa" value={filter} onChange={e=>{setFilter(e.target.value);setSelected(null)}}><option value="all">Todas as etapas</option><option value="with_agent">Com agente</option><option value="assigned">Com humano</option><option value="resolved">Encerrados</option><option value="queued">Em fila</option></select></label>
    <label><span>Agente</span><select aria-label="Filtrar agente" value={agent} onChange={e=>{setAgent(e.target.value);setSelected(null)}}><option value="all">Ambos os agentes</option><option value="clara">Clara</option><option value="murilo">Murilo</option></select></label>
   </div>
   {error&&<div className="mb-error" role="alert"><LockKeyhole size={17}/>{error}</div>}
   {!error&&(loading&&!snapshot?<div className="mb-empty">Consultando a memória existente...</div>:
    protocols.length?<div className="mb-list">
     <div className="mb-table-head"><span>Protocolo</span><span>Agente</span><span>Intenção</span><span>Etapa</span><span>Última atualização</span></div>
     {protocols.map(p=><button className={'mb-item '+(selected===p.protocolo?'active':'')} key={p.protocolo} onClick={()=>setSelected(selected===p.protocolo?null:p.protocolo)}>
      <strong>{safeLabel(p.protocolo)}</strong><span>{agentLabel[p.agent]||'Não definido'}</span><span>{intentLabel[p.intent]||'Não definida'}</span><span className={'mb-status '+safeLabel(p.stage)}>{stageLabel[p.stage]||safeLabel(p.stage)}</span><span>{dateLabel(p.updated_at)}</span>
     </button>)}
    </div>:<div className="mb-empty">Nenhum protocolo corresponde aos filtros selecionados.</div>)}
   {detail&&<div className="mb-detail">
    <div className="mb-detail-head"><strong>Estado do protocolo {safeLabel(detail.protocolo)}</strong><button type="button" onClick={()=>setSelected(null)} aria-label="Fechar detalhes">Fechar</button></div>
    <div className="mb-detail-grid">
     <div><small>Agente atual</small><b>{agentLabel[detail.agent]||'Não definido'}</b></div>
     <div><small>Intenção registrada</small><b>{intentLabel[detail.intent]||'Não definida'}</b></div>
     <div><small>Clara já se apresentou</small><b>{detail.clara_apresentada?'Sim':'Ainda não registrada'}</b></div>
     <div><small>Murilo já se apresentou</small><b>{detail.murilo_apresentado?'Sim':'Ainda não registrada'}</b></div>
     <div><small>Último evento</small><b>{dateLabel(detail.last_event_at)}</b></div>
     <div><small>Expiração da memória</small><b>{dateLabel(detail.expires_at)}</b></div>
    </div>
    <p>Este painel não confirma a identidade do cliente nem mostra o conteúdo das conversas. O histórico integral permanece sob responsabilidade do Junior.</p>
    <MegaBrainContext session={session} protocolo={detail.protocolo} onRefreshProtocol={load}/>
   </div>}
   {snapshot&&!error&&<div className="mb-sync"><Clock3 size={14}/> Última consulta: {dateLabel(snapshot.fetched_at)} · até 60 protocolos recentes e não expirados</div>}
  </div>
  <div className="mb-info">
   <ShieldCheck size={20}/>
   <div><strong>Observação sem interferência</strong><p>O MegaBrain V1 não modifica a memória, não altera a escolha do agente, não envia mensagens e não transfere tickets. A futura memória contextual compartilhada será uma evolução separada e testada.</p></div>
  </div>
 </div>
}
