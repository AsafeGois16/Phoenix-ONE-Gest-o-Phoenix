import {validJuniorProtocol} from './protocol-contract.js'
// Global selection on the existing API. Explicit false is emergency rollback.
// The authenticated Bridge reads the current global mode on every request.
// No fixed protocol pin or date cutoff is used in the official operation.
export async function resolvePilotMode(body,env,bridge,observed={}){
 if(env.VERCEL_ENV!=='production'||env.PHX_ORCHESTRATION_PILOT_ENABLED==='false')return null
 if(body.mode==='desligado'||body.messages?.at(-1)?.direction!=='inbound'||body.messages?.at(-1)?.author!=='contact'||!body.messages.at(-1)?.text?.trim())return null
 if(!validJuniorProtocol(body.protocolo))throw Error('invalid_protocol')
 const params={conversationId:body.conversation_id,protocolo:body.protocolo,observedClara:observed.clara===true,observedMurilo:observed.murilo===true}
 let row
 for(let attempt=0;attempt<2;attempt++){
  try{row=await bridge('orchestration_pilot_pin',params,AbortSignal.timeout(attempt===0?2800:3500));break}
  catch(e){
   if(attempt===1||!['timeout','transport','bridge_unavailable'].includes(orchestrationErrorCode(e)))throw e
  }
 }
 if(row?.blocked===true)throw Error('protocol_not_with_agent')
 if(!row||!['clara_only','clara_murilo'].includes(row.mode)||!Number.isSafeInteger(row.revision)||row.revision<1||row.blocked!==false||typeof row.clara_apresentada!=='boolean'||typeof row.murilo_apresentado!=='boolean')throw Error('invalid_orchestration_pin')
 return {mode:row.mode,revision:row.revision,intro:{blocked:false,clara_apresentada:row.clara_apresentada,murilo_apresentado:row.murilo_apresentado}}
}

export function orchestrationErrorCode(e){
 if(['AbortError','TimeoutError'].includes(e?.name))return 'timeout'
 if(e?.name==='TypeError')return 'transport'
 const code=e?.message
 return ['invalid_protocol','protocol_not_with_agent','invalid_orchestration_pin','bridge_not_configured','bridge_unavailable','bridge_unauthorized','bridge_bad_response','bridge_failed','unknown_action','invalid_pilot_protocol'].includes(code)?code:'unexpected'
}
