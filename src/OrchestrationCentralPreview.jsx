import React,{useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {ShieldCheck,Database,RefreshCcw,Send} from 'lucide-react'

const url=import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/,'')
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const configured=import.meta.env.VITE_PHX_ORCH_TEST_ENABLED==='true'&&url==='https://cxyxrhmpjehrqhwihxul.supabase.co'&&typeof key==='string'&&key.length>0
const client=configured?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null
const modeLabel=m=>m==='clara_only'?'Somente Clara':'Clara + Murilo'
const title={delegate:'Delegação ao fluxo existente (sem executá-lo)',engine_response:'Resposta do motor — ensaio',engine_boundary:'Limite seguro do motor — sem consulta externa',reply:'Resposta proposta',mapping_required:'Destino comercial pendente de validação',propose_handoff:'Encaminhamento proposto',blocked:'Operação bloqueada'}
const errorText={isolated_environment_not_configured:'O ambiente central isolado ainda não foi configurado.',unauthorized:'Conta não autorizada para homologação.',central_store_unavailable:'Não foi possível acessar a persistência central isolada.',invalid_configuration:'Configuração inválida.',invalid_simulation:'Mensagem ou protocolo fictício inválido.'}
export default function OrchestrationCentralPreview(){
 const [fixtureInput,setFixtureInput]=useState('20990102-0001'),[fixtureProtocol,setFixtureProtocol]=useState(null)
 const [session,setSession]=useState(null),[settings,setSettings]=useState(null),[pin,setPin]=useState(null)
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[message,setMessage]=useState(''),[history,setHistory]=useState([]),[decision,setDecision]=useState(null)
 async function call(action,params={},auth=session){
  if(!auth?.access_token)throw Error('unauthorized')
  const r=await fetch('/api/orchestration-central-preview',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({action,...params})})
  const data=await r.json()
  if(r.status===409&&data.conflict){setSettings(data);throw Error('A configuração mudou. Confira a revisão atual e tente novamente.')}
  if(!r.ok)throw Error(data.error||'central_store_unavailable')
  return data
 }
 async function run(fn){
  if(busy)return
  setBusy(true);setError('');setNotice('')
  try{await fn()}catch(e){setError(errorText[e.message]||e.message)}finally{setBusy(false)}
 }
 async function login(e){
  e.preventDefault()
  await run(async()=>{
   const r=await client.auth.signInWithPassword({email,password})
   setPassword('')
   if(r.error||!r.data.session)throw Error('Não foi possível entrar com sua conta administrativa.')
   const s=r.data.session
   try{setSettings(await call('get',{},s));setSession(s)}catch(e){await client.auth.signOut({scope:'local'});throw e}
  })
 }
 async function logout(){if(client)await client.auth.signOut({scope:'local'});setSession(null);setSettings(null);setPin(null);setFixtureProtocol(null);setHistory([]);setDecision(null);setMessage('')}
 function updateMode(mode){return run(async()=>{setSettings(await call('set',{mode,expectedRevision:settings.revision}));setNotice('Configuração central atualizada para novos protocolos; protocolos já fixados não mudam.')})}
 function newProtocol(){return run(async()=>{setPin(await call('new_protocol'));setFixtureProtocol(null);setHistory([]);setDecision(null);setMessage('')})}
 function resolveFixture(){return run(async()=>{
  const row=await call('resolve_fixture',{fixtureProtocol:fixtureInput.trim()})
  setPin(row);setFixtureProtocol(row.protocol);setHistory([]);setDecision(null);setMessage('')
 })}
 function simulate(e){
  e.preventDefault()
  return run(async()=>{
   const text=message.trim()
   if(!pin||!text)return
   const transcript=[...history,{direction:'inbound',author:'contact',text}].slice(-19)
   const data=await call('decide',{protocolRef:pin.protocol_ref,...(fixtureProtocol?{fixtureProtocol}:{}),messages:transcript})
   setDecision(data.decision);setPin(data.pin)
   setHistory(data.decision.reply?[...transcript,{direction:'outbound',author:'agent',text:data.decision.reply}]:transcript)
   setMessage('')
  })
 }
 return <section className="ops-paper">
  <div className="orch-section"><Database size={20}/><div><h3>Fase 4 — Orquestração V1.4 em homologação</h3><p>Persistência por revisão, em schema exclusivo de homologação. O servidor não executa ações no Junior.</p></div></div>
  {!client?<div className="orch-pending" role="status">Conexão de homologação ainda não habilitada. A configuração central e o ensaio servidor a servidor estão bloqueados; use o simulador local da Fase 1 enquanto isso.</div>:!session?<form className="orch-form" onSubmit={login}><p>Entre com sua conta administrativa autorizada do Phoenix ONE. A sessão deste painel é temporária, com acesso restrito à homologação.</p><label htmlFor="orch-test-email">E-mail de teste</label><input id="orch-test-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="orch-test-password">Senha de teste</label><input id="orch-test-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/><button className="orch-primary" disabled={busy}>Entrar no ambiente isolado</button></form>:<>
   <div className="orch-result"><b>Modo central: {modeLabel(settings?.mode)}</b><p>Revisão: {settings?.revision}</p><div className="orch-chips"><button type="button" disabled={busy} onClick={()=>updateMode('clara_only')}>Somente Clara</button><button type="button" disabled={busy} onClick={()=>updateMode('clara_murilo')}>Clara + Murilo</button><button type="button" disabled={busy} onClick={()=>run(async()=>setSettings(await call('get')))}>Recarregar configuração</button><button type="button" disabled={busy} onClick={logout}>Sair</button></div></div>
   <button className="orch-secondary" type="button" disabled={busy} onClick={newProtocol}><RefreshCcw size={15}/> Novo protocolo fictício central</button>
   <div className="orch-form"><label htmlFor="orch-fixture">Protocolo fictício V1.4 (ativação simulada 02/01/2099)</label><input id="orch-fixture" value={fixtureInput} onChange={e=>setFixtureInput(e.target.value)} maxLength={22}/><button type="button" className="orch-secondary" disabled={busy} onClick={resolveFixture}>Fixar / reabrir / vincular protocolo fictício</button><small>Use somente 20990101, 20990102 ou 20990103; sufixo -N herda o pin da base. Números iguais reaproveitam o pin.</small></div>
   {pin&&<><p>Modo fixado: <b>{modeLabel(pin.mode)}</b> · revisão {pin.revision}{fixtureProtocol?' · '+fixtureProtocol+' · base '+pin.base:''}</p><form className="orch-form" onSubmit={simulate}><label htmlFor="orch-central-message">Mensagem fictícia — sem dados pessoais</label><textarea id="orch-central-message" maxLength={500} rows={3} value={message} onChange={e=>setMessage(e.target.value)}/><button className="orch-primary" disabled={busy||!message.trim()}><Send size={15}/> Testar motor de atendimento</button></form></>}
   {decision&&<div className="orch-result"><b>{title[decision.action]||decision.action}</b><p>Agente: {decision.agent||'Fluxo original'} · Produto: {decision.product||'—'}</p><p>{decision.reply||decision.reason}</p><p>Agente selecionado pelo motor: {decision.selectedAgent||'—'}</p>{decision.proposedHandoff&&<><p>Proposta V1.4 (não executável):</p><pre>{JSON.stringify(decision.proposedHandoff,null,2)}</pre></>}<small>Transferência real: não executada. Nenhuma mensagem enviada.</small></div>}
   {history.length>0&&<div className="orch-history">{history.map((m,i)=><div key={i}><small>{m.author==='contact'?'Cliente fictício':'Resposta simulada'}</small><p>{m.text}</p></div>)}</div>}
  </>}
  {error&&<p className="orch-pending" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="orch-save"><ShieldCheck size={15}/> O acesso exige conta autorizada no schema de homologação, e a API rejeita produção. Sem filas reais, chamadas ao modelo ou consultas ao Junior.</div>
 </section>
}
