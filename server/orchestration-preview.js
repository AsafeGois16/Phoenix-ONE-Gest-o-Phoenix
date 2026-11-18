/**
 * Fase 1: política de orquestração para homologação isolada.
 * Não importa SDKs, não acessa rede, não grava tickets e não é chamada
 * pelo endpoint /v1/conversations/respond. Destinos são lógicos, não filas Junior.
 */
import {classifyConversationIntent} from './agent-routing.js'
import {isAdministrativeMovementRequest} from './backoffice-routing.js'

export const MODES=Object.freeze({CLARA_ONLY:'clara_only',CLARA_MURILO:'clara_murilo'})
export const DEFAULT_MODE=MODES.CLARA_MURILO
export const STORAGE_KEY='phoenix-one:orchestration:preview:v1'
export function normalizeMode(value){return Object.values(MODES).includes(value)?value:DEFAULT_MODE}
export function readPreviewMode(storage){
 try{return normalizeMode(storage.getItem(STORAGE_KEY))}catch{return DEFAULT_MODE}
}
export function savePreviewMode(storage,value){
 if(!Object.values(MODES).includes(value))return false
 try{storage.setItem(STORAGE_KEY,value);return true}catch{return false}
}
export const TARGETS=Object.freeze({
 auto_re:'Comercial Auto/RE',health:'Comercial Saúde e Benefícios',
 life:'Comercial Vida',other:'Comercial responsável pelo produto'
})
const products=[
 ['Auto','auto_re',/\b(?:auto(?:movel)?|carros?|veiculos?)\b/],
 ['Moto','auto_re',/\b(?:motos?|motocicletas?)\b/],
 ['Frota','auto_re',/\b(?:frotas?|utilitarios?)\b/],
 ['Residencial','auto_re',/\b(?:residencial|residencia|casa|imovel)\b/],
 ['Empresarial','auto_re',/\b(?:seguro empresarial|patrimonial|seguro para (?:minha |a )?empresa)\b/],
 ['Saúde','health',/\b(?:saude|plano medico|convenio medico)\b/],
 ['Odonto','health',/\b(?:odonto\w*|dentari[oa])\b/],
 ['Vida','life',/\b(?:seguro (?:de )?vida|vida em grupo|vida individual|vida)\b/],
 ['Viagem','other',/\b(?:viagem|viagens)\b/],
 ['Pet','other',/\b(?:pet|animais de estimacao)\b/],
 ['Bike','other',/\b(?:bike|bicicletas?)\b/],
 ['Cyber','other',/\b(?:cyber|cibernetic[oa])\b/],
 ['Equipamentos','other',/\b(?:equipamentos?|maquinas)\b/],
 ['Responsabilidade Civil','other',/\b(?:responsabilidade civil|rc)\b/],
 ['Garantia','other',/\b(?:seguro garantia|garantia contratual)\b/],
 ['Fiança Locatícia','other',/\b(?:fianca locaticia)\b/],
 ['Previdência','other',/\b(?:previdencia)\b/],
 ['Rural','other',/\b(?:rural|agricola)\b/]
]
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const yes=/^(?:sim|sim[,. ]+pode|pode|pode sim|pode encaminhar|pode transferir|autorizo|confirmo|claro|tudo bem|ok|por favor)[!., ]*$/
const no=/^(?:nao|nao obrigado|nao obrigada|prefiro nao|agora nao|nao quero)[!., ]*$/
const directHuman=t=>/\b(?:quero falar|preciso falar|me encaminhe|me transfira|pode encaminhar|pode transferir)\b.{0,100}\b(?:comercial|consultor|atendente|humano|especialista)\b/.test(t)
const emergency=t=>/\b(?:incendio|fogo|ferid[oa]s?|socorro|emergencia|urgencia|acidente|roubad[oa]|alagad[oa]|ransomware)\b/.test(t)&&!/\b(?:cotacao|cotar|contratar|cobertura para|seguro contra)\b/.test(t)
const service=t=>/\b(?:sinistro|reembolso|boleto|fatura|carteirinha|negativa|autorizacao|internacao|cirurgia|segunda via|cancelamento|cancelar|guincho|movimentacao)\b/.test(t)
const newTopic=t=>/^(?:outro assunto|tenho outra duvida|quero falar de outro assunto)[.! ]*$/.test(t)
function identify(text){
 // "Frota de carros" e "plano de saúde empresarial" não são dois produtos.
 const t=fold(text),found=products.filter(p=>p[2].test(t))
 if(found.some(p=>p[0]==='Frota'))return found.filter(p=>p[0]!=='Auto'&&p[0]!=='Moto')
 return found
}
export function newPreviewProtocol(mode=DEFAULT_MODE){
 return {mode:normalizeMode(mode),phase:'initial',product:null,target:null}
}
function result(state,decision,reply,partial={}){
 return {state:{...state,...partial},agent:'clara',decision,reply,
  proposedTarget:null,consentPending:false,executed:false}
}
function offer(state,p){
 const next={phase:state.mode===MODES.CLARA_ONLY?'offer_human':'offer_murilo',product:p[0],target:p[1]}
 if(state.mode===MODES.CLARA_ONLY)return {...result(state,'offer_human',
  'Posso encaminhar sua solicitação de '+p[0]+' à equipe de '+TARGETS[p[1]]+' para continuar o atendimento?',next),consentPending:true,proposedTarget:p[1]}
 return {...result(state,'offer_murilo','Posso passar sua conversa ao Murilo, nosso assistente comercial, para continuar a cotação de '+p[0]+'?',next),consentPending:true}
}
export function previewDecision(state,message){
 const s=newPreviewProtocol(state?.mode)
 const current={...s,...state,mode:s.mode}
 const t=fold(message)
 const reset={phase:'initial',product:null,target:null}
 if(!t)return result(current,'no_message','Digite uma mensagem fictícia.')
 if(current.phase==='closed')return result(current,'protocol_closed','Inicie um novo protocolo fictício para simular outro atendimento.')
 // Segurança e demandas operacionais precedem toda oferta comercial.
 if(emergency(t))return result(current,'safety_first','Prioridade à segurança. Este cenário deve seguir o fluxo de urgência e atendimento humano já existente.',reset)
 if(isAdministrativeMovementRequest(message)||service(t)||classifyConversationIntent(message)==='service'&&!directHuman(t))
  return result(current,'existing_service','Clara mantém o fluxo existente de relacionamento, identificação segura e encaminhamento operacional.',reset)
 if(newTopic(t))return result(current,'new_topic','Claro! Em que posso ajudar?',reset)
 if(current.phase==='offer_human'||current.phase==='offer_murilo'){
  if(no.test(t))return result(current,'declined','Tudo bem, não farei o encaminhamento. Em que mais posso ajudar?',reset)
  if(yes.test(t)||directHuman(t)&&identify(t).length===0){
   if(current.phase==='offer_human'&&current.mode===MODES.CLARA_ONLY&&TARGETS[current.target])
    return {...result(current,'propose_handoff','Obrigado pela confirmação. Vou solicitar o encaminhamento à equipe responsável.',{phase:'closed'}),proposedTarget:current.target}
   if(current.phase==='offer_murilo'&&current.mode===MODES.CLARA_MURILO)
    return {...result(current,'murilo_qualification','Murilo assume a qualificação comercial existente nesta simulação.',{phase:'murilo'}),agent:'murilo'}
  }
 }
 if(current.phase==='murilo'&&current.mode===MODES.CLARA_MURILO&&classifyConversationIntent(message)!=='sales')
  return {...result(current,'murilo_qualification','Murilo mantém a qualificação comercial existente nesta simulação.'),agent:'murilo'}
 const found=identify(message)
 const sales=classifyConversationIntent(message)==='sales'||directHuman(t)&&/\bcomercial\b/.test(t)||
  /\b(?:quero|gostaria|tenho interesse)\b.{0,50}\b(?:plano de saude|seguro|odonto)\b/.test(t)
 const clarifying=current.phase==='clarify_product'
 const replacing=(current.phase==='offer_human'||current.phase==='offer_murilo')&&found.length>0
 if(sales||clarifying||replacing){
  if(found.length!==1)return result(current,'ask_product','Qual produto de seguro ou benefício você deseja avaliar?',{phase:'clarify_product',product:null,target:null})
  if(current.mode===MODES.CLARA_ONLY&&directHuman(t))return {...result(current,'propose_handoff','Vou solicitar o encaminhamento à equipe responsável.',{phase:'closed',product:found[0][0],target:found[0][1]}),proposedTarget:found[0][1]}
  return offer(current,found[0])
 }
 if(current.phase==='offer_human'||current.phase==='offer_murilo')return result(current,'wait_for_consent','Deseja o encaminhamento que ofereci ou prefere continuar por aqui?')
 return result(current,'clara_service','Clara permanece no atendimento inicial, sem presumir interesse comercial.',reset)
}
