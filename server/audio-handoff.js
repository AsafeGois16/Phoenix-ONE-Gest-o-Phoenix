/**
 * Contrato Junior v1.2: o áudio não vem transcrito; apenas um aviso textual.
 * Não deduzir assunto, seguradora, risco nem documentação do conteúdo ausente.
 */
export function isAudioOnlyNotice(message){
 if(message?.direction!=='inbound'||message?.author!=='contact'||typeof message.text!=='string')return false
 const text=message.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
 return /^\[\s*cliente enviou um audio\s*\]$/.test(text)
}
const validDepartment=value=>typeof value==='string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value) && value!=='comercial'
export function audioHandoffDecision(body){
 const last=Array.isArray(body?.messages)?body.messages.at(-1):null
 if(!isAudioOnlyNotice(last))return null
 // Não usar comercial: transferência por Murilo pode abrir lead indevido.
 // Somente a fila informada pela gestão ou, na ausência, fila geral (null).
 const department=validDepartment(body?.contact?.department)?body.contact.department:null
 return {
  agent:'clara',
  reply:'Recebi seu áudio, mas não tenho acesso ao conteúdo por aqui. Vou encaminhar a um atendente da nossa equipe para ouvir e responder.',
  humanHandoff:true,
  handoff:{
   department,
   reason:'Cliente enviou áudio sem transcrição',
   summary:'Áudio recebido; conteúdo não disponível à IA. Atendimento humano necessário.'
  }
 }
}
