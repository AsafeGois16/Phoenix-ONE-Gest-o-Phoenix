/**
 * Knowledge Hub transient audio transcription, no persistence.
 * gpt-transcribe is preferred to deprecated whisper-1.
 */
export const TRANSCRIBE_BUCKET='phoenix-hub-transcription-temp'
export const TRANSCRIBE_MAX_BYTES=24000000
export const TRANSCRIBE_MODEL='gpt-transcribe'
const extensions=new Map([
 ['mp3','audio/mpeg'],['mpga','audio/mpeg'],['mpeg','audio/mpeg'],
 ['m4a','audio/mp4'],['mp4','video/mp4'],['wav','audio/wav'],
 ['ogg','audio/ogg'],['webm','audio/webm'],['flac','audio/flac']
])
export class TranscriptionError extends Error{
 constructor(code,status=422){super(code);this.name='TranscriptionError';this.status=status}
}
export const mediaExtension=name=>{
 const ext=String(name||'').split('.').pop()?.toLowerCase()
 return extensions.has(ext)?ext:null
}
export const mediaContentType=ext=>extensions.get(ext)||null
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validOwnedPath(path,userId){
 if(typeof path!=='string'||path.length>130||typeof userId!=='string'||!uid.test(userId))return null
 const match=path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]{3,5})$/i)
 if(!match||!uid.test(match[1])||!uid.test(match[2])||match[1].toLowerCase()!==userId.toLowerCase())return null
 return extensions.has(match[3])?match[3]:null
}
export async function validateMedia(blob,filename){
 if(!blob||!Number.isFinite(blob.size)||blob.size<1000)throw new TranscriptionError('media_too_short')
 if(blob.size>TRANSCRIBE_MAX_BYTES)throw new TranscriptionError('media_too_large',413)
 const ext=mediaExtension(filename)
 if(!ext)throw new TranscriptionError('media_unsupported_format')
 const start=new Uint8Array(await blob.slice(0,48).arrayBuffer())
 const ascii=(a,b)=>String.fromCharCode(...start.slice(a,b))
 const mp3=ascii(0,3)==='ID3'||start[0]===255&&(start[1]&224)===224
 const iso=ascii(4,8)==='ftyp'
 const wav=ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'
 const webm=start[0]===0x1a&&start[1]===0x45&&start[2]===0xdf&&start[3]===0xa3
 const ogg=ascii(0,4)==='OggS'
 const flac=ascii(0,4)==='fLaC'
 const ok=ext==='mp3'||ext==='mpeg'||ext==='mpga'?mp3:ext==='mp4'||ext==='m4a'?iso:
  ext==='wav'?wav:ext==='webm'?webm:ext==='ogg'?ogg:ext==='flac'?flac:false
 if(!ok)throw new TranscriptionError('media_invalid_content')
 return {extension:ext,mime:mediaContentType(ext),bytes:blob.size}
}
export async function transcribeMedia(blob,{filename,apiKey,language='auto',fetcher=fetch}={}){
 const meta=await validateMedia(blob,filename)
 if(typeof apiKey!=='string'||!apiKey)throw new TranscriptionError('transcription_not_configured',503)
 const data=new FormData()
 data.append('file',new Blob([blob],{type:meta.mime}),'recording.'+meta.extension)
 data.append('model',TRANSCRIBE_MODEL)
 data.append('response_format','json')
 if(language==='pt')data.append('language','pt')
 data.append('prompt','Termos para preservar quando pronunciados: Phoenix Insurance, Bradesco Saúde, Amil, Hapvida, SulAmérica, Porto Seguro, corretora de seguros, apólice, sinistro, carência, coparticipação.')
 let response
 try{response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{
   method:'POST',
   headers:{Authorization:'Bearer '+apiKey},
   body:data,
   signal:AbortSignal.timeout(165000)
  })}
 catch(e){if(['AbortError','TimeoutError'].includes(e?.name))throw new TranscriptionError('transcription_timeout',504);throw new TranscriptionError('transcription_service_unavailable',503)}
 if(!response.ok){
  if(response.status===429)throw new TranscriptionError('transcription_rate_limited',429)
  if(response.status===401||response.status===403)throw new TranscriptionError('transcription_provider_unauthorized',503)
  if(response.status===413)throw new TranscriptionError('media_too_large',413)
  throw new TranscriptionError('transcription_provider_error',503)
 }
 let json
 try{json=await response.json()}catch{throw new TranscriptionError('transcription_invalid_response',502)}
 if(typeof json?.text!=='string'||json.text.trim().length<10)throw new TranscriptionError('transcription_empty',422)
 const text=json.text.replace(/\u0000/g,'').trim()
 if(text.length>145000)throw new TranscriptionError('transcription_too_long',413)
 return {text,model:TRANSCRIBE_MODEL,bytes:meta.bytes}
}
