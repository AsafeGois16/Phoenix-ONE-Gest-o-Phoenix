
import {bridge} from '../server/junior-v1.js'
import {resolvePilotMode,orchestrationErrorCode} from '../server/orchestration-pilot.js'
// One synthetic integration fixture only, no model, no calls to Junior.
// Temporary diagnostic on this preview branch. Never log credentials or payloads.
if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='feat/orquestracao-integracao-atual'){
 const body={conversation_id:'f916b858-26dd-492a-9bde-550898770203',protocolo:'20991231-9473',mode:'sugestao',messages:[{direction:'inbound',author:'contact',text:'Olá'}]}
 const start=Date.now()
 if(!process.env.PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN||!process.env.VITE_SUPABASE_URL){console.log('ORCHESTRATION_BRIDGE_PROBE config_missing');process.exit(1)}
 try{
  const pin=await resolvePilotMode(body,{VERCEL_ENV:'production'},bridge,{})
  console.log('ORCHESTRATION_BRIDGE_PROBE passed mode='+pin.mode+' revision='+pin.revision+' elapsedMs='+String(Date.now()-start))
 }catch(e){console.log('ORCHESTRATION_BRIDGE_PROBE failed reason='+orchestrationErrorCode(e)+' elapsedMs='+String(Date.now()-start));process.exit(1)}
}
