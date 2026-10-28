/** Curadoria supervisionada; o redator é um filtro inicial, não garante anonimização. */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AgentId } from './rag'

export type TicketResolvedEvent = {
  event_id:string; event_type:'ticket.resolved.v1'; occurred_at:string;
  ticket:{ id:string;category:string;department:string;resolution_summary:string;status:'resolved' }
}
export type LearningCandidate = {
  externalTicketId:string;title:string;sanitizedText:string;status:'pending';
  authorizedAgents:AgentId[];requiresHumanReview:true;possibleSensitiveContent:boolean
}
export function verifyWebhookSignature(rawBody:Buffer,secret:string,signature:string):boolean{
  if(!secret || !signature.startsWith('sha256='))return false
  const digest=createHmac('sha256',secret).update(rawBody).digest('hex')
  const received=signature.slice(7)
  if(!/^[a-f0-9]{64}$/i.test(received))return false
  return timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(received,'hex'))
}
export function preliminarilyRedact(text:string):string{
  return text
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[EMAIL REMOVIDO]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,'[CPF REMOVIDO]')
    .replace(/\b\d{11}\b/g,'[IDENTIFICADOR REMOVIDO]')
    .replace(/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g,'[TELEFONE REMOVIDO]')
}
export function proposeLearning(event:TicketResolvedEvent,agent:AgentId):LearningCandidate{
  if(event.event_type!=='ticket.resolved.v1'||event.ticket.status!=='resolved')throw new Error('Event is not an approved resolved-ticket type')
  const text=preliminarilyRedact(event.ticket.resolution_summary)
  return {externalTicketId:event.ticket.id,title:`Procedimento sugerido: ${event.ticket.category}`,
    sanitizedText:text,status:'pending',authorizedAgents:[agent],requiresHumanReview:true,
    possibleSensitiveContent:true}
}
// A aprovação real deve ser uma transação autenticada no backend que registra
// revisor, versão, permissões e publica somente após auditoria e reindexação.
