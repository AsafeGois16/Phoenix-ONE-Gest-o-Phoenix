// Synthetic, non-user audio integration smoke test. Preview branch ONLY.
// No credentials, filenames from users, or transcription text in build logs.
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/knowledge-hub-transcription'){
 const key=process.env.OPENAI_API_KEY
 if(!key){console.log('HUB_TRANSCRIBE_PROBE',JSON.stringify({passed:false,reason:'key_missing'}));process.exitCode=1}
 else{
  const rate=16000,samples=rate*2,data=new ArrayBuffer(44+samples*2),view=new DataView(data)
  const txt=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i))}
  txt(0,'RIFF');view.setUint32(4,data.byteLength-8,true);txt(8,'WAVE');txt(12,'fmt ')
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true)
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true)
  view.setUint16(34,16,true);txt(36,'data');view.setUint32(40,samples*2,true)
  for(let i=0;i<samples;i++)view.setInt16(44+i*2,Math.round(1700*Math.sin(2*Math.PI*190*i/rate)),true)
  const fd=new FormData()
  fd.append('file',new Blob([data],{type:'audio/wav'}),'synthetic-tone.wav')
  fd.append('model','gpt-transcribe')
  fd.append('response_format','json')
  try{
   const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{
    method:'POST',headers:{Authorization:'Bearer '+key},body:fd,signal:AbortSignal.timeout(42000)
   })
   const response=await r.json().catch(()=>({}))
   const ok=r.ok&&typeof response.text==='string'
   console.log('HUB_TRANSCRIBE_PROBE',JSON.stringify({passed:ok,status:r.status,model:'gpt-transcribe',hasTextField:typeof response.text==='string'}))
   if(!ok)process.exitCode=1
  }catch(e){console.log('HUB_TRANSCRIBE_PROBE',JSON.stringify({passed:false,reason:e.name==='TimeoutError'?'timeout':'network'}));process.exitCode=1}
 }
}
