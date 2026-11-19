import {protocolBase} from './orchestration-protocol-strategy.js'
export async function resolvePilotMode(body,env,bridge){
 // No additional database read or behavior change for legacy traffic.
 if(env.VERCEL_ENV!=='production'||env.PHX_ORCHESTRATION_PILOT_ENABLED!=='true')return null
 const phone=env.PHX_ORCHESTRATION_PILOT_PHONE
 if(!/^\+55[1-9]\d{9,10}$/.test(phone||'')||body.contact?.phone_e164!==phone)return null
 if(body.mode==='desligado'||body.messages?.at(-1)?.direction!=='inbound'||body.messages?.at(-1)?.author!=='contact')return null
 protocolBase(body.protocolo)
 const row=await bridge('orchestration_pilot_pin',{conversationId:body.conversation_id,protocolo:body.protocolo},AbortSignal.timeout(2500))
 if(!row||!['clara_only','clara_murilo'].includes(row.mode)||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('invalid_pilot_pin')
 return row
}
