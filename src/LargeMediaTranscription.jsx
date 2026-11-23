import React,{useEffect,useRef,useState} from 'react'
import {AudioLines,PauseCircle,PlayCircle,ShieldCheck,X} from 'lucide-react'
import {createLargeTusUpload,LARGE_MAX_BYTES,LARGE_BUCKET} from './large-tus-upload.js'
import {queueClient,LARGE_QUEUE_STATES,TERMINAL_STATES,reviewText} from './large-media-queue-client.js'
import KnowledgeProgress from './KnowledgeProgress.jsx'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const apikey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ext=/\.(mp4|webm|mov|m4a|mp3|wav)$/i
const messages={
 invalid_large_media:'Arquivo inválido ou acima de 500 MB.',
 upload_create_failed:'O servidor recusou a criação do upload. Confira o limite global de armazenamento.',
 upload_network_failure:'Houve uma interrupção de rede. Você pode retomar o envio.',
 upload_paused:'Envio pausado. Selecione o mesmo arquivo para retomar.',
 upload_chunk_failed:'Falha ao enviar um bloco. Tente novamente.',
 uploaded_media_not_found:'O upload ainda não apareceu no armazenamento. Verifique a conclusão.',
 queue_limit_reached:'Limite temporário de trabalhos atingido. Conclua os anteriores.',
 media_already_queued:'Este vídeo já está na fila. Reabra o trabalho existente.',
 queue_network_failed:'Não foi possível confirmar a entrada na fila. Verifique seus trabalhos.',
 queue_unavailable:'O serviço de fila está indisponível.',
 queue_invalid_response:'A resposta do servidor não pôde ser validada.',
 unauthorized:'Sua sessão não está válida.',
 forbidden:'Você não tem permissão para esta operação.'
}
const readableError=e=>messages[e?.message]||'Não foi possível concluir a operação.'
export default function LargeMediaTranscription({session,onClose,onReady}){
 const [file,setFile]=useState(null),[language,setLanguage]=useState('auto'),[consent,setConsent]=useState(false)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const [uploaded,setUploaded]=useState(0),[uploading,setUploading]=useState(false)
 const [job,setJob]=useState(null),[jobs,setJobs]=useState([])
 const currentUpload=useRef(null)
 const invoke=()=>queueClient({url:supabaseUrl,apiKey:apikey,accessToken:session.access_token})
 const loadJobs=async()=>{
  setLoading(true)
  try{
   const result=await invoke()('list')
   setJobs(result.jobs||[])
  }catch(e){setError(readableError(e))}
  finally{setLoading(false)}
 }
 useEffect(()=>{if(session?.access_token)loadJobs()},[session?.access_token])
 useEffect(()=>{
  if(!job?.jobId||TERMINAL_STATES.has(job.status))return
  let active=true,timer
  const poll=async()=>{
   try{
    const result=await invoke()('status',{jobId:job.jobId})
    if(!active)return
    setJob(result)
    if(!TERMINAL_STATES.has(result.status))timer=setTimeout(poll,5000)
   }catch(e){
    if(!active)return
    setError(readableError(e))
    timer=setTimeout(poll,10000)
   }
  }
  timer=setTimeout(poll,1500)
  return()=>{active=false;clearTimeout(timer)}
 },[job?.jobId,job?.status,session?.access_token])
 const start=async e=>{
  e.preventDefault()
  if(busy||!file||!ext.test(file.name)||file.size>LARGE_MAX_BYTES||file.size<1000||!consent)return
  setError('');setBusy(true);setUploading(true);setUploaded(0)
  let result=null
  try{
   const upload=createLargeTusUpload({
    file,userId:session.user.id,
    storageUrl:'https://'+new URL(supabaseUrl).hostname.split('.')[0]+'.storage.supabase.co',
    accessToken:session.access_token,apikey,
    onProgress:(done)=>setUploaded(done)
   })
   currentUpload.current=upload
   result=await upload.start()
   currentUpload.current=null
   setUploading(false)
   const queued=await invoke()('enqueue',{path:result.path,name:file.name,language,consent:true})
   setJob({jobId:queued.jobId,status:queued.status,completed:0,total:0})
   await loadJobs()
  }catch(e){
   setError(readableError(e))
   // If the queue response is unknown, leave the uploaded file intact so an
   // already accepted job is not destroyed; server sweeper removes orphans.
   if(result&&!['queue_network_failed','media_already_queued'].includes(e?.message)){
    // This component has no elevated privileges: RLS only allows own path.
    import('@supabase/supabase-js').then(async({createClient})=>{
     const client=createClient(supabaseUrl,apikey,{global:{headers:{Authorization:'Bearer '+session.access_token}}})
     await client.storage.from(LARGE_BUCKET).remove([result.path]).catch(()=>{})
    }).catch(()=>{})
   }
  }finally{currentUpload.current=null;setUploading(false);setBusy(false)}
 }
 const openJob=async id=>{
  setError('')
  try{setJob(await invoke()('status',{jobId:id}))}catch(e){setError(readableError(e))}
 }
 const cancel=async()=>{
  if(!job?.jobId||TERMINAL_STATES.has(job.status))return
  try{setJob(await invoke()('cancel',{jobId:job.jobId}));await loadJobs()}
  catch(e){setError(readableError(e))}
 }
 const review=()=>{
  try{
   const prepared=reviewText({filename:file?.name||'gravação longa',language,job})
   if(prepared.content.length>150000)throw Error('transcription_too_long')
   onReady(prepared)
  }catch(e){setError(e.message==='transcription_too_long'?'Transcrição extensa demais para um documento. Precisamos segmentar o conhecimento.':readableError(e))}
 }
 return <div className="ops-modal-back">
  <form className="ops-modal" role="dialog" aria-modal="true" aria-label="Transcrição de vídeo grande" onSubmit={start} style={{maxWidth:'850px'}}>
   <div className="ops-modal-title"><h3><AudioLines size={19}/> Vídeos grandes — transcrição V2</h3>
    <button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18}/></button></div>
   <div className="ops-scroll">
    <p className="ops-muted">Envie arquivos de até 500 MB. O upload pode ser retomado; o processamento usa um serviço privado e o texto fica disponível para revisão. Nada é publicado automaticamente.</p>
    <label>Arquivo local
     <input type="file" disabled={busy} accept=".mp4,.webm,.mov,.m4a,.mp3,.wav"
      onChange={e=>{setFile(e.target.files?.[0]||null);setUploaded(0);setError('')}}/>
    </label>
    {file&&<p className="ops-muted">{file.name} · {(file.size/1e6).toFixed(1)} MB</p>}
    <label>Idioma
     <select disabled={busy} value={language} onChange={e=>setLanguage(e.target.value)}>
      <option value="auto">Detecção automática</option><option value="pt">Português</option>
     </select>
    </label>
    <label style={{display:'flex',flexDirection:'row',alignItems:'flex-start',gap:9}}>
     <input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} style={{width:18,height:18,marginTop:3}}/>
     <span>Confirmo que tenho autorização para processar esta gravação e que seu áudio será enviado à API de transcrição. Revisarei o texto antes de cadastrá-lo.</span>
    </label>
    <p className="ops-muted"><ShieldCheck size={15}/> Armazenamento privado e temporário. Sujeito ao limite global do Supabase e ao custo da transcrição.</p>
    {uploading&&<KnowledgeProgress value={{label:'Enviando o arquivo ao armazenamento privado...',done:uploaded,total:file?.size||1,active:true}}/>}
    {job&&<div className="ops-info" style={{display:'block'}}>
     <strong>{LARGE_QUEUE_STATES[job.status]||job.status}</strong>
     {job.total>0&&<KnowledgeProgress value={{label:'Etapa de processamento',done:job.completed||0,total:job.total,active:!TERMINAL_STATES.has(job.status)}}/>}
     {job.status==='review_ready'&&<p className="ops-muted">A transcrição está pronta para leitura e correção. O conteúdo não foi cadastrado ou publicado.</p>}
     {job.error&&<p className="ops-notice">Código do processamento: {job.error}</p>}
    </div>}
    {!!jobs.length&&<div><p className="ops-muted">Trabalhos recentes</p><div className="ops-document-list">{jobs.slice(0,8).map(j=><button type="button" className="ops-document" key={j.id} onClick={()=>openJob(j.id)}>
     <span>{new Date(j.created_at).toLocaleDateString('pt-BR')} · {LARGE_QUEUE_STATES[j.status]||j.status}</span>
    </button>)}</div></div>}
    {error&&<p className="ops-notice" role="alert">{error}</p>}
   </div>
   <div className="ops-modal-footer">
    {uploading&&<button type="button" className="ops-btn secondary" onClick={()=>currentUpload.current?.pause()}><PauseCircle size={15}/> Pausar</button>}
    {job&&!TERMINAL_STATES.has(job.status)&&!['cancel_requested'].includes(job.status)&&<button type="button" className="ops-btn secondary" onClick={cancel}>Cancelar trabalho</button>}
    {job?.status==='review_ready'&&<button type="button" className="ops-btn primary" onClick={review}>Revisar transcrição</button>}
    <button type="button" className="ops-btn secondary" disabled={busy} onClick={onClose}>Fechar</button>
    <button type="submit" className="ops-btn primary" disabled={busy||!file||!consent||!ext.test(file.name)||file.size>LARGE_MAX_BYTES||file.size<1000}>
     <PlayCircle size={15}/> {loading?'Carregando...':'Enviar e transcrever'}
    </button>
   </div>
  </form>
 </div>
}
