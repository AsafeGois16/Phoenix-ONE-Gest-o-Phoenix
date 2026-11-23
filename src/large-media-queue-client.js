const ACTIONS=new Set(['enqueue','status','cancel','list'])
export const TERMINAL_STATES=new Set(['review_ready','failed','cancelled','expired'])
const UID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const LARGE_QUEUE_STATES={
 uploaded:'Aguardando processamento',
 extracting:'Extraindo o áudio',
 chunking:'Preparando segmentos',
 transcribing:'Transcrevendo os segmentos',
 assembling:'Reunindo a transcrição',
 review_ready:'Pronto para revisão',
 failed:'Processamento não concluído',
 cancel_requested:'Cancelamento solicitado',
 cancelled:'Cancelado',
 expired:'Prazo de armazenamento encerrado'
}
export function validateQueueResponse(data,action){
 if(!data||typeof data!=='object')throw Error('queue_invalid_response')
 if(action==='list')return Array.isArray(data.jobs)?data: (()=>{throw Error('queue_invalid_response')})()
 if(!UID.test(data.jobId||'')||typeof data.status!=='string')throw Error('queue_invalid_response')
 if(action==='status'&&data.status==='review_ready'&&(typeof data.text!=='string'||data.text.length<10))throw Error('queue_invalid_response')
 return data
}
export function queueClient({url,apiKey,accessToken,fetcher=fetch}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'')||!apiKey||!accessToken)throw Error('queue_not_configured')
 const endpoint=url+'/functions/v1/phoenix-hub-large-queue'
 return async function invoke(action,options={}){
  if(!ACTIONS.has(action))throw Error('queue_unknown_action')
  const res=await fetcher(endpoint,{
   method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+accessToken,apikey:apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({action,...options})
  }).catch(()=>{throw Error('queue_network_failed')})
  const data=await res.json().catch(()=>null)
  if(!res.ok)throw Error(typeof data?.error==='string'?data.error:'queue_unavailable')
  return validateQueueResponse(data,action)
 }
}
export function reviewText({filename,language,job}){
 if(job.status!=='review_ready'||typeof job.text!=='string'||!job.text.trim())throw Error('queue_review_unavailable')
 const filenameSafe=String(filename||'vídeo').slice(0,180)
 return {
  title:('Transcrição longa — '+filenameSafe).slice(0,180),
  content:[
   'ORIGEM: vídeo ou áudio enviado localmente ('+filenameSafe+')',
   'TIPO: transcrição automática segmentada; pode conter repetições nos limites dos trechos.',
   'IDIOMA: '+(language==='pt'?'Português':'Detecção automática'),
   'REVISÃO OBRIGATÓRIA: confira datas, números, nomes, termos de seguros e dados pessoais.',
   'O vídeo original não integra a base de conhecimento.',
   '---','TRANSCRIÇÃO:',job.text
  ].join('\n'),
  category:'Aprendizado supervisionado'
 }
}
