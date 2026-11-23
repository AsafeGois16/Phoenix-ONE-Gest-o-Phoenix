import React,{useRef,useState} from 'react'
import {UploadCloud,PauseCircle,PlayCircle,ShieldCheck,X} from 'lucide-react'
import {createClient} from '@supabase/supabase-js'
import {createLargeTusUpload,LARGE_MAX_BYTES,LARGE_BUCKET} from './large-tus-upload.js'
import KnowledgeProgress from './KnowledgeProgress.jsx'
const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const allowed=/\.(mp4|webm|mov|m4a|mp3|wav)$/i
const labels={
 invalid_large_media:'Arquivo inválido ou acima do limite máximo de 500 MB.',
 invalid_storage_origin:'O endpoint privado do armazenamento não é válido.',
 invalid_upload_location:'A resposta do armazenamento não foi reconhecida.',
 upload_create_failed:'O Supabase não autorizou a criação do upload. Verifique o limite global e as políticas.',
 upload_resume_failed:'Não foi possível recuperar o envio anterior.',
 upload_network_failure:'Conexão interrompida. Você pode retomar o upload.',
 upload_chunk_failed:'Falha ao enviar um bloco. Você pode tentar retomar.',
 upload_offset_invalid:'O servidor retornou um progresso inconsistente.',
 upload_paused:'Envio pausado. Selecione o mesmo arquivo para continuar.',
 unauthorized:'Sessão expirada ou acesso insuficiente.'
}
export default function LargeMediaUploadProbe({session,onClose}){
 const [file,setFile]=useState(null),[consent,setConsent]=useState(false)
 const [status,setStatus]=useState('idle'),[loaded,setLoaded]=useState(0)
 const [error,setError]=useState(''),[result,setResult]=useState(null)
 const running=useRef(null)
 const submit=async e=>{
  e.preventDefault()
  if(!session?.user?.id||!session?.access_token||!file||!consent||!allowed.test(file.name)||file.size>LARGE_MAX_BYTES)return
  setError('');setResult(null);setLoaded(0)
  const ref=new URL(url).hostname.split('.')[0]
  try{
   const job=createLargeTusUpload({
    file,userId:session.user.id,
    storageUrl:'https://'+ref+'.storage.supabase.co',
    accessToken:session.access_token,apikey:key,
    onProgress:(n)=>setLoaded(n),onState:setStatus
   })
   running.current=job
   const uploaded=await job.start()
   setResult(uploaded)
   // This is a STORAGE-ONLY sandbox probe. The worker has not been deployed.
   // Remove uploaded material immediately instead of leaving unprocessed videos.
   const supa=createClient(url,key,{global:{headers:{Authorization:'Bearer '+session.access_token}}})
   const {error:removeError}=await supa.storage.from(LARGE_BUCKET).remove([uploaded.path])
   if(removeError){setStatus('cleanup_failed');setError('Upload concluído, mas a exclusão automática falhou. Solicite limpeza administrativa.')}
   else setStatus('validated_and_removed')
  }catch(e){setError(labels[e.code]||'Falha no teste de upload.');setStatus(e.code==='upload_paused'?'paused':'failed')}
  finally{running.current=null}
 }
 const pause=()=>running.current?.pause()
 return <div className="ops-modal-back">
  <form className="ops-modal" role="dialog" aria-modal="true" aria-label="Teste privado de upload grande" onSubmit={submit} style={{maxWidth:'780px'}}>
   <div className="ops-modal-title"><h3><UploadCloud size={19}/> Laboratório de upload grande — somente testes</h3>
    <button type="button" disabled={!!running.current} onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>
   <div className="ops-scroll">
    <p className="ops-muted">Este painel valida somente o envio TUS de arquivos até 500 MB. Não transcreve nem publica. Se concluir com sucesso, o vídeo será excluído imediatamente. Ainda não utilize arquivos de clientes.</p>
    <label>Vídeo ou áudio de teste
     <input type="file" accept=".mp4,.webm,.mov,.m4a,.mp3,.wav" disabled={!!running.current}
      onChange={e=>{setFile(e.target.files?.[0]||null);setLoaded(0);setError('');setResult(null);setStatus('idle')}}/>
    </label>
    {file&&<p className="ops-muted">{file.name} · {(file.size/1e6).toFixed(2)} MB</p>}
    <label style={{display:'flex',flexDirection:'row',alignItems:'start',gap:8}}>
     <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={!!running.current} style={{width:18,height:18,marginTop:3}}/>
     <span>Autorizo usar este arquivo fictício exclusivamente para verificar o upload e sua exclusão, sem transcrição.</span>
    </label>
    <p className="ops-muted"><ShieldCheck size={15}/> Bucket privado, acesso por usuário, blocos de 6 MB, retomada pelo mesmo arquivo.</p>
    {status!=='idle'&&<KnowledgeProgress value={['uploading','connecting','paused'].includes(status)?{label:status==='paused'?'Envio pausado':'Enviando ao Supabase...',done:loaded,total:file?.size||1,active:status!=='paused',note:'Percentual de bytes confirmados pelo armazenamento.':{label:status==='validated_and_removed'?'Upload validado e arquivo excluído':status==='cleanup_failed'?'Falha na limpeza':status==='failed'?'Falha no upload':status,done:1,total:1,active:false,error:['cleanup_failed','failed'].includes(status)}}/>}
    {error&&<div className="ops-notice" role="alert">{error}</div>}
    {result&&status==='validated_and_removed'&&<p className="ops-muted">Teste concluído: {result.bytes.toLocaleString('pt-BR')} bytes enviados e removidos. Nenhum conteúdo foi cadastrado.</p>}
   </div>
   <div className="ops-modal-footer">
    <button type="button" className="ops-btn secondary" onClick={pause} disabled={!running.current}><PauseCircle size={15}/> Pausar</button>
    <button type="button" className="ops-btn secondary" disabled={!!running.current} onClick={onClose}>Fechar</button>
    <button type="submit" className="ops-btn primary" disabled={!!running.current||!file||!consent||file.size>LARGE_MAX_BYTES||!allowed.test(file.name)}>
      <PlayCircle size={15}/> {status==='paused'?'Retomar envio':'Enviar arquivo de teste'}
    </button>
   </div>
  </form>
 </div>
}
