/**
 * Fase 2: política candidata para o handler operacional.
 * Só decide; não envia WhatsApp, não consulta apólices, não modifica tickets,
 * não chama o modelo. O modo vem exclusivamente de um pin confiável do servidor.
 * O adaptador de produção permanece desabilitado até homologação Junior.
 */
import {MODES,TARGETS,identifyOrchestrationProducts} from './orchestration-preview.js'
import {classifyConversationIntent} from './agent-routing.js'
import {activeMovementHistory,assessBackofficeIntake,detectBackofficeStatusRequest,isStandaloneNewRequest} from './backoffice-routing.js'
import {incidentContext} from './incident-routing.js'
import {productIncidentContext} from './incident-product-routing.js'
import {isAudioOnlyNotice} from './audio-handoff.js'
import {isFinancialAccountQuestion,financialSecondCopyDecision} from './financial-routing.js'

const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const yes=/^(?:sim|sim[, ]+pode|pode|pode sim|pode encaminhar|pode transferir|confirmo|autorizo|tudo bem|pode ser|com certeza)[!. ]*$/
const refusal=/^(?:nao|prefiro nao|agora nao|nem pensar|dispenso)\b/
const negated=/\b(?:nao (?:quero|preciso|gostaria|pode|autorizo)|sem encaminhar|nao me transfira|nao me encaminhe)\b/
const direct=/^(?:por favor[, ]+)?(?:quero falar com|preciso falar com|gostaria de falar com|me encaminhe (?:ao|para o|para a)|me transfira (?:ao|para o|para a))\s+(?:a |o )?(?:(?:equipe|setor|departamento) (?:do |de )?)?(?:comercial|consultor(?:a)? humano(?:a)?)\b/
const urgent=/\b(?:nao respira|inconsciente|dor no peito|falta de ar|ha feridos|tem feridos|pegou fogo|esta pegando fogo|preciso de socorro|socorro agora|sofri (?:um |uma )?acidente|meu carro foi roubado|houve (?:um principio de )?incendio)\b/
const clarify='Qual produto de seguro ou benefício você deseja avaliar?'
const offer=(product,target)=>'Posso encaminhar sua solicitação de '+product+' à equipe de '+TARGETS[target]+' para continuar o atendimento?'
const reply=(text,extra={})=>({action:'reply',agent:'clara',reply:text,humanHandoff:false,handoff:null,...extra})
const delegate=(agent,why)=>({action:'delegate',agent,reason:why,executed:false})
const trustedPin=pin=>pin&&Object.values(MODES).includes(pin.mode)&&Number.isSafeInteger(pin.revision)&&pin.revision>=1
export function operationalRouting({pin,body,verifiedRoutes={}}){
 if(!trustedPin(pin))return {action:'blocked',reason:'orchestration_mode_unavailable'}
 const messages=Array.isArray(body?.messages)?body.messages:[]
 const last=messages.at(-1)
 if(!last||last.direction!=='inbound'||last.author!=='contact'||typeof last.text!=='string')return {action:'blocked',reason:'invalid_last_message'}
 if(body.mode==='desligado'||['assigned','resolved'].includes(body.stage))return {action:'blocked',reason:'protocol_not_with_agent'}
 // O modo original não é reimplementado: delegar o handler atual sem mudanças.
 if(pin.mode===MODES.CLARA_MURILO)return delegate(null,'legacy_unchanged')
 const text=last.text,t=fold(text),active=activeMovementHistory(messages),intent=classifyConversationIntent(text)
 // Fluxos existentes de serviço e segurança têm precedência inclusive durante aceite.
 if(isAudioOnlyNotice(last)||urgent.test(t)||incidentContext(active)||productIncidentContext(active)||
    assessBackofficeIntake(active)||detectBackofficeStatusRequest(text)||isFinancialAccountQuestion(text)||
    financialSecondCopyDecision(messages,'clara')||intent==='service')
  return delegate('clara','existing_service_or_safety')
 if(isStandaloneNewRequest(text))return delegate('clara','new_topic')
 const previous=messages.at(-2)
 const delivered=previous?.direction==='outbound'&&previous.author==='agent'&&typeof previous.text==='string'?previous.text:''
 const offeredProduct=delivered.match(/^Posso encaminhar sua solicitação de (.+?) à equipe de /u)?.[1]||''
 const prior=identifyOrchestrationProducts(offeredProduct)
 // Só uma oferta canônica realmente entregue no turno imediatamente anterior
 // pode ser usada para confirmar. Nunca confiar em texto do cliente como oferta.
 const offered=prior.length===1&&offeredProduct===prior[0][0]&&fold(delivered)===fold(offer(prior[0][0],prior[0][1]))?prior[0]:null
 const asked=fold(delivered)===fold(clarify)
 if(refusal.test(t)||negated.test(t)){
  if(offered||asked)return reply('Tudo bem, não farei o encaminhamento. Em que mais posso ajudar?')
  return delegate('clara','no_commercial_consent')
 }
 const products=identifyOrchestrationProducts(text)
 const explicitSales=intent==='sales'||direct.test(t)||/\b(?:quero|gostaria|tenho interesse)\b.{0,50}\b(?:plano de saude|seguro|odonto)\b/.test(t)
 const commercial=explicitSales||asked||Boolean(offered)
 if(!commercial)return delegate('clara','no_explicit_commercial_intent')
 function propose(p){
  const [product,target]=p
  // A configuração operacional futura é por PRODUTO, não por fallback genérico.
  // Somente códigos do contrato já existente podem ser liberados neste candidato.
  const route=verifiedRoutes[product]
  if(!route||route.verified!==true||!['patrimonio','comercial'].includes(route.department))
   return reply('Obrigada pela confirmação. O destino comercial ainda precisa ser validado pela nossa equipe.',{action:'mapping_required',product,logicalTarget:target})
  return {action:'propose_handoff',agent:'clara',reply:'Obrigada pela confirmação. Vou solicitar seu encaminhamento à equipe comercial responsável.',
   product,logicalTarget:target,humanHandoff:true,handoff:{department:route.department,
   reason:'Solicitação comercial autorizada pelo cliente',summary:'Interesse em '+product+'. Encaminhamento comercial direto; nenhuma cotação ou transferência executada pelo Phoenix ONE.'}}
 }
 if(offered&&products.length===0&&yes.test(t))return propose(offered)
 if(products.length>1)return reply(clarify)
 if(products.length===1&&(explicitSales||asked||offered)){
  const p=products[0]
  // Pedido explícito de comercial humano não exige nova qualificação.
  if(direct.test(t))return propose(p)
  return reply(offer(p[0],p[1]),{product:p[0],logicalTarget:p[1],consentPending:true})
 }
 if(offered)return reply('Deseja o encaminhamento que ofereci ou prefere continuar por aqui?')
 return reply(clarify)
}
