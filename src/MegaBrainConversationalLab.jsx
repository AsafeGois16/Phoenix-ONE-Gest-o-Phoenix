import React,{useState} from 'react'
import {Bot,CheckCircle2,Download,MessageSquareText,Play,RotateCcw,ShieldCheck,TriangleAlert,XCircle} from 'lucide-react'
import {CONVERSATION_QA_SCENARIOS,CONVERSATION_QA_ISSUES,assessConversationQaAnswer,conversationQaMessages,conversationQaOverview,conversationalQaReportText} from '../server/megabrain-conversation-qa.js'
import './megabrain-conversation-qa.css'

const ERRORS={unauthorized:'Sessão expirada. Entre novamente no Phoenix ONE.',service_not_configured:'Laboratório RAG indisponível. Confira a configuração da API OpenAI.',model_timeout:'A geração demorou demais. Execute novamente este turno.',openai_rate_limited:'Limite de uso da API OpenAI atingido.',invalid_messages:'A conversa excedeu os limites do laboratório.',conversation_too_large:'O histórico ficou longo demais. Reinicie o cenário.',origin_not_allowed:'O teste por IA requer o endereço oficial do Phoenix ONE.',agent_prompt_not_available:'Prompt do agente não disponível no laboratório.',answer_unavailable:'Não foi possível consultar o modelo agora.',openai_error:'O provedor não concluiu o teste.'}
const chooser=s=>s.group+' · '+s.title
function downloadText(content){
 const blob=new Blob([content],{type:'text/plain;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const a=document.createElement('a')
 a.href=url;a.download='phoenix-one-laboratorio-conversacional-v42.txt'
 document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)
}
export default function MegaBrainConversationalLab({session}){
 const [choice,setChoice]=useState(CONVERSATION_QA_SCENARIOS[0].id)
 const [rows,setRows]=useState([])
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const selected=CONVERSATION_QA_SCENARIOS.find(s=>s.id===choice)||CONVERSATION_QA_SCENARIOS[0]
 const current=selected.turns[rows.length]
 const metrics=conversationQaOverview(rows)
 const ready=Boolean(session?.access_token)
 const reset=(id=choice)=>{setChoice(id);setRows([]);setError('');setNotice('')}
 const execute=async()=>{
  if(!ready||busy||!current)return
  setBusy(true);setError('');setNotice('')
  try{
   const history=rows.filter(x=>x.answer)
   const messages=conversationQaMessages(history,current.agent,current.user)
   if(!messages)throw Error('conversation_too_large')
   const result=await fetch('/api/phoenix-answer',{method:'POST',cache:'no-store',headers:{
    Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'
   },body:JSON.stringify({agent:current.agent,messages,qaMode:'v42'})})
   const payload=await result.json().catch(()=>({error:'answer_unavailable'}))
   if(!result.ok||typeof payload.answer!=='string'||!payload.answer.trim())throw Error(payload.error||'answer_unavailable')
   const evaluation=assessConversationQaAnswer({scenarioId:selected.id,turnIndex:rows.length,
    answer:payload.answer,agent:current.agent,previous:history})
   setRows(previous=>[...previous,{turnIndex:previous.length,agent:current.agent,user:current.user,answer:payload.answer,
    focus:current.focus,flags:evaluation.notes,review:null,promptVersion:payload.promptVersion??null}])
  }catch(e){setError(ERRORS[e.message]||'Falha ao gerar a resposta. Nenhum turno foi aprovado automaticamente.')}finally{setBusy(false)}
 }
 const review=(idx,value)=>{
  setRows(current=>current.map((r,i)=>i===idx?{...r,review:value,
   issue:value==='revise'?(r.issue||''):null,reviewNote:value==='revise'?(r.reviewNote||''):''}:r))
  setNotice('')
 }
 const updateReviewField=(idx,key,value)=>{
  setRows(current=>current.map((r,i)=>i===idx?{...r,[key]:value}:r))
  setNotice('')
 }
 const missingReason=rows.some(r=>r.review==='revise'&&!CONVERSATION_QA_ISSUES.some(x=>x.code===r.issue))
 const exportReport=()=>{
  if(!rows.length)return
  if(missingReason){setError('Escolha um motivo para cada resposta marcada como Precisa revisão antes de exportar.');return}
  setError('')
  downloadText(conversationalQaReportText(rows,selected))
  setNotice('Relatório de avaliação gerado. Ele não inclui mensagens nem dados pessoais.')
 }
 return <div className="mcq-root" aria-label="Laboratório Conversacional V4.2">
  <div className="mcq-head">
   <div className="mcq-head-icon"><MessageSquareText size={22}/></div>
   <div><strong>Laboratório Conversacional V4.2</strong>
    <p>Converse com os prompts de IA publicados usando roteiros fictícios. Cada turno usa o laboratório RAG autenticado.</p>
   </div>
  </div>
  <div className="mcq-note"><ShieldCheck size={17}/>
   <span><b>Sem clientes nem gestão do Junior.</b> As respostas são produzidas pela IA de laboratório, não pelo fluxo real do WhatsApp. A passagem Clara → Murilo abre sessão separada; não valida memória compartilhada. Cada chamada pode gerar custo de API.</span>
  </div>
  <div className="mcq-selection">
   <label htmlFor="mcq-case">Cenário de conversa fictício
    <select id="mcq-case" value={choice} disabled={busy} onChange={e=>reset(e.target.value)}>
     {CONVERSATION_QA_SCENARIOS.map(s=><option key={s.id} value={s.id}>{chooser(s)}</option>)}
    </select>
   </label>
   <button type="button" className="mcq-secondary" disabled={busy} onClick={()=>reset()}><RotateCcw size={15}/> Reiniciar</button>
  </div>
  <div className="mcq-objective"><b>Objetivo:</b> {selected.objective}</div>
  <div className="mcq-stats">
   <div><small>Turnos gerados</small><strong>{metrics.generated}/{selected.turns.length}</strong></div>
   <div><small>Aprovados por você</small><strong>{metrics.approved}</strong></div>
   <div><small>Revisão necessária</small><strong>{metrics.revise}</strong></div>
   <div><small>Alertas automáticos</small><strong>{metrics.flagged}</strong></div>
  </div>
  <div className="mcq-thread">
   {rows.map((turn,i)=><article className="mcq-turn" key={i}>
    <div className="mcq-turn-head"><b>Turno {i+1} · {turn.agent==='clara'?'Clara':'Murilo'}</b><span>Prompt publicado {turn.promptVersion?('v'+turn.promptVersion):'· versão não informada'}</span></div>
    <div className="mcq-bubble customer"><small>Cliente fictício</small><p>{turn.user}</p></div>
    <div className="mcq-bubble assistant"><small><Bot size={13}/> Resposta real do modelo · {turn.agent==='clara'?'Clara':'Murilo'}</small><p>{turn.answer}</p></div>
    <div className="mcq-evaluation"><b>O que conferir:</b><p>{turn.focus}</p>
     {turn.flags.length?
      <div className="mcq-flags"><TriangleAlert size={16}/><div>{turn.flags.map((f,k)=><p key={k}>{f}</p>)}</div></div>:
      <p className="mcq-clear">Nenhum alerta identificado pelas verificações heurísticas. Ainda é necessária revisão humana.</p>}
     <div className="mcq-review">
      <button type="button" aria-pressed={turn.review==='approved'} className={turn.review==='approved'?'selected good':''}
       onClick={()=>review(i,'approved')}><CheckCircle2 size={14}/> Aprovar resposta</button>
      <button type="button" aria-pressed={turn.review==='revise'} className={turn.review==='revise'?'selected bad':''}
       onClick={()=>review(i,'revise')}><XCircle size={14}/> Precisa revisão</button>
     </div>
     {turn.review==='revise'&&<div className="mcq-reason">
      <label htmlFor={'mcq-issue-'+i}>Por que esta resposta precisa de revisão?
       <select id={'mcq-issue-'+i} value={turn.issue||''}
        onChange={e=>updateReviewField(i,'issue',e.target.value)}>
        <option value="">Selecione o principal problema</option>
        {CONVERSATION_QA_ISSUES.map(option=><option key={option.code} value={option.code}>{option.label}</option>)}
       </select>
      </label>
      <label htmlFor={'mcq-note-'+i}>Observação objetiva (opcional, sem dados pessoais)
       <textarea id={'mcq-note-'+i} rows={2} maxLength={220} value={turn.reviewNote||''}
        placeholder="Ex.: Clara encaminhou sem confirmar se o cliente autorizava"
        onChange={e=>updateReviewField(i,'reviewNote',e.target.value)}/>
      </label>
      <p>O relatório incluirá apenas o motivo e esta observação resumida, nunca o texto completo da resposta.</p>
     </div>}
    </div>
   </article>)}
   {current&&<div className="mcq-next">
    <span>Próximo turno {rows.length+1}/{selected.turns.length} · {current.agent==='clara'?'Clara':'Murilo'}</span>
    {rows.length>0&&current.agent!==rows.at(-1)?.agent&&<p className="mcq-switch"><TriangleAlert size={15}/> Troca simulada de agente: uma nova conversa com o modelo começa sem histórico da Clara. Isto não testa o comprovante de identidade.</p>}
    <div className="mcq-bubble customer"><small>Mensagem fictícia que será enviada ao modelo</small><p>{current.user}</p></div>
    <p><b>Critério de avaliação:</b> {current.focus}</p>
   </div>}
   {!current&&<div className="mcq-finished"><CheckCircle2 size={17}/> Todos os turnos foram gerados. Revise cada resposta antes de considerar o cenário aprovado.</div>}
  </div>
  <div className="mcq-actions">
   {current&&<button type="button" className="mbl-run" disabled={!ready||busy} onClick={execute}>
    <Play size={15}/> {busy?'Gerando resposta de IA…':'Gerar resposta do próximo turno'}
   </button>}
   <button type="button" className="mcq-secondary" disabled={!rows.length||busy||missingReason} onClick={exportReport}><Download size={15}/> Baixar avaliação TXT</button>
  </div>
  {missingReason&&<p className="mcq-error" role="status">Para exportar, selecione o motivo de cada resposta marcada como Precisa revisão.</p>}
  {!ready&&<p className="mcq-error" role="alert">Para executar respostas reais, entre com uma sessão válida de administrador do Phoenix ONE.</p>}
  {error&&<p className="mcq-error" role="alert">{error}</p>}
  {notice&&<p className="mcq-success" role="status">{notice}</p>}
  <p className="mcq-footer">Os alertas são sinais por padrões de texto, não uma nota objetiva de correção factual. A validação de dados verificados, handoff real, coberturas, protocolos e integração do Junior continua pendente. O arquivo TXT exporta título, status, motivo de reprovação e observação curta; não inclui respostas nem conteúdo das bases.</p>
 </div>
}
