import {clientDeclaredName} from './commercial-intake.js'
import {muriloTransferInvitation} from './murilo-transfer-invitation.js'
import {observedAgentIntroductions} from './conversation-policy.js'

/**
 * A nova cotação em clara_murilo começa pela Clara.
 *
 * Gestão Phoenix pode inserir um aviso automático de protocolo antes da
 * primeira mensagem dos agentes. Esse aviso NÃO é apresentação.
 * nameIntakeDecision sozinho pode ignorar o primeiro atendimento por ver o
 * outbound administrativo. Aqui as flags do Bridge e as apresentações REAIS
 * determinam a abertura, nunca agent_hint nem contact.kind.
 *
 * Não troca agente nem abre lead. O consentimento fica com as regras atuais.
 */
const fold=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

export function firstClaraForNewQuote({pin,introState,messages,selectedAgent}={}){
 if(pin?.mode!=='clara_murilo'||selectedAgent!=='murilo')return null
 if(!introState||introState.blocked||
  introState.clara_apresentada!==false||introState.murilo_apresentado!==false)return null
 const history=Array.isArray(messages)?messages:[]
 const last=history.at(-1)
 if(last?.direction!=='inbound'||last.author!=='contact'||!String(last.text||'').trim())return null
 const seen=observedAgentIntroductions(history)
 if(seen.clara||seen.murilo)return null
 // Solicitação inequívoca para falar com pessoa real deve seguir o guard
 // de handoff humano, sem exigir a etapa de saudação.
 const text=fold(last.text)
 if(/\b(?:falar com|me transfira para|me encaminhe para|quero (?:um |uma )?atendente|quero (?:um |uma )?consultor|atendimento humano)\b/.test(text))return null
 const name=clientDeclaredName(history)
 const reply=name?
  muriloTransferInvitation(history,{name,verb:'passar'}):
  'Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. 💙\n\nComo posso te chamar?'
 return {agent:'clara',reply,humanHandoff:false,handoff:null}
}
