import React,{useEffect,useRef,useState} from 'react'
import {BrainCircuit,LockKeyhole,Send,ShieldCheck,Sparkles} from 'lucide-react'

const SAMPLE={
 clara:['Como solicitar uma inclusão no plano de saúde?','Uma operadora negou um procedimento. Como orientar?'],
 murilo:['Sou jovem e solteiro. Por que considerar seguro de vida?','Quero cotar seguro para minha empresa.']
}
function messageError(code){
 const map={
  unauthorized:'Sessão expirada. Faça o acesso novamente.',
  provider_auth_failed:'A OpenAI não aceitou a chave. Confira a configuração e a conta API.',
  provider_rate_limited:'Limite de uso da OpenAI atingido. Confira saldo ou limites de requisição.',
  openai_not_configured:'A chave OpenAI ainda não foi disponibilizada neste deployment.',
  provider_timeout:'O modelo demorou a responder. Tente novamente.',
  origin_not_allowed:'Solicitação bloqueada por segurança.',
  lab_auth_not_configured:'O laboratório ainda não possui uma senha de acesso configurada.'
 }
 return map[code]||'Não foi possível completar o teste. Verifique a conexão e tente novamente.'
}
export default function LiveLab(){
 const [state,setState]=useState('checking'),[code,setCode]=useState(''),[agent,setAgent]=useState('clara')
 const [question,setQuestion]=useState(''),[messages,setMessages]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const end=useRef(null)
 useEffect(()=>{let active=true;fetch('/api/lab-session',{credentials:'same-origin',cache:'no-store'}).then(async r=>{
    if(!r.ok)throw Error('unavailable');return r.json()
 }).then(x=>{if(active)setState(!x.configured?'off':x.authenticated?'ready':'login')}).catch(()=>{if(active)setState('off')});return()=>{active=false}},[])
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[messages,busy])
 const login=async(e)=>{
  e.preventDefault();setError('');setBusy(true)
  try{const r=await fetch('/api/lab-session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})
   const x=await r.json();if(!r.ok)throw Error(x.error||'invalid_lab_access_code');setCode('');setState('ready')
  }catch(e){setError(e.message==='invalid_lab_access_code'?'Código de acesso inválido.':messageError(e.message))}finally{setBusy(false)}
 }
 const ask=async(e)=>{
  e.preventDefault()
  const text=question.trim();if(!text||busy)return
  const next=[...messages.slice(-7),{role:'user',content:text}]
  setMessages(next);setQuestion('');setBusy(true);setError('')
  try{const r=await fetch('/api/lab-chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({agent,messages:next})})
   const x=await r.json();if(!r.ok)throw Error(x.error||'request_failed')
   setMessages([...next,{role:'assistant',content:x.answer}])
  }catch(e){setError(messageError(e.message));if(e.message==='unauthorized')setState('login')}finally{setBusy(false)}
 }
 const changeAgent=(value)=>{setAgent(value);setQuestion('');setError('');setMessages([])}
 return <section className="one-live"><div className="one-live-header"><div><div className="one-live-pill" style={{display:'inline-flex',alignItems:'center',gap:7}}><Sparkles size={13}/> OPENAI · AMBIENTE DE TESTES</div><h2>Converse com Clara e Murilo</h2><p>Respostas geradas por IA real, com prompts mestres originais e sem acesso a apólices, tickets, CRM ou WhatsApp. Nenhum procedimento é executado.</p></div><div className="one-live-pill">LAB V0.3</div></div>
 <div className="one-live-body">
 {state==='checking'?<p className="one-live-muted">Verificando acesso seguro ao laboratório…</p>:state==='off'?<p className="one-live-error">Laboratório indisponível. Verifique as variáveis de ambiente no projeto Vercel.</p>:state==='login'?
 <form className="one-live-login" onSubmit={login}><div style={{display:'flex',alignItems:'center',gap:8,fontWeight:700}}><LockKeyhole size={18}/> Acesso protegido</div><label htmlFor="one-access">Código do laboratório</label><input id="one-access" type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)} placeholder="Digite o código de acesso" maxLength={200}/><button disabled={busy||!code.trim()} type="submit">{busy?'Validando…':'Entrar no laboratório'}</button>{error&&<div className="one-live-error">{error}</div>}<p className="one-live-warning">O código protege os testes com a chave OpenAI e não fica gravado no navegador.</p></form>:
 <><div className="one-live-agents"><button className={agent==='clara'?'selected':''} onClick={()=>changeAgent('clara')}>Clara · Concierge</button><button className={agent==='murilo'?'selected':''} onClick={()=>changeAgent('murilo')}>Murilo · SDR</button></div>
 <p className="one-live-warning" style={{margin:'-5px 0 12px'}}>Prompt original ativo: <b>{agent==='clara'?'Clara 4.6 · com complemento 4.5 para transferências':'Murilo SDR 1.0'}</b>. As edições locais da página Agentes ainda não alteram este laboratório.</p>
 <div className="one-live-thread" aria-live="polite">{messages.length===0&&<div className="one-live-muted">Faça uma pergunta para experimentar a personalidade do agente. Use somente dados fictícios.</div>}{messages.map((m,i)=><div className={'one-live-message '+m.role} key={i}><label>{m.role==='user'?'Você':agent==='clara'?'Clara':'Murilo'}</label><span>{m.content}</span></div>)}{busy&&<div className="one-live-message assistant"><label>{agent==='clara'?'Clara':'Murilo'}</label><span>Preparando resposta…</span></div>}<div ref={end}/></div>
 <div className="one-live-samples">{SAMPLE[agent].map(q=><button key={q} disabled={busy} type="button" onClick={()=>setQuestion(q)}>{q}</button>)}</div>
 <form className="one-live-chat-form" onSubmit={ask}><textarea rows="2" value={question} maxLength={1700} onChange={e=>setQuestion(e.target.value)} placeholder="Digite sua pergunta (sem dados pessoais)…"/><button type="submit" className="one-live-send" disabled={busy||!question.trim()}><Send size={16}/>{busy?'Enviando…':'Enviar'}</button></form>
 {error&&<div role="alert" className="one-live-error">{error}</div>}
 <p className="one-live-warning"><ShieldCheck size={13} style={{verticalAlign:'middle',marginRight:5}}/>As respostas têm custo por uso da API OpenAI. Não use dados de clientes neste laboratório. RAG e sistema do Junior ainda não conectados.</p></>}
 </div></section>
}