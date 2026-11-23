// Pure, provider-independent safety helpers for Knowledge Hub large-media jobs.
// No storage access and no external side effects. Not wired to production.
export const MAX_LARGE_MEDIA_BYTES=500_000_000
export const MAX_SEGMENTS=160
export const SEGMENT_TARGET_BYTES=15_000_000
export const LARGE_MEDIA_STATES=Object.freeze([
 'created','uploading','uploaded','extracting','chunking','transcribing',
 'assembling','review_ready','failed','expired','cancelled'
])
const edges={
 created:['uploading','cancelled'],
 uploading:['uploaded','failed','cancelled','expired'],
 uploaded:['extracting','failed','cancelled','expired'],
 extracting:['chunking','failed','cancelled','expired'],
 chunking:['transcribing','failed','cancelled','expired'],
 transcribing:['assembling','failed','cancelled','expired'],
 assembling:['review_ready','failed','cancelled','expired'],
 review_ready:['expired'],
 failed:['expired'],
 cancelled:['expired'],
 expired:[]
}
export function mayAdvance(from,to){
 return typeof from==='string'&&typeof to==='string'&&!!edges[from]?.includes(to)
}
export function validateLargeMedia({size,name,userId,path}){
 const validUid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!validUid.test(userId||''))throw Error('invalid_user_id')
 if(!Number.isSafeInteger(size)||size<=0||size>MAX_LARGE_MEDIA_BYTES)throw Error('media_size_invalid')
 if(typeof name!=='string'||name.length>180||!/^.{1,175}\.(mp4|webm|mov|m4a|mp3|wav)$/i.test(name))throw Error('media_type_invalid')
 // Never accept user-supplied arbitrary bucket paths. Require UID/UUID.ext.
 if(typeof path!=='string'||!new RegExp('^'+userId+'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(mp4|webm|mov|m4a|mp3|wav)$','i').test(path))throw Error('media_path_invalid')
 return true
}
export function assembleTranscript(parts){
 if(!Array.isArray(parts)||!parts.length||parts.length>MAX_SEGMENTS)throw Error('invalid_segments')
 const ordered=[...parts].sort((a,b)=>a.index-b.index)
 for(let i=0;i<ordered.length;i++){
  const p=ordered[i]
  if(!Number.isInteger(p.index)||p.index!==i||typeof p.text!=='string'||!p.text.trim()||p.text.length>20_000)throw Error('invalid_segment')
  if(!Number.isFinite(p.startMs)||p.startMs<0||!Number.isFinite(p.endMs)||p.endMs<=p.startMs)throw Error('invalid_timestamps')
  if(i&&p.startMs<ordered[i-1].startMs)throw Error('out_of_order_timestamps')
 }
 // Preserve all words. Any overlap deduplication requires explicit alignment,
 // not simplistic string removal that might erase naturally repeated speech.
 return ordered.map(p=>`[${formatMs(p.startMs)} – ${formatMs(p.endMs)}] ${p.text.trim()}`).join('\n\n')
}
function formatMs(ms){
 const sec=Math.floor(ms/1000)
 return String(Math.floor(sec/3600)).padStart(2,'0')+':'+String(Math.floor(sec%3600/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')
}
