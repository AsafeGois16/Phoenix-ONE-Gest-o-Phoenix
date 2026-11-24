/**
 * Continuidade de RENOVAÇÃO Auto com consulta VERIFICADA ao cadastro do Junior.
 * Nenhum veículo, apólice, seguradora, número, placa, modelo ou perfil pessoal
 * é devolvido pela regra: somente existência de Seguro Auto como categoria.
 *
 * Segurança: a decisão recebe APENAS resultado verified do bridge
 * identity_context (purpose quote, product_code auto), no mesmo protocolo.
 * Não validar por telefone/nome/CNPJ isolado. Sem comprovação, sem
 * confirmar existência; sem acesso automático a contrato.
 */
import {detectSdrQuoteProduct} from './murilo-sdr-flow.js'
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const incoming=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outgoing=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const offerMarker='seguro auto cadastrado'
const yes=/^(?:sim|s|sim pode|pode sim|sim por favor|claro|pode encaminhar|quero sim|confirmo|autorizo|pode ser)[.! ]*$/
const no=/^(?:nao|nao obrigado|nao obrigada|prefiro nao|agora nao|nao quero)[.! ]*$/
const pending=reply=>({agent:'murilo',reply,humanHandoff:false,handoff:null})
const messagesOf=x=>Array.isArray(x)?x:[]
const autoInPolicies=verification=>{
 if(verification?.status!=='verified'||!Array.isArray(verification.policies))return false
 // O backend v4 já faz filtro do produto Auto e escopo policies.read.
 // O texto livre automóvel ou modelos de veículo não é prova suficiente.
 return verification.policies.some(p=>p?.product_code==='auto')
}
export function isAutoRenewalForVerification(messages){
 const list=messagesOf(messages)
 if(detectSdrQuoteProduct(list)!=='auto')return false
 const content=list.filter(incoming).map(m=>fold(m.text)).join(' ')
 return /\b(?:renovar|renovacao|renovando|renove)\b/.test(content)&&
  !/\b(?:abrir sinistro|acionar sinistro|segunda via|cancelar apolice)\b/.test(content)
}
export function isAutoPortfolioOffer(text){
 const s=fold(text)
 return s.includes(offerMarker)&&/\bposso encaminhar\b/.test(s)&&/\bauto\/re\b/.test(s)
}
function lastAgent(list){return list.slice(0,-1).reverse().find(outgoing)}
function previouslyDeclined(list){
 return list.some((m,i)=>outgoing(m)&&isAutoPortfolioOffer(m.text)&&
  list.slice(i+1).some(v=>incoming(v)&&no.test(fold(v.text))))
}
export function verifiedAutoPortfolioDecision(messages,verification){
 const list=messagesOf(messages),latest=list.at(-1)
 if(!incoming(latest)||!isAutoRenewalForVerification(list))return null
 const lastOffer=lastAgent(list)
 const confirming=Boolean(lastOffer&&isAutoPortfolioOffer(lastOffer.text))
 const answer=fold(latest.text)
 if(confirming){
  if(no.test(answer))return null // triagem normal; sem repetir consulta
  if(yes.test(answer)){
   if(!autoInPolicies(verification))
    return pending('Não foi possível manter a confirmação do cadastro nesta etapa. Vamos continuar com as informações da renovação e a equipe poderá verificar o vínculo com segurança.')
   return {agent:'murilo',
    reply:'Perfeito! Vou solicitar seu encaminhamento à equipe de Auto/RE para continuar a renovação.',
    humanHandoff:true,
    handoff:{
     department:'patrimonio',intent:'nova_cotacao',product:'auto',
     reason:'Cliente autorizou atendimento humano para renovação Auto com cadastro verificado',
     summary:'Renovação de Seguro Auto. Existência de apólice Auto confirmada via consulta autenticada do Junior para este protocolo. Cliente autorizou transferência à equipe Auto/RE. Identificar veículo e demais dados somente na gestão.'
    }}
  }
  // Não interpretar frases livres como aprovação de consulta ou transferência.
  return pending('Para confirmar: deseja que eu encaminhe a renovação do Seguro Auto cadastrado à equipe Auto/RE? Pode responder sim ou não.')
 }
 if(previouslyDeclined(list))return null
 if(!autoInPolicies(verification))return null
 if(list.some(m=>outgoing(m)&&isAutoPortfolioOffer(m.text)))return null
 return pending('Encontrei um Seguro Auto cadastrado após a confirmação de identidade. Posso encaminhar sua renovação diretamente à equipe Auto/RE?')
}
