import React,{useCallback,useEffect,useState} from 'react'
import {ShieldCheck,ShieldAlert,Power,PowerOff,RefreshCcw,Clock3} from 'lucide-react'
import './megabrain-protocol-control.css'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const endpoint=url?url+'/functions/v1/phoenix-one-megabrain-context':''
const formatDate=value=>{
 if(!value)return '—'
 const date=new Date(value)
 return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
}
export default function MegaBrainProtocolControl({session,protocolo}){
 const [control,setControl]=useState(null)
 const [loading,setLoading]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const request=useCallback(async(action,more={})=>{
  if(!session?.access_token||!endpoint)throw Error('Sessão indisponível.')
  const response=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{
   Authorization:'Bearer '+session.access_token,apikey:key,'Content-Type':'application/json'
  },body:JSON.stringify({action,protocolo,...more})})
  const data=await response.json().catch(()=>null)
  if(!response.ok)throw Error(
   data?.error==='protocol_not_eligible'?'Somente protocolos ativos com agente podem ser autorizados.':
   data?.error==='read_not_eligible'?'É necessário capturar um contexto recente neste protocolo antes de autorizar a leitura.':
   data?.error==='megabrain_admin_only'?'Esta ação exige acesso administrativo.':
   'Não foi possível concluir a operação. Nenhuma outra função foi alterada.'
  )
  return data
 },[session?.access_token,protocolo])
 const refresh=useCallback(async()=>{
  setLoading(true);setError('')
  try{setControl(await request('control_status'))}
  catch(e){setError(e.message);setControl(null)}
  finally{setLoading(false)}
 },[request])
 useEffect(()=>{refresh()},[refresh])
 const changeRead=async(enabled)=>{
  if(enabled&&!window.confirm('Autorizar Clara e Murilo a consultar SOMENTE categorias inferidas deste protocolo até o vencimento da autorização? Isso não valida identidade nem cobertura. Use apenas um protocolo de homologação.'))return
  setBusy(true);setError('');setNotice('')
  try{
   await request(enabled?'grant_agent_read':'revoke_agent_read',enabled?{confirm:'AUTORIZAR_LEITURA_IA'}:{})
   await refresh()
   setNotice(enabled?'Leitura V3 autorizada neste protocolo. Ela expira com a observação e pode ser desativada a qualquer momento.':'Leitura V3 desativada para ambos os agentes neste protocolo.')
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 const change=async(enabled)=>{
  if(enabled&&!window.confirm('Autorizar a observação SOMENTE deste protocolo por até 30 minutos? Utilize apenas um protocolo de homologação, sem informações reais de clientes.'))return
  setBusy(true);setError('');setNotice('')
  try{
   await request(enabled?'grant':'revoke',enabled?{confirm:'AUTORIZAR_TESTE'}:{})
   await refresh()
   setNotice(enabled?'Autorização registrada para este protocolo. Envie uma nova mensagem pelo ambiente de teste para capturar o contexto.':'Observação desativada para este protocolo.')
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 return <section className="mbpc-control" aria-label="Autorização de observação por protocolo">
  <div className="mbpc-header">
   <div className="mbpc-title"><ShieldCheck size={18}/><div><strong>Homologação por protocolo · MegaBrain V2.1</strong><small>Permite observar apenas este atendimento, por até 30 minutos.</small></div></div>
   <button className="mbpc-refresh" type="button" onClick={refresh} disabled={busy||loading} title="Reconsultar autorização"><RefreshCcw size={15}/></button>
  </div>
  {loading&&!control?<p className="mbpc-muted">Verificando autorização...</p>:control?<>
   <div className="mbpc-status">
    {control.active?<><span className="mbpc-pill on"><Power size={13}/> Observação autorizada</span><span><Clock3 size={13}/> Até {formatDate(control.grant_expires_at)}</span></>:
      <><span className="mbpc-pill off"><PowerOff size={13}/> Captura não autorizada</span><span>Não existe coleta automática permitida para este protocolo.</span></>}
   </div>
   {control.can_authorize?
    <button type="button" className={'mbpc-action '+(control.active?'mbpc-stop':'mbpc-start')} disabled={busy||loading} onClick={()=>change(!control.active)}>
     {control.active?<><PowerOff size={15}/> Desativar observação deste protocolo</>:<><Power size={15}/> Ativar observação deste protocolo por 30 minutos</>}
    </button>:
    <p className="mbpc-muted">Este protocolo não está mais com um agente ativo. Para segurança, a captura não pode ser iniciada.</p>}
   {control.active&&<div className="mbpc-reader">
    <div><strong>MegaBrain V3 — Compartilhar com agentes</strong><p>Clara e Murilo podem recuperar somente assunto, produto e subassunto inferidos. Identidade, apólices e coberturas continuam exigindo validação pelo Junior.</p></div>
    <span className={'mbpc-pill '+(control.read_active?'on':'off')}>{control.read_active?'Leitura autorizada':'Leitura desligada'}</span>
    {control.read_active?
     <button type="button" className="mbpc-action mbpc-stop" disabled={busy||loading} onClick={()=>changeRead(false)}>Desativar leitura para Clara e Murilo</button>:
     <button type="button" className="mbpc-action mbpc-start" disabled={busy||loading||!control.can_authorize_read} onClick={()=>changeRead(true)}>Ativar leitura para Clara e Murilo</button>}
    {!control.can_authorize_read&&!control.read_active&&<small>Primeiro registre uma observação recente neste protocolo de teste.</small>}
   </div>}
   {control.last_observation_at&&<p className="mbpc-muted">Última observação registrada: {formatDate(control.last_observation_at)}</p>}
  </>:null}
  {error&&<p role="alert" className="mbpc-error"><ShieldAlert size={15}/>{error}</p>}
  {notice&&<p className="mbpc-notice">{notice}</p>}
  <p className="mbpc-disclaimer">Somente categorias inferidas, sem mensagens completas ou documentos. A autorização não altera o atendimento nem permite acesso ao histórico do Junior. Expira automaticamente, ou pode ser revogada aqui.</p>
 </section>
}
