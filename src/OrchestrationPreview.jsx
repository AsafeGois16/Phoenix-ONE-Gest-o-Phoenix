import React,{useState} from 'react'
import {ArrowRight,Settings2,ShieldCheck,FlaskConical,RefreshCcw,Send} from 'lucide-react'
import {MODES,DEFAULT_MODE,TARGETS,readPreviewMode,savePreviewMode,newPreviewProtocol,previewDecision} from '../server/orchestration-preview.js'
import './orchestration-preview.css'

const label=mode=>mode===MODES.CLARA_ONLY?'Somente Clara':'Clara + Murilo'
const samples=[
 'Gostaria de cotar um seguro para meu carro.',
 'Quero contratar um plano de saúde empresarial.',
 'Quero uma cotação.',
 'Seguro de vida.',
 'Posso falar com o comercial de Seguro Residencial?',
 'Preciso excluir minha esposa do plano odontológico.',
 'Preciso de uma segunda via do boleto.',
 'Houve um princípio de incêndio na minha residência.',
 'Sim','Não'
]
const decisions={
 ask_product:'Identificação do produto',offer_human:'Aguardando aceite para o comercial humano',
 offer_murilo:'Aguardando aceite para Murilo',propose_handoff:'Proposta de encaminhamento — não executada',
 murilo_qualification:'Qualificação comercial — simulação',existing_service:'Fluxo operacional preservado',
 safety_first:'Segurança / urgência',declined:'Encaminhamento recusado',wait_for_consent:'Aguardando confirmação',
 clara_service:'Atendimento inicial',new_topic:'Novo assunto',protocol_closed:'Protocolo de simulação encerrado',no_message:'Sem mensagem'
}
function storage(){try{return window.localStorage}catch{return null}}
export default function OrchestrationPreview(){
 const [mode,setMode]=useState(()=>readPreviewMode(storage()))
 const [protocol,setProtocol]=useState(()=>newPreviewProtocol(readPreviewMode(storage())))
 const [history,setHistory]=useState([])
 const [message,setMessage]=useState('')
 const [saved,setSaved]=useState('')
 const [last,setLast]=useState(null)
 function change(next){
  setMode(next)
  setSaved(savePreviewMode(storage(),next)?'Preferência salva neste navegador.':'Preferência temporária: armazenamento indisponível.')
 }
 function reset(){
  setProtocol(newPreviewProtocol(mode));setHistory([]);setLast(null);setMessage('')
 }
 function simulate(e){
  e.preventDefault()
  const text=message.trim()
  if(!text)return
  const decision=previewDecision(protocol,text)
  setProtocol(decision.state);setLast(decision)
  setHistory(h=>[...h.slice(-9),{text,decision}]);setMessage('')
 }
 return <div className="ops-stack orch">
  <div className="ops-heading"><div><h2>Orquestração de agentes</h2><p>Escolha e homologue a estratégia de relacionamento da Phoenix ONE.</p></div><span className="ops-tag warn"><FlaskConical size={14}/> Prévia isolada</span></div>
  <div className="orch-notice"><ShieldCheck size={21}/><div><b>Ambiente de simulação — sem impacto operacional</b><p>Nenhuma chamada ao Junior, ao modelo ou ao Supabase é executada por este módulo. Use somente dados fictícios. Os setores abaixo são destinos lógicos a validar.</p></div></div>
  <section className="ops-paper">
   <div className="orch-section"><Settings2 size={20}/><div><h3>Modo para novos protocolos</h3><p>Clara + Murilo é o padrão. O protocolo de teste em andamento não muda automaticamente.</p></div></div>
   <fieldset className="orch-mode-grid"><legend>Estratégia de atendimento</legend>
    {Object.values(MODES).map(m=><label key={m} className={'orch-mode '+(mode===m?'selected':'')}><input type="radio" name="orchestration-mode" checked={mode===m} onChange={()=>change(m)}/><span><b>{label(m)}</b><small>{m===MODES.CLARA_ONLY?'Identificação do produto e passagem ao comercial humano.':'Fluxo atual com qualificação comercial pelo Murilo.'}</small></span>{m===DEFAULT_MODE&&<span className="orch-default">Padrão</span>}</label>)}
   </fieldset>
   <div className="orch-save" role="status">{saved||'A escolha é persistida apenas neste navegador, não nos sistemas de produção.'}</div>
   {mode!==protocol.mode&&<p className="orch-pending">Alteração disponível para o próximo protocolo fictício. A simulação atual permanece em {label(protocol.mode)}.</p>}
   <div className="orch-flow"><span>Clara V12</span><ArrowRight size={16}/>{mode===MODES.CLARA_MURILO&&<><span>Murilo V9</span><ArrowRight size={16}/></>}<span>Comercial humano</span></div>
  </section>
  <section className="ops-paper">
   <div className="orch-section"><FlaskConical size={20}/><div><h3>Simulador de roteamento</h3><p>Protocolo fictício em {label(protocol.mode)}. O resultado é apenas uma proposta; não existe envio ou atribuição real.</p></div><button type="button" className="orch-secondary" onClick={reset}><RefreshCcw size={15}/> Novo protocolo</button></div>
   <div className="orch-chips" aria-label="Mensagens de teste">{samples.map(t=><button type="button" key={t} onClick={()=>setMessage(t)}>{t}</button>)}</div>
   <form className="orch-form" onSubmit={simulate}><label htmlFor="orch-message">Mensagem de teste</label><textarea id="orch-message" rows={3} maxLength={500} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ex.: Quero cotar um plano de saúde empresarial."/><button type="submit" className="orch-primary" disabled={!message.trim()}><Send size={15}/> Simular mensagem</button></form>
   {last&&<div className="orch-result" role="status"><b>{decisions[last.decision]||last.decision}</b><div className="orch-result-grid"><div><small>Agente</small><strong>{last.agent==='murilo'?'Murilo':'Clara'}</strong></div><div><small>Produto</small><strong>{last.state.product||'Não definido'}</strong></div><div><small>Destino lógico</small><strong>{TARGETS[last.proposedTarget]||'Sem transferência'}</strong></div></div><p>{last.reply}</p><small>Transferência real: não executada.</small></div>}
   {history.length>0&&<div className="orch-history"><h4>Histórico local da simulação</h4>{history.map((h,i)=><div key={i}><small>Cliente fictício</small><p>{h.text}</p><small>{h.decision.agent==='clara'?'Clara':'Murilo'} · {decisions[h.decision.decision]||h.decision.decision}</small><p>{h.decision.reply}</p></div>)}</div>}
  </section>
  <section className="ops-paper"><h3>Limites da Fase 1</h3><p>Prompts e RAGs intocados. A opção Somente Clara não faz a qualificação do Murilo. A vinculação das filas reais, configuração central e ativação da API operacional ficam para uma próxima fase, após homologação.</p></section>
 </div>
}
