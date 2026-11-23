/**
 * Browser-only media extraction for Phoenix ONE Knowledge Hub.
 * FFmpeg runs in the user's browser. The original video never goes to Storage.
 * All output parts are MP3 and are sent through the existing authenticated 24 MB API.
 *
 * Memory caveat: ffmpeg.wasm reads the entire input into WASM virtual filesystem.
 * 500 MB input is a hard upper bound, not a guarantee that every browser can process it.
 */
export const MAX_BROWSER_INPUT_BYTES=500_000_000
export const MAX_PART_BYTES=24_000_000
export const SEGMENT_SECONDS=480
export const MAX_PARTS=90
export const INPUT_EXTENSIONS=new Set(['mp4','webm','mov','m4a','mp3','wav','ogg','flac'])
export const MP3_BITRATE='48k'
const CORE_BASE='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd'

export function validateBrowserMedia(file){
 const ext=typeof file?.name==='string'?file.name.split('.').pop().toLowerCase():''
 if(!INPUT_EXTENSIONS.has(ext))throw Error('media_unsupported_format')
 if(!Number.isSafeInteger(file.size)||file.size<1000)throw Error('media_too_short')
 if(file.size>MAX_BROWSER_INPUT_BYTES)throw Error('media_too_large_browser')
 return ext
}
export function segmentFileNames(entries){
 if(!Array.isArray(entries))throw Error('media_segment_invalid')
 const files=entries.filter(e=>e.isDir===false&&/^part-\d{3}\.mp3$/.test(e.name))
  .map(e=>e.name).sort()
 if(!files.length||files.length>MAX_PARTS)throw Error('media_too_many_parts')
 for(const [index,name] of files.entries()){
  if(name!==('part-'+String(index).padStart(3,'0')+'.mp3'))throw Error('media_segment_missing')
 }
 return files
}
export function assembleBrowserTranscript(parts,{filename,model,language}={}){
 if(!Array.isArray(parts)||!parts.length||parts.length>MAX_PARTS)throw Error('media_segment_invalid')
 const safeName=String(filename||'gravação').slice(0,180)
 const text=parts.map((p,index)=>{
  if(p.index!==index||typeof p.text!=='string'||!p.text.trim())throw Error('media_segment_invalid')
  const stamp=new Date(index*SEGMENT_SECONDS*1000).toISOString().slice(11,19)
  return '['+stamp+'] '+p.text.trim()
 }).join('\n\n')
 if(text.length>140000)throw Error('transcription_too_long')
 return {
  title:('Transcrição — '+safeName).slice(0,180),
  category:'Aprendizado supervisionado',
  content:[
   'ORIGEM: vídeo ou áudio local ('+safeName+')',
   'MODELO DE TRANSCRIÇÃO: '+(model==='whisper-1'?'whisper-1':'gpt-transcribe'),
   'IDIOMA: '+(language==='pt'?'Português':'Detecção automática'),
   'DATA DA TRANSCRIÇÃO (UTC): '+new Date().toISOString(),
   'STATUS: texto gerado automaticamente em partes; revisar nomes, números, termos de seguros e dados pessoais antes de cadastrar.',
   'NOTA: o vídeo original foi processado no navegador e não foi enviado ao armazenamento nem publicado na base RAG.',
   '---','TRANSCRIÇÃO PARA REVISÃO:',text
  ].join('\n')
 }
}

/** Start, callback(part,total) to upload/transcribe, then destroy FFmpeg WASM. */
export async function transcribeBrowserMedia(file,{processPart,onStage=()=>{},signal}={}){
 const extension=validateBrowserMedia(file)
 if(typeof processPart!=='function')throw Error('invalid_part_handler')
 if(signal?.aborted)throw Error('transcription_cancelled')
 const [{FFmpeg},{fetchFile,toBlobURL}]=await Promise.all([
  import('@ffmpeg/ffmpeg'),import('@ffmpeg/util')
 ])
 const ffmpeg=new FFmpeg()
 const input='input.'+extension
 let loaded=false
 try{
  onStage({kind:'loading',label:'Carregando o processador FFmpeg no navegador...'})
  await ffmpeg.load({
   coreURL:await toBlobURL(CORE_BASE+'/ffmpeg-core.js','text/javascript'),
   wasmURL:await toBlobURL(CORE_BASE+'/ffmpeg-core.wasm','application/wasm')
  })
  loaded=true
  if(signal?.aborted)throw Error('transcription_cancelled')
  onStage({kind:'preparing',label:'Extraindo e separando o áudio no navegador (sem porcentagem estimada)...'})
  await ffmpeg.writeFile(input,await fetchFile(file))
  const code=await ffmpeg.exec([
   '-nostdin','-hide_banner','-loglevel','error','-i',input,
   '-vn','-map','0:a:0','-ac','1','-ar','16000',
   '-c:a','libmp3lame','-b:a',MP3_BITRATE,
   '-f','segment','-segment_time',String(SEGMENT_SECONDS),
   '-reset_timestamps','1','part-%03d.mp3'
  ])
  if(code!==0)throw Error('media_conversion_failed')
  await ffmpeg.deleteFile(input)
  const filenames=segmentFileNames(await ffmpeg.listDir('/'))
  const parts=[]
  for(let i=0;i<filenames.length;i++){
   if(signal?.aborted)throw Error('transcription_cancelled')
   const segment=await ffmpeg.readFile(filenames[i])
   if(typeof segment==='string'||segment.byteLength<1000||segment.byteLength>MAX_PART_BYTES)throw Error('media_segment_size_invalid')
   // Transfer to Blob before discarding virtual filesystem segment.
   const blob=new Blob([segment],{type:'audio/mpeg'})
   await ffmpeg.deleteFile(filenames[i])
   onStage({kind:'transcribing',label:'Transcrevendo trecho '+(i+1)+' de '+filenames.length+'...',done:i,total:filenames.length})
   const response=await processPart(blob,i,filenames.length)
   if(typeof response?.text!=='string'||response.text.trim().length<10)throw Error('transcription_empty')
   parts.push({index:i,text:response.text})
   onStage({kind:'transcribing',label:'Trecho '+(i+1)+' de '+filenames.length+' concluído',done:i+1,total:filenames.length})
  }
  return parts
 }finally{
  // Even on failure/cancellation, release WASM memory and virtual media files.
  if(loaded)ffmpeg.terminate()
 }
}
