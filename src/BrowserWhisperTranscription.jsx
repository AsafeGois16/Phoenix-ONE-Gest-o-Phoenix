import React,{useRef,useState} from 'react'
import {AudioLines,FileVideo,ShieldCheck,X} from 'lucide-react'
import {createClient} from '@supabase/supabase-js'
import KnowledgeProgress from './KnowledgeProgress.jsx'
import {assembleBrowserTranscript,MAX_BROWSER_INPUT_BYTES,transcribeBrowserMedia,validateBrowserMedia} from './browser-audio-segmentation.js'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const BUCKET='phoenix-hub-transcription-temp'
const errors={
 media_unsupported_format:'Formato não suportado. Utilize MP4, WebM, MOV, M4A, MP3, WAV, OGG ou FLAC.',
 media_too_short:'Arquivo vazio ou inválido.',
 media_too_large_browser:'Arquivo acima de 500 MB. Reduza o tamanho antes de enviar.',
 media_conversion_failed:'O navegador não conseguiu extrair o áudio. Tente MP4 ou MP3.',
 media_too_many_parts:'O áudio possui trechos demais; divida o vídeo em partes.',
 media_segment_invalid:'O arquivo de áudio dividido ficou inconsistente.',
 media_segment_missing:'Um trecho de áudio ficou ausente.',
 media_segment_size_invalid:'Um trecho ultrapassou o limite de 24 MB.',
 transcription_empty:'Não foi identificada fala suficiente para transcrever.',
 transcription_too_long:'A transcrição ficou longa demais para um documento. Divida o vídeo em partes.',
 transcription_cancelled:'Processamento cancelado.',
 upload_failed:'Falha no envio do áudio temporário. Confira sua conexão.',
 upload_timeout:'O envio do áudio expirou.',
 transcription_timeout:'A API demorou demais para processar o trecho.',
 transcription_provider_error:'A OpenAI retornou um erro na transcrição.',
 transcription_media_rejected:'A OpenAI não conseguiu interpretar o áudio. Considere convertê-lo para MP3 ou M4A.',
 transcription_provider_request_rejected:'A OpenAI recusou um parâmetro da transcrição. A equipe técnica deve conferir os registros.',
 transcription_provider_unauthorized:'O servidor não autorizou a API de transcrição.',
 transcription_rate_limited:'A API atingiu o limite de requisições.',
 unauthorized:'Sessão inválida. Entre novamente.',
 forbidden:'Sem permissão para transcrever.',
 transcription_invalid_model:'Modelo de transcrição inválido.',
 transcription_invalid_response:'Resposta inválida do serviço de transcrição.'
}
const readable=e=>errors[e?.message]||'Não foi possível concluir a transcrição deste vídeo.'
const validateResult=d=>{
 if(d?.reviewRequired!==true||d?.published!==false||typeof d.text!=='string'||d.text.trim().length<10)throw Error('transcription_invalid_response')
 return d
}
function uploadPart(blob,session,path,onProgress){
 return new Promise((resolve,reject)=>{
  const req=new XMLHttpRequest()
  req.open('POST',supabaseUrl+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'))
  req.timeout=120000
  req.setRequestHeader('Authorization','Bearer '+session.access_token)
  req.setRequestHeader('apikey',key)
  req.setRequestHeader('Content-Type','audio/mpeg')
  req.setRequestHeader('x-upsert','false')
  req.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded,e.total)}
  req.onload=()=>req.status>=200&&req.status<300?resolve():reject(Error('upload_failed'))
  req.onerror=()=>reject(Error('upload_failed'))
  req.ontimeout=()=>reject(Error('upload_timeout'))
  req.send(blob)
 })
}
async function removeTemp(session,path){
 const supa=createClient(supabaseUrl,key,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+session.access_token}}
 })
 await supa.storage.from(BUCKET).remove([path])
}
export default function BrowserWhisperTranscription({session,onClose,onReady}){
 const [file,setFile]=useState(null)
 const [language,setLanguage]=useState('pt'),[model,setModel]=useState('gpt-transcribe')
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false)
 const [progress,setProgress]=useState(null),[error,setError]=useState('')
 const abortRef=useRef(null)
 let fileError=''
 if(file)try{validateBrowserMedia(file)}catch(e){fileError=readable(e)}
 const send=async(e)=>{
  e.preventDefault()
  if(busy||!file||fileError||!consent||!session?.user?.id||!session?.access_token||!supabaseUrl||!key)return
  setBusy(true);setError('')
  const controller=new AbortController()
  abortRef.current=controller
  try{
   const parts=await transcribeBrowserMedia(file,{
    signal:controller.signal,
    onStage:stage=>setProgress(stage.total?
     {label:stage.label,done:stage.done,total:stage.total,active:true,note:'O progresso representa trechos concluídos, não o tempo do vídeo.'}:
     {label:stage.label,active:true,note:'A preparação do vídeo não possui percentual confiável.'}),
    processPart:async(blob,index,total)=>{
     const path=session.user.id+'/'+crypto.randomUUID()+'.mp3'
     try{
      setProgress({label:'Enviando áudio do trecho '+(index+1)+' de '+total+'...',active:true,done:0,total:blob.size})
      await uploadPart(blob,session,path,(done,bytes)=>setProgress({label:'Enviando trecho '+(index+1)+' de '+total+'...',active:true,done,total:bytes}))
      setProgress({label:'OpenAI: transcrevendo trecho '+(index+1)+' de '+total+'...',active:true,note:'A API não fornece porcentagem desta etapa.'})
      const response=await fetch('/api/phoenix-transcribe-hub',{
       method:'POST',cache:'no-store',
       headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
       body:JSON.stringify({path,language,model,consent:true}),
       signal:controller.signal
      })
      const data=await response.json().catch(()=>({error:'transcription_invalid_response'}))
      if(!response.ok)throw Error(data.error||'transcription_provider_error')
      return validateResult(data)
     }finally{
      // The server removes uploaded temporary media too; repeat is safe.
      await removeTemp(session,path).catch(()=>{})
     }
    }
   })
   const doc=assembleBrowserTranscript(parts,{filename:file.name,model,language})
   setProgress({label:'Transcrição finalizada: revisar antes de cadastrar',done:1,total:1,active:false,note:'O vídeo original não foi enviado à API. Nenhum documento foi publicado.'})
   onReady(doc)
  }catch(e){
   setError(controller.signal.aborted?'Processamento interrompido. Nenhum conhecimento foi publicado.':readable(e))
   setProgress({label:'Transcrição não concluída',active:false,error:true})
  }finally{abortRef.current=null;setBusy(false)}
 }
 return <div className="ops-modal-back">
  <form className="ops-modal" role="dialog" aria-modal="true" aria-label="Transcrever vídeo grande no navegador" onSubmit={send} style={{maxWidth:'850px'}}>
   <div className="ops-modal-title">
    <h3 style={{display:'flex',alignItems:'center',gap:8}}><AudioLines size={19}/> Transcrever vídeo grande — OpenAI</h3>
    <button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18}/></button>
   </div>
   <div className="ops-scroll">
    <p className="ops-muted">O navegador extrai o áudio e o divide automaticamente. Apenas pequenos trechos de áudio são enviados para transcrição na API OpenAI. Nenhum vídeo completo é enviado ao servidor.</p>
    <label>Arquivo de vídeo ou áudio (até 500 MB)
     <input type="file" accept=".mp4,.webm,.mov,.m4a,.mp3,.wav,.ogg,.flac" required disabled={busy}
      onChange={e=>{setFile(e.target.files?.[0]||null);setError('');setProgress(null)}}/>
    </label>
    {file&&<div className="ops-info"><FileVideo size={18}/><span style={{overflowWrap:'anywhere'}}>{file.name} · {(file.size/1e6).toFixed(1)} MB</span></div>}
    {fileError&&<p className="ops-notice" role="alert">{fileError}</p>}
    <label>Modelo de transcrição
     <select value={model} disabled={busy} onChange={e=>setModel(e.target.value)}>
      <option value="gpt-transcribe">GPT-Transcribe (recomendado)</option>
      <option value="whisper-1">Whisper-1 (legado, descontinuação anunciada)</option>
     </select>
    </label>
    <label>Idioma
     <select value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}>
      <option value="pt">Português</option><option value="auto">Detecção automática</option>
     </select>
    </label>
    <label style={{display:'flex',flexDirection:'row',alignItems:'flex-start',gap:9}}>
     <input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} style={{width:18,height:18,marginTop:3}}/>
     <span>Confirmo que tenho autorização para processar o arquivo, que a API da OpenAI tem cobrança por uso e que revisarei os dados antes de cadastrar o conhecimento.</span>
    </label>
    <p className="ops-muted"><ShieldCheck size={15} style={{verticalAlign:'middle'}}/> A preparação local usa memória do navegador; arquivos muito grandes podem não funcionar em computadores com pouca memória. O áudio temporário é removido do armazenamento após cada trecho.</p>
    {progress&&<KnowledgeProgress value={progress}/>}
    {error&&<p className="ops-notice" role="alert">{error}</p>}
   </div>
   <div className="ops-modal-footer">
    <button type="button" className="ops-btn secondary" disabled={busy} onClick={onClose}>Fechar</button>
    <button type="submit" className="ops-btn primary" disabled={busy||!!fileError||!file||!consent||file.size>MAX_BROWSER_INPUT_BYTES}>
     <AudioLines size={15}/>{busy?'Processando vídeo...':'Transcrever e revisar'}
    </button>
   </div>
  </form>
 </div>
}
