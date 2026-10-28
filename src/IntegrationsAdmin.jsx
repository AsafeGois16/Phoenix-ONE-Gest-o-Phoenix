import React,{useEffect,useMemo,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {CheckCircle2, Database, ExternalLink, KeyRound, LockKeyhole, RefreshCcw, Save, ShieldCheck, TestTube2, Unplug, UserRound, Workflow} from 'lucide-react'

const supaUrl=import.meta.env.VITE_SUPABASE_URL
const pubKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const client=(supaUrl&&pubKey)?createClient(supaUrl,pubKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null
const allowedScopes=[
 ['contacts:resolve','Identificar contatos'],['clients:read','Consultar clientes'],['policies:read','Consultar apólices'],
 ['tickets:read','Consultar tickets'],['tickets:create','Solicitar abertura de tickets'],['tickets:transfer','Solicitar transferência'],
 ['tickets:comment','Registrar notas de ticket'],['users:capabilities','Consultar setores/usuários'],['tickets:resolved','Receber resoluções para aprendizado']
]
const messages={
 unauthorized:'Sua sessão expirou. Entre novamente.',
 invalid_session:'A sessão não pôde ser validada. Faça login novamente.',
 not_phoenix_one_admin:'Esta conta não está autorizada a administrar o Phoenix ONE.',
 invalid_https_url:'Informe somente a URL HTTPS da API de gestão, sem usuário, senha ou parâmetros.',
 invalid_scopes:'Há permissões inválidas na configuração.',
 api_url_missing:'Informe e salve o endereço da API do Junior antes de testar.',
 invalid_junior_endpoint:'Informe a URL completa HTTPS da função Supabase do Junior, terminando em /functions/v1/phoenix-one-api/v1.',
 server_secret_missing:'Cadastre o PHOENIX_ONE_API_TOKEN no campo protegido e salve antes de testar.',
 connection_unavailable:'Não foi possível acessar o serviço de saúde da API.',
 access_denied:'A API do Junior recusou a autenticação. Confira a chave de serviço.',
 health_endpoint_unavailable:'O endpoint de saúde não respondeu com sucesso. Confirme a rota /health com o Junior.',
 integration_service_unavailable:'O serviço de configuração está indisponível. Consulte os logs da função phoenix-one-admin.',
 invalid_conversation_id:'Informe um conversation_id UUID válido de um protocolo de teste aberto.',
 invalid_api_token:'A chave informada está incompleta ou contém espaços. Confira o PHOENIX_ONE_API_TOKEN fornecido pelo Junior.',
 junior_auth_rejected:'O sistema do Junior rejeitou a credencial de serviço (401/403).',
 conversation_not_open:'O conversation_id não possui protocolo aberto no sistema do Junior (404).',
 junior_api_unavailable:'A API do Junior respondeu com erro ao resolver o contato.',
 junior_timeout:'A API do Junior não respondeu no prazo de teste.',
 junior_api_connection_failed:'Não foi possível acessar a API do Junior pelo servidor Vercel.'
}
const translate=reason=>messages[reason]||'Não foi possível completar a operação. Confira o status da integração.'
export default function IntegrationsAdmin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[session,setSession]=useState(null),
       [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[checking,setChecking]=useState(false),
       [profile,setProfile]=useState(null),[url,setUrl]=useState(''),[scopes,setScopes]=useState([]),
       [notice,setNotice]=useState(''),[noticeError,setNoticeError]=useState(false),[testConversation,setTestConversation]=useState(''),[apiToken,setApiToken]=useState(''),[showApiToken,setShowApiToken]=useState(false)
 const ready=Boolean(client)
 const adminEndpoint=useMemo(()=>supaUrl?supaUrl+'/functions/v1/phoenix-one-admin':'',[])
 const setFeedback=(message,error=false)=>{setNotice(message);setNoticeError(error)}
 const call=async(action,params={},authSession=session)=>{
   if(!authSession?.access_token)throw Error('unauthorized')
   const res=await fetch(adminEndpoint,{method:'POST',headers:{'Authorization':'Bearer '+authSession.access_token,'apikey':pubKey,'Content-Type':'application/json'},body:JSON.stringify({action,...params}),cache:'no-store'})
   const data=await res.json().catch(()=>({error:'integration_service_unavailable'}))
   if(!res.ok)throw Error(data.error||'integration_service_unavailable')
   return data
 }
 const reload=async(s=session)=>{
   if(!s){setProfile(null);setLoading(false);return}
   setChecking(true)
   try{
      const status=await call('status',{},s)
      setProfile(status);setUrl(status.connection.apiBaseUrl||'');setScopes(status.connection.scopes||'')
      setFeedback('')
   }catch(e){setProfile(null);setFeedback(translate(e.message),true)}
   finally{setChecking(false);setLoading(false)}
 }
 useEffect(()=>{
   if(!client){setLoading(false);return}
   let mounted=true
   client.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);reload(data.session)}}).catch(()=>{if(mounted)setLoading(false)})
   const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{if(!mounted)return;setSession(next);if(!next){setProfile(null);setLoading(false)}})
   return()=>{mounted=false;subscription.unsubscribe()}
 },[])
 const login=async(e)=>{
   e.preventDefault();setSaving(true);setFeedback('')
   try{
     const {data,error}=await client.auth.signInWithPassword({email:email.trim(),password})
     if(error)throw Error('Credenciais inválidas ou conta não confirmada.')
     setPassword('');setSession(data.session);await reload(data.session)
   }catch(e){setFeedback(e.message,true)}finally{setSaving(false)}
 }
 const logout=async()=>{await client.auth.signOut();setProfile(null);setFeedback('Sessão encerrada.')}
 const changeScope=(key,checked)=>setScopes(old=>checked?[...new Set([...old,key])]:old.filter(x=>x!==key))
 const save=async(e)=>{
   e.preventDefault();setSaving(true);setFeedback('')
   try{
     const result=await call('save',{apiBaseUrl:url,scopes,apiToken})
     setApiToken('');setShowApiToken(false);await reload();setFeedback(result.note||'Configuração salva.')
   }catch(e){setFeedback(translate(e.message),true)}finally{setSaving(false)}
 }
 const test=async()=>{
   setChecking(true);setFeedback('')
   try{
     const data=await call('probe',{conversationId:testConversation.trim()})
     await reload()
     setFeedback(data.ok?'Teste concluído: '+data.note:translate(data.reason||data.error),!data.ok)
   }catch(e){setFeedback(translate(e.message),true)}finally{setChecking(false)}
 }
 const state=profile?.connection?.state||'disabled'
 return <div className="stack one-integration">
   <div className="page-heading"><div><h2>Integrações e conexões</h2><p>Configuração administrativa do cérebro Phoenix ONE. O 4Zapy e o controle de tickets permanecem no sistema do Junior.</p></div><span className="one-int-status">{profile?<><CheckCircle2 size={15}/> Admin autenticado</>:<><LockKeyhole size={15}/> Acesso restrito</>}</span></div>
   <div className="one-int-summary">
     <div><Database size={22}/><strong>Supabase Phoenix ONE</strong><span>Schema privado · persistência de configurações</span></div>
     <div><Workflow size={22}/><strong>Gestão do Junior</strong><span>{state==='testing'?'Teste de comunicação validado':'Operações ainda não homologadas'}</span></div>
     <div><ShieldCheck size={22}/><strong>Isolamento operacional</strong><span>Sem leitura do CRM LEADS e sem conexão direta ao 4Zapy</span></div>
   </div>
   {!ready?<div className="one-int-panel"><h3>Autenticação não configurada</h3><p>As variáveis públicas do Supabase ainda não estão presentes nesta compilação. Confira VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY na Vercel.</p></div>:
   loading?<div className="one-int-panel">Validando sessão administrativa…</div>:
   !session?<div className="one-int-panel"><h3><UserRound size={19}/> Acesso do administrador</h3><p>Entre com seu usuário cadastrado no Supabase. As credenciais nunca serão registradas no Phoenix ONE.</p><form className="one-int-form one-int-login" onSubmit={login}>
     <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="usuario@empresa.com.br"/></label>
     <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
     <button type="submit" className="one-int-primary" disabled={saving}>{saving?'Autenticando…':'Entrar como administrador'}</button>
   </form></div>:
   !profile?<div className="one-int-panel"><h3>Validando permissão</h3><p>Você está autenticado, mas o serviço ainda não confirmou sua função de administrador.</p><button className="one-int-secondary" onClick={()=>reload()} disabled={checking}><RefreshCcw size={16}/> Revalidar</button><button className="one-int-secondary" onClick={logout}>Sair</button></div>:
   <>
    <div className="one-int-adminbar"><span><UserRound size={16}/> Administração autorizada no Phoenix ONE</span><div><button className="one-int-secondary" onClick={()=>reload()} disabled={checking}><RefreshCcw size={15}/> Atualizar</button><button className="one-int-secondary" onClick={logout}>Sair</button></div></div>
    <form className="one-int-panel one-int-form" onSubmit={save}>
       <div className="one-int-heading"><div><h3>Conector · Sistema de Gestão do Junior</h3><p>Insira a URL da função do Junior e seu PHOENIX_ONE_API_TOKEN em campo protegido. A chave ficará somente no Vault criptografado do Supabase.</p></div><span className="one-int-state">{state==='testing'?'Em homologação':'Desconectado'}</span></div>
       <label>URL base da API HTTPS<input value={url} type="url" maxLength={255} onChange={e=>setUrl(e.target.value)} placeholder="https://SEU-PROJETO.supabase.co/functions/v1/phoenix-one-api/v1"/></label>
       <label>Chave da API do Junior · PHOENIX_ONE_API_TOKEN <span className="ops-soft">{profile.secretConfigured?'Já cadastrada — deixe vazio para manter a atual':'Ainda não cadastrada'}</span><div className="one-int-secret-input"><input type={showApiToken?'text':'password'} name="junior_api_credential" value={apiToken} onChange={e=>setApiToken(e.target.value)} placeholder={profile.secretConfigured?'Nova chave (opcional, para substituição)':'Cole sua chave de API aqui'} autoComplete="new-password" spellCheck={false} maxLength={2048}/><button type="button" className="one-int-secondary" onClick={()=>setShowApiToken(v=>!v)}>{showApiToken?'Ocultar':'Mostrar'}</button></div></label><p className="one-int-hint">A chave é transmitida somente ao serviço autenticado do Phoenix ONE, armazenada criptografada no Supabase Vault e nunca retornada ao navegador.</p><div className="one-int-heading"><div><h3>Permissões solicitadas</h3><p>O sistema do Junior deverá homologar cada escopo antes de executar qualquer ação.</p></div></div>
       <div className="one-int-scopes">{allowedScopes.map(([key,label])=><label key={key}><input type="checkbox" checked={scopes.includes(key)} onChange={e=>changeScope(key,e.target.checked)}/><span>{label}<small>{key}</small></span></label>)}</div>
       <label>conversation_id de teste (protocolo aberto)<input type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={testConversation} onChange={e=>setTestConversation(e.target.value)} maxLength={36}/></label>
       <div className="one-int-actions"><button type="submit" className="one-int-primary" disabled={saving||checking}><Save size={16}/> {saving?'Salvando…':'Salvar configuração'}</button><button type="button" className="one-int-secondary" disabled={saving||checking||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testConversation.trim())} onClick={test}><TestTube2 size={16}/> Testar conexão</button></div>
       <p className="one-int-hint">Salve a URL e a chave antes de testar. Para testar a comunicação, informe um conversation_id UUID com protocolo aberto no sistema do Junior. O teste é somente leitura: não envia mensagens, não cria tickets e não devolve dados do cliente ao painel.</p>
    </form>
    <div className="one-int-panel"><h3><KeyRound size={18}/> Credenciais e segurança</h3><p>Chave do Junior: <strong>{profile.secretConfigured?'Cadastrada no Supabase Vault':'Pendente'}</strong>. O valor não é exibido novamente. Apenas administradores do Phoenix ONE podem substituí-lo. O campo acima aceita somente <code>PHOENIX_ONE_API_TOKEN</code>, criado pelo sistema do Junior — não confunda com o token usado pelo Junior para chamar o Phoenix ONE.</p><div className="one-int-substates"><span>Armazenamento: <b>Vault criptografado</b></span><span>Último teste bem-sucedido: <b>{profile.connection.lastTestAt?new Date(profile.connection.lastTestAt).toLocaleString('pt-BR'):'Ainda não realizado'}</b></span></div></div>
   </>}
   {notice&&<div role="status" className={'one-int-message '+(noticeError?'error':'success')}>{notice}</div>}
   <div className="one-int-panel one-int-disclaimer"><h3><Unplug size={18}/> O que ainda não está ativado</h3><p>Esta etapa permite configurar e validar a conexão da API do Junior. Os eventos e a resposta proposta seguem o contrato V1 do Junior. A consulta de apólices depende das credenciais da API do Junior. A execução de tickets continuará sob controle do sistema do Junior. O Phoenix ONE não acessa o CRM LEADS e não controla o 4Zapy.</p></div>
 </div>
}
