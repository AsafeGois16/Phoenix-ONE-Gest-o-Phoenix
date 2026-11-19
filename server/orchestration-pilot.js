import {protocolBase} from './orchestration-protocol-strategy.js'
// Global selection on the existing API. Explicit false is emergency rollback.
// The authenticated Bridge reads the current global mode on every request.
// No fixed protocol pin or date cutoff is used in the official operation.
export async function resolvePilotMode(body,env,bridge,observed={}){
 if(env.VERCEL_ENV!=='production'||env.PHX_ORCHESTRATION_PILOT_ENABLED==='false')return null
 if(body.mode==='desligado'||body.messages?.at(-1)?.direction!=='inbound'||body.messages?.at(-1)?.author!=='contact'||!body.messages.at(-1)?.text?.trim())return null
 protocolBase(body.protocolo)
 const row=await bridge('orchestration_pilot_pin',{conversationId:body.conversation_id,protocolo:body.protocolo,observedClara:observed.clara===true,observedMurilo:observed.murilo===true},AbortSignal.timeout(2800))
 if(row?.blocked===true)throw Error('protocol_not_with_agent')
 if(!row||!['clara_only','clara_murilo'].includes(row.mode)||!Number.isSafeInteger(row.revision)||row.revision<1||row.blocked!==false||typeof row.clara_apresentada!=='boolean'||typeof row.murilo_apresentado!=='boolean')throw Error('invalid_orchestration_pin')
 return {mode:row.mode,revision:row.revision,intro:{blocked:false,clara_apresentada:row.clara_apresentada,murilo_apresentado:row.murilo_apresentado}}
}
