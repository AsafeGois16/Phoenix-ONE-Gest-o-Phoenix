import React,{useMemo,useState} from 'react'
import {Activity,CheckCircle2,Download,FlaskConical,Play,ShieldCheck,XCircle} from 'lucide-react'
import {UNIVERSAL_SCENARIOS,UNIVERSAL_GROUPS,runUniversalScenario,runUniversalSuite,qaReportText} from '../server/megabrain-universal-qa.js'
import './megabrain-universal-lab.css'

/**
 * UI is an offline test viewer. No customer history, protocol IDs,
 * Supabase queries, LLM calls or changes to live agent behavior.
 */
export default function MegaBrainUniversalLab(){
 const [group,setGroup]=useState('Todos')
 const [choice,setChoice]=useState(UNIVERSAL_SCENARIOS[0].id)
 const [single,setSingle]=useState(null)
 const [report,setReport]=useState(null)
 const [notice,setNotice]=useState('')
 const visible=useMemo(()=>UNIVERSAL_SCENARIOS.filter(s=>group==='Todos'||s.group===group),[group])
 const item=UNIVERSAL_SCENARIOS.find(s=>s.id===choice)||UNIVERSAL_SCENARIOS[0]
 const outcome=report?.scenarios.find(s=>s.id===choice)||(single?.id===choice?single:null)
 const metrics=report||((single?.id===choice)?{scenarioCount:1,passed:single.passed,total:single.total,failed:single.total-single.passed,score:single.total?Math.round(single.passed/single.total*100):0}:null)
 const executeOne=()=>{
  setSingle(runUniversalScenario(item.id));setReport(null);setNotice('')
 }
 const executeAll=()=>{
  const all=runUniversalSuite();setReport(all);setSingle(null);setNotice('')
 }
 const download=()=>{
  const data=report||runUniversalSuite(single?[single.id]:[])
  if(!data.scenarioCount)return
  const blob=new Blob([qaReportText(data)],{type:'text/plain;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download='phoenix-one-laboratorio-v41-relatorio.txt'
  document.body.appendChild(a);a.click();a.remove()
  URL.revokeObjectURL(url)
  setNotice('Relatório de simulação gerado com sucesso.')
 }
 const onGroup=value=>{
  setGroup(value)
  const first=UNIVERSAL_SCENARIOS.find(s=>value==='Todos'||s.group===value)
  if(first)setChoice(first.id)
 }
 return <div className="mbl-root" aria-label="Laboratório Universal V4.1">
  <div className="mbl-intro">
   <div className="mbl-intro-icon"><FlaskConical size={20}/></div>
   <div><strong>Laboratório Universal V4.1</strong>
    <p>Cenários de atendimento, cotação, permissões e continuidade entre Clara e Murilo.</p>
   </div>
  </div>
  <div className="mbl-warning"><ShieldCheck size={17}/>
   <span><strong>Ambiente fictício, sem conexão com clientes.</strong> Testa regras determinísticas do código atual; não executa o modelo de IA, não chama APIs e não substitui a homologação com o Junior.</span>
  </div>
  <div className="mbl-toolbar">
   <label htmlFor="mbl-group">Categoria
    <select id="mbl-group" value={group} onChange={e=>onGroup(e.target.value)}>
     {UNIVERSAL_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
    </select>
   </label>
   <button type="button" className="mbl-runall" onClick={executeAll}><Activity size={15}/> Executar todos os cenários</button>
  </div>
  {metrics&&<div className="mbl-metrics" aria-live="polite">
   <div><small>Cenários avaliados</small><strong>{metrics.scenarioCount}</strong></div>
   <div><small>Verificações aprovadas</small><strong>{metrics.passed}/{metrics.total}</strong></div>
   <div><small>Falhas encontradas</small><strong>{metrics.failed}</strong></div>
   <div><small>Taxa de aprovação local</small><strong>{metrics.score}%</strong></div>
  </div>}
  <div className="mbl-layout">
   <div className="mbl-cases" aria-label="Cenários fictícios">
    {visible.map(s=>{
     const checked=report?.scenarios.find(x=>x.id===s.id)||(single?.id===s.id?single:null)
     return <button type="button" key={s.id} className={'mbl-case '+(choice===s.id?'selected':'')}
      aria-pressed={choice===s.id} onClick={()=>setChoice(s.id)}>
      <span className="mbl-case-top"><strong>{s.title}</strong>
       {checked?(checked.ok?<CheckCircle2 size={16} className="mbl-good"/>:<XCircle size={16} className="mbl-bad"/>):null}
      </span>
      <span>{s.group} · {s.agent}</span>
     </button>
    })}
   </div>
   <div className="mbl-detail">
    <div className="mbl-heading"><div><span className="mbl-eyebrow">{item.group} · {item.product}</span><h3>{item.title}</h3><p>{item.objective}</p></div></div>
    <div className="mbl-dialogue">
     <div className="mbl-subtitle">Roteiro de conversa fictícia</div>
     {item.dialogue.map(([speaker,text],i)=><div className="mbl-line" key={i}>
      <span className={'mbl-avatar '+(speaker==='Cliente'?'client':speaker==='Clara'?'clara':speaker==='Murilo'?'murilo':'system')}>{speaker.slice(0,1)}</span>
      <div><b>{speaker}</b><p>{text}</p></div>
     </div>)}
    </div>
    <div className="mbl-actions">
     <button type="button" className="mbl-run" onClick={executeOne}><Play size={15}/> Executar cenário</button>
     {(report||single)&&<button type="button" className="mbl-download" onClick={download}><Download size={15}/> Baixar relatório TXT</button>}
    </div>
    {outcome&&<div className="mbl-results" aria-live="polite">
     <div className="mbl-result-head">
      <strong>Resultado: {outcome.ok?'Aprovado':'Falhas identificadas'}</strong>
      <span>{outcome.passed} de {outcome.total} verificações</span>
     </div>
     {outcome.checks.map((c,i)=><div className="mbl-check" key={i}>
      {c.pass?<CheckCircle2 size={16} className="mbl-good"/>:<XCircle size={16} className="mbl-bad"/>}
      <div><strong>{c.name}</strong>{c.detail&&<small>{c.detail}</small>}</div>
     </div>)}
    </div>}
   </div>
  </div>
  {notice&&<p className="mbl-note" role="status">{notice}</p>}
  <p className="mbl-footer">O resultado mostra verificações automatizadas locais, não a qualidade de respostas produzidas por IA em conversas reais. Cenários com falhas ficam visíveis para revisão do código e regressão. Os dados são fictícios e não são armazenados.</p>
 </div>
}
