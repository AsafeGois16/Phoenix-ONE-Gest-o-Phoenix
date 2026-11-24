/**
 * Identificador do protocolo do Junior: AAAAMMDD-NNNN, opcionalmente -N
 * após vinculação a um caso anterior. Nunca usar o número citado pelo cliente
 * em vez do protocolo recebido na requisição atual.
 */
export const validJuniorProtocol = value =>
 typeof value==='string' && /^\d{8}-\d{4}(?:-[1-9]\d*)?$/.test(value)


/**
 * Detecta possíveis referências de outros protocolos em mensagens já enviadas
 * por agentes. Apenas retorna um indicador; nunca troca protocolo, transfere,
 * reabre atendimento ou revela identificadores nos logs.
 *
 * A apresentação visual do protocolo automático e a associação
 * conversation_id/protocolo pertencem ao Gestão Phoenix (Junior).
 */
export function hasOutboundProtocolMismatch(messages,currentProtocol){
 if(!validJuniorProtocol(currentProtocol))return false
 const list=Array.isArray(messages)?messages:[]
 return list.some(m=>{
  if(m?.direction!=='outbound'||m.author!=='agent'||typeof m.text!=='string')return false
  const evidence=m.text.match(/\bprotocolo(?:\s+(?:do|de)\s+seu?\s+atendimento)?\s*[:#* -]+\s*(\d{8}-\d{4}(?:-[1-9]\d*)?)\b/i)
  return Boolean(evidence&&evidence[1]!==currentProtocol)
 })
}
