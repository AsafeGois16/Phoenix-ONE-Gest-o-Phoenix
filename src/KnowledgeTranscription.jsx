import React,{useState} from 'react'
import {AudioLines,FileAudio,FileVideo,ShieldCheck,X} from 'lucide-react'
import {createClient} from '@supabase/supabase-js'
import KnowledgeProgress from './KnowledgeProgress.jsx'
const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const BUCKET='phoenix-hub-transcription-temp'
const MAX_BYTES=24000000
const types={
 mp3:'audio/mpeg',mpga:'audio/mpeg',mpeg:'audio/mpeg',
 mp4:'video/mp4',m4a:'audio/mp4',wav:'audio/wav',
 ogg:'audio/ogg',webm:'video/webm',flac:'audio/flac'
}
const names={
 transcription_not_configured:'A chave de transcrição não está configurada no servidor.',
 transcription_provider_unauthorized:'A credencial da OpenAI não autorizou a transcrição. Verifique as configurações.',
 transcription_rate_limited:'A API atingiu o limite de requisições. Tente outro momento.',
 transcription_provider_error:'O serviço de transcrição retornou um erro. Tente novamente.',
 transcription_timeout:'A transcrição demorou demais. Tente um arquivo mais curto.',
 transcription_service_unavailable:'Não foi possível conectar ao serviço de transcrição.',
 transcription_invalid_response:'A API retornou uma resposta inválida.',
 transcription_empty:'Não foi identificada fala suficiente para transcrever.',
 transcription_too_long:'O texto ficou extenso demais para um documento. Divida a gravação em partes.',
 transcription_unavailable:'A transcrição não pôde ser concluída.',
 media_not_found:'O arquivo temporário não foi encontrado. Reenvie o arquivo.',
 media_invalid_content:'O conteúdo do arquivo não corresponde ao formato indicado.',
 media_too_large:'O arquivo ultrapassa 24 MB. Comprima o áudio ou divida o vídeo.',
 media_too_short:'O arquivo parece estar vazio ou inválido.',
 media_unsupported_format:'Formato não suportado. Utilize MP3, M4A, WAV, OGG, FLAC, MP4 ou WebM.',
 unauthorized:'Sua sessão expirou. Entre novamente.',
 forbidden:'Sem permissão para usar esta funcionalidade.',
 not_phoenix_one_admin:'Seu usuário não possui acesso ao Knowledge Hub.',
 invalid_media_path:'O arquivo foi identificado como inválido.',
 upload_failed:'Não foi possível enviar o arquivo temporário. Confira a conexão.',
 upload_timeout:'O upload expirou. Tente um arquivo menor.'
}
const errorText=c=>names[c]||'Não foi possível concluir a transcrição.'
const Btn=({children,onClick,disabled,primary,type='button'})=>
 <button type={type} className={'ops-btn '+(primary?'primary':'secondary')} onClick={onClick} disabled={disabled}>{children}</button>
function uploadMedia(file,session,path,onProgress){
 return new Promise((resolve,reject)=>{
  const req=new XMLHttpRequest()
  const location=url+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/')
  req.open('POST',location)
  req.timeout=120000
  req.setRequestHeader('Authorization','Bearer '+session.access_token)
  req.setRequestHeader('apikey',key)
  req.setRequestHeader('x-upsert','false')
  const ext=file.name.toLowerCase().split('.').pop()
  req.setRequestHeader('Content-Type',file.type||types[ext]||'application/octet-stream')
  req.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded,e.total)}
  req.onload=()=>req.status>=200&&req.status<300?resolve():reject(Error('upload_failed'))
  req.onerror=()=>reject(Error('upload_failed'))
  req.ontimeout=()=>reject(Error('upload_timeout'))
  req.send(file)
 })
}
export default function KnowledgeTranscription({session,onClose,onReady}){
 const [file,setFile]=useState(null),[language,setLanguage]=useState('auto')
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false)
 const [progress,setProgress]=useState(null),[error,setError]=useState('')
 const ext=file?.name?.split('.').pop()?.toLowerCase()
 const validFile=!!file&&Boolean(types[ext])&&file.size>1000&&file.size<=MAX_BYTES
 const send=async e=>{
  e.preventDefault()
  if(busy||!validFile||!consent||!session?.user?.id||!key||!url)return
  setBusy(true);setError('')
  const path=session.user.id+'/'+crypto.randomUUID()+'.'+ext
  let uploaded=false
  try{
   setProgress({label:'Enviando gravação ao armazenamento privado...',active:true,done:0,total:file.size,note:'Progresso real de bytes enviados; somente você e usuários autorizados podem acessar o objeto.'})
   await uploadMedia(file,session,path,(done,total)=>setProgress({label:'Enviando gravação ao armazenamento privado...',active:true,done,total,note:'O arquivo é temporário e não será salvo na base de conhecimento.'}))
   uploaded=true
   setProgress({label:'Transcrevendo a gravação com IA...',active:true,note:'O tempo depende da duração e do formato da gravação; esta etapa não informa porcentagem.'})
   const response=await fetch('/api/phoenix-transcribe',{
    method:'POST',
    headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({path,language,consent:true}),
    cache:'no-store'
   })
   const data=await response.json().catch(()=>({error:'transcription_invalid_response'}))
   if(!response.ok)throw Error(data.error||'transcription_unavailable')
   if(data.reviewRequired!==true||data.published!==false||typeof data.text!=='string'||data.text.length<10)throw Error('transcription_invalid_response')
   const content=[
    'ORIGEM: arquivo enviado para transcrição ('+file.name+')',
    'MODELO DE TRANSCRIÇÃO: '+data.model,
    'DATA DA TRANSCRIÇÃO (UTC): '+new Date().toISOString(),
    'IDIOMA: '+(language==='pt'?'Português (indicado)':'Detecção automática'),
    'STATUS: texto gerado automaticamente; revisar nomes, números, termos de seguros e dados pessoais antes de cadastrar.',
    'NOTA: o arquivo original foi utilizado temporariamente para transcrição e não integra a base RAG.',
    '---','TRANSCRIÇÃO PARA REVISÃO:',data.text
   ].join('\n')
   setProgress({label:'Transcrição concluída — pronta para revisão',done:1,total:1,active:false,note:'Apenas o texto será exibido no formulário. Nenhum documento foi publicado.'})
   onReady({title:('Transcrição — '+file.name).slice(0,180),content,category:'Aprendizado supervisionado'})
  }catch(err){
   setError(errorText(err.message))
   setProgress({label:'Transcrição não concluída',error:true,active:false,note:'Nenhum conhecimento foi publicado.'})
   if(uploaded)try{
    const supa=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+session.access_token}}})
    await supa.storage.from(BUCKET).remove([path])
   }catch{}
  }finally{setBusy(false)}
 }
 return <div className="ops-modal-back">
  <form className="ops-modal" role="dialog" aria-modal="true" aria-label="Transcrever áudio ou vídeo" onSubmit={send} style={{maxWidth:'850px'}}>
   <div className="ops-modal-title">
    <h3 style={{display:'flex',alignItems:'center',gap:8}}><AudioLines size={19}/> Transcrever áudio ou vídeo</h3>
    <button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={19}/></button>
   </div>
   <div className="ops-scroll">
    <p className="ops-muted">Converta gravações de treinamentos, palestras, entrevistas e reuniões em conhecimento editável. O resultado não será cadastrado nem publicado automaticamente.</p>
    <label>Arquivo de áudio ou vídeo (até 24 MB)
     <input type="file" accept=".mp3,.mpga,.mpeg,.m4a,.mp4,.wav,.ogg,.webm,.flac,audio/*,video/mp4,video/webm"
      onChange={e=>{setFile(e.target.files?.[0]||null);setError('');setProgress(null)}}
      disabled={busy} required/>
    </label>
    {file&&<div className="ops-info">
     {['mp4','webm'].includes(ext)?<FileVideo size={19}/>:<FileAudio size={19}/>}
     <span style={{overflowWrap:'anywhere'}}>{file.name} · {(file.size/1024/1024).toFixed(2)} MB</span>
    </div>}
    {file&&!validFile&&<p className="ops-notice" role="alert">{file.size>MAX_BYTES?names.media_too_large:names.media_unsupported_format}</p>}
    <label>Idioma
     <select value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}>
      <option value="auto">Detectar automaticamente</option>
      <option value="pt">Português</option>
     </select>
    </label>
    <label style={{display:'flex',flexDirection:'row',alignItems:'flex-start',gap:9}}>
     <input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} style={{width:18,height:18,marginTop:3}}/>
     <span>Confirmo que tenho autorização para processar esta gravação e estou ciente de que seu áudio será enviado à API da OpenAI para transcrição. Revisarei o texto e eventuais dados pessoais antes do cadastro.</span>
    </label>
    <p className="ops-muted"><ShieldCheck size={15} style={{verticalAlign:'middle'}}/> A gravação é enviada a um bucket privado temporário e removida após o processamento. A cobrança da API depende da duração do áudio. Arquivos acima de 24 MB precisam ser comprimidos ou divididos em partes.</p>
    {progress&&<KnowledgeProgress value={progress}/>}
    {error&&<p className="ops-notice" role="alert">{error}</p>}
   </div>
   <div className="ops-modal-footer">
    <Btn onClick={onClose} disabled={busy}>Cancelar</Btn>
    <Btn primary type="submit" disabled={busy||!validFile||!consent}>
     <AudioLines size={15}/> {busy?'Processando gravação...':'Transcrever e revisar'}
    </Btn>
   </div>
  </form>
 </div>
}
