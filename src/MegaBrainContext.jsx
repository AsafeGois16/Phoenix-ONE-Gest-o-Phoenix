import React,{useEffect,useState} from 'react'
import {BrainCircuit,ShieldCheck,AlertCircle,RefreshCcw} from 'lucide-react'
import './megabrain-context.css'
import MegaBrainProtocolControl from './MegaBrainProtocolControl.jsx'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const endpoint=url?url+'/functions/v1/phoenix-one-megabrain-context':''
const topics={cotacao:'Cotação de seguro',inclusao:'Inclusão de beneficiário',exclusao:'Exclusão de beneficiário',boleto:'Boleto ou fatura',reembolso:'Reembolso',sinistro:'Sinistro ou assistência',rede_credenciada:'Rede credenciada',alteracao_cadastral:'Alteração cadastral',consulta_apolices:'Consulta de apólices',coberturas:'Consulta de coberturas',assistencia:'Assistência e serviços',nao_identificado:'Não identificado'}
const subtopics={guincho:'Guincho / reboque',nao_identificado:'Não identificado'}
const products={odontologico:'Odontológico',saude:'Saúde',vida:'Vida',auto:'Automóvel',residencial:'Residencial',empresarial:'Empresarial',viagem:'Viagem',nao_identificado:'Não identificado'}
const nextSteps={acompanhar_encaminhamento:'Encaminhamento proposto; aguardar confirmação do sistema',validar_titular:'Solicitar validação de titular pela gestão',aguardar_cliente:'Aguardar resposta do cliente',continuar_atendimento:'Continuar triagem conforme jornada'}
const pendings={encaminhamento_proposto:'Encaminhamento proposto',validacao_pendente:'Validação pendente',resposta_pendente:'Resposta do cliente pendente',nao_identificada:'Sem pendência reconhecida'}
const facts={assunto_identificado:'Assunto identificado',produto_mencionado:'Produto mencionado'}
export default function MegaBrainContext({session,protocolo,onRefreshProtocol}){
 const [data,setData]=useState(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [refresh,setRefresh]=useState(0)
 useEffect(()=>{
  let live=true
  async function load(){
   setLoading(true);setError('');setData(null)
   if(!session?.access_token||!endpoint){setLoading(false);setError('Consulta indisponível.');return}
   try{
    const r=await fetch(endpoint,{method:'POST',cache:'no-store',
      headers:{Authorization:'Bearer '+session.access_token,apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({action:'snapshot'})})
    const result=await r.json().catch(()=>null)
    if(!r.ok||!result||result.version!=='megabrain-v2-shadow'||!Array.isArray(result.observations))throw Error('A consulta contextual está indisponível.')
    if(live)setData(result.observations.find(p=>p.protocolo===protocolo)||null)
   }catch(e){if(live)setError(e.message||'Falha na consulta.')}
   finally{if(live)setLoading(false)}
  }
  load()
  return()=>{live=false}
 },[session?.access_token,protocolo,refresh])
 return <section className="mbc-section" aria-label="MegaBrain memória contextual">
  <div className="mbc-head">
   <div><BrainCircuit size={17}/><strong>Contexto compartilhado — V2 observação</strong></div>
   <button type="button" onClick={()=>{setRefresh(x=>x+1);onRefreshProtocol?.()}} disabled={loading} title="Atualizar contexto"><RefreshCcw size={14}/> Atualizar</button>
  </div>
  {loading?<p className="mbc-muted">Consultando o contexto seguro...</p>:
   error?<p className="mbc-error"><AlertCircle size={15}/>{error} O atendimento atual permanece independente deste recurso.</p>:
   !data?<p className="mbc-muted">Ainda não existe observação contextual para este protocolo. A captura está em homologação e não modifica a atuação dos agentes.</p>:
   <>
    <div className="mbc-grid">
     <div><small>Assunto reconhecido</small><strong>{topics[data.topic]||'Não identificado'}</strong></div>
     {data.subtopic&&data.subtopic!=='nao_identificado'&&<div><small>Subassunto</small><strong>{subtopics[data.subtopic]||'Não identificado'}</strong></div>}
     <div><small>Produto citado</small><strong>{products[data.product]||'Não identificado'}</strong></div>
     <div><small>Pendência sugerida</small><strong>{pendings[data.pending]||'Não identificada'}</strong></div>
     <div><small>Próximo passo sugerido</small><strong>{nextSteps[data.next_step]||'Ainda não identificado'}</strong></div>
    </div>
    <div className="mbc-facts">
     <small>Informações reconhecidas (não verificadas)</small>
     <div>{(data.facts||[]).map(x=><span key={x}>{facts[x]||x}</span>)}</div>
    </div>
    <p className="mbc-muted">Classificação inferida a partir da conversa, não é confirmação de identidade, contrato, procedimento ou execução. Nenhum texto integral ou dado pessoal é armazenado aqui.</p>
   </>}
  <MegaBrainProtocolControl session={session} protocolo={protocolo}/>
  <div className="mbc-foot"><ShieldCheck size={14}/> Visível apenas a administradores · não influencia as respostas de Clara e Murilo</div>
 </section>
}
