import {detectSdrQuoteProduct} from './murilo-sdr-flow.js'
import {clientDeclaredName} from './commercial-intake.js'
import {muriloTransferInvitation} from './murilo-transfer-invitation.js'
import {healthLivesCheck} from './murilo-conversation-quality.js'
/**
 * Confirmações de encaminhamento e troca de agente.
 * Histórico é confirmado pelo Junior (inbound/outbound), nunca por proposta
 * interna do modelo. Não grava dados nem consulta APIs.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const recentOutbound=messages=>(Array.isArray(messages)?messages:[]).slice(0,-1).reverse().find(m=>m?.author==='agent'&&m?.direction==='outbound'&&typeof m.text==='string')?.text||''
const lastText=messages=>String(Array.isArray(messages)?messages.at(-1)?.text||'':'')
const yes=/^(?:sim|s|sim[,. ]+pode|sim[,. ]+por favor|claro|claro que sim|pode|pode sim|pode encaminhar|pode transferir|por favor|quero|quero sim|ok|okay|tudo bem|beleza|confirmo|autorizo|pode ser|ta bom|tá bom|com certeza)[.! ]*$/i
const no=/^(?:nao|não|nao obrigado|não obrigada|nao quero|não quero|prefiro nao|prefiro não|agora nao|agora não)[.! ]*$/i
const offerHuman=msg=>/\b(?:posso|deseja|quer|gostaria|poderia|confirma)\b.{0,140}\b(?:encaminhar|direcionar|transferir|passar|falar com|contato com)\b.{0,120}\b(?:equipe|atendimento|setor|departamento|especialista|colaborador|consultor|humano|backoffice)\b/i.test(fold(msg)) ||
 /\b(?:posso|deseja|quer|gostaria|poderia|confirma)\b.{0,90}\b(?:encaminhar|transferir)\b/i.test(fold(msg))
const offerMurilo=msg=>/\b(?:posso|quer|deseja|gostaria|poderia|confirm[ae])\b.{0,140}\b(?:murilo|time comercial|equipe comercial)\b/i.test(fold(msg))
const wantHuman=text=>/\b(?:quero|preciso|pode|solicito|me encaminhe|me transfira|encaminhe|transfira|chame)\b.{0,80}\b(?:atendente|humano|pessoa do atendimento|consultor|especialista|equipe|setor|departamento|backoffice|financeiro|transferir|encaminhar)\b/i.test(fold(text))
export function isHumanHandoffConfirmed(messages){
 const last=lastText(messages),previous=recentOutbound(messages)
 if(wantHuman(last))return true
 return yes.test(fold(last))&&offerHuman(previous)
}
export function humanDepartmentFromOffer(messages){
 const s=fold(recentOutbound(messages))
 if(/\bfinanceir[oa]\b/.test(s))return 'financeiro'
 if(/\b(?:backoffice|movimentac|inclusao|exclusao|dependente|beneficiario)\b/.test(s))return 'backoffice'
 if(/\b(?:auto|automovel|carro|veiculo|patrimonio|sinistro)\b/.test(s))return 'patrimonio'
 if(/\b(?:saude|odonto|beneficios|plano de saude)\b/.test(s))return 'beneficios'
 if(/\b(?:comercial|cotacao|vendas)\b/.test(s))return 'comercial'
 return null // não assumir setor sem clareza suficiente
}
export function confirmedOfferHandoff(messages,selectedAgent='clara'){
 if(!isHumanHandoffConfirmed(messages)||!offerHuman(recentOutbound(messages))||offerMurilo(recentOutbound(messages)))return null
 let department=humanDepartmentFromOffer(messages)
 // Compatibilidade com convites antigos: Murilo podia oferecer um consultor
 // "para confirmar o produto" sem citar a fila. Se há produto de cotação
 // inequívoco no histórico DO CLIENTE, o aceite vai para a fila real.
 // Sem produto inequívoco, não inventar setor nem forçar handoff.
 const offered=fold(recentOutbound(messages))
 const legacyConsultantQuote=selectedAgent==='murilo'&&
  /\bposso encaminhar\b/.test(offered)&&/\bconsultor\b/.test(offered)&&
  /\bconfirmar o produto\b/.test(offered)
 if(!department&&legacyConsultantQuote){
  const product=detectSdrQuoteProduct(messages)
  const patrimonial=['auto','frota','residencial','fianca','viagem','bike','empresarial','equipamentos','rc','cyber','garantia','credito'].includes(product)
  if(product)department=patrimonial?'patrimonio':'beneficios'
 }
 return department?{agent:selectedAgent==='murilo'?'murilo':'clara',reply:'Perfeito, obrigado pela confirmação. Vou solicitar seu encaminhamento à equipe responsável.',humanHandoff:true,handoff:{
  department,reason:'Cliente confirmou encaminhamento humano',summary:'Solicitação de atendimento humano confirmada pelo cliente. Conferir detalhes do protocolo no sistema de gestão.'}}:null
}
/**
 * Compatibilidade com Gestão Phoenix: benefícios é uma fila REAL, enquanto
 * "comercial" é apenas departamento lógico legado. Para ofertas de cotação
 * do Murilo já confirmadas, enviar diretamente a fila do produto, inclusive
 * quando a oferta de "Vendas da Phoenix" foi feita antes desta correção.
 * Nunca redireciona operações, dúvidas, protocolos sem aceite nem a Clara.
 */
export function routeConfirmedMuriloQuote(payload,messages){
 if(payload?.agent!=='murilo'||payload.humanHandoff!==true||!payload.handoff)return payload
 const offered=fold(recentOutbound(messages))
 const quoteOffer=/\bposso encaminhar\b/.test(offered)&&(
  /\bequipe de (?:beneficios(?: da phoenix)?|vendas da phoenix|auto\/re)\b/.test(offered)||
  /\bconsultor\b/.test(offered)&&/\bconfirmar o produto\b/.test(offered))
 if(!quoteOffer||!isHumanHandoffConfirmed(messages))return payload
 const product=detectSdrQuoteProduct(messages)
 if(!product)return payload
 if(!['comercial','beneficios','patrimonio'].includes(payload.handoff.department))return payload
 const patrimonial=['auto','frota','residencial','fianca','viagem','bike','empresarial','equipamentos','rc','cyber','garantia','credito'].includes(product)
 const department=patrimonial?'patrimonio':'beneficios'
 const baseSummary=payload.handoff.summary||'Solicitação de cotação confirmada pelo cliente.'
 // Caso o cliente não tenha informado todas as idades, não prolongar a
 // entrevista nem ocultar a pendência da equipe humana.
 const pending=['saude','saude_empresarial','odonto','odonto_empresarial'].includes(product)?
  healthLivesCheck(messages):null
 const qualityNote=pending?.type==='pending'?
  ' PENDÊNCIA DE CONFERÊNCIA: '+pending.declared+' vidas declaradas e '+pending.received+
  ' idades informadas. Confirmar dados com o cliente antes da cotação.':''
 const summary=(baseSummary+qualityNote).slice(0,650)
 const next={...payload.handoff,department,product,intent:'nova_cotacao',summary}
 const reply=/equipe responsavel/.test(fold(payload.reply))?
  'Perfeito, obrigado pela confirmação. Vou solicitar seu encaminhamento à equipe de '+
  (department==='patrimonio'?'Auto/RE':'Benefícios')+' para continuar a cotação.':payload.reply
 return {...payload,reply,handoff:next}
}

export function enforceHumanHandoffConsent(payload,messages){
 if(payload?.humanHandoff!==true||!payload?.handoff)return payload
 if(isHumanHandoffConfirmed(messages))return payload
 const department=payload.handoff.department
 const label={patrimonio:'Atendimento Auto e Patrimonial',beneficios:'Benefícios',backoffice:'Backoffice',comercial:'Comercial',financeiro:'Financeiro'}[department]||'atendimento'
 if(no.test(fold(lastText(messages)))&&offerHuman(recentOutbound(messages))){
  return {...payload,reply:'Tudo bem, não farei o encaminhamento. Podemos continuar por aqui. Em que mais posso ajudar?',humanHandoff:false,handoff:null,consentPending:false}
 }
 const source=String(payload.reply||'')
 const issue=/\b(?:n[aã]o consegui|n[aã]o foi poss[ií]vel|indispon[ií]vel|sem identifica[cç][aã]o|n[aã]o localizei)\b/i.test(source)
 const initial=source.split(/(?<=[.!?])\s+/)[0]||''
 const prefix=issue&&/\b(?:n[aã]o consegui|n[aã]o foi poss[ií]vel|indispon[ií]vel)\b/i.test(initial)?initial.slice(0,180).trim()+' ':''

 return {...payload,reply:prefix+'Posso encaminhar você à equipe de '+label+' para continuar o atendimento?',humanHandoff:false,handoff:null,consentPending:true}
}
/**
 * Se a Clara já se apresentou, nova intenção comercial pede aceite antes da
 * primeira troca Clara→Murilo. O pedido de cotação, por si só, não é o aceite
 * para passar o atendimento a outro agente.
 */
export function decideMuriloSwitch(messages,selectedAgent){
 if(selectedAgent!=='murilo'||!Array.isArray(messages))return null
 const text=lastText(messages),outbound=recentOutbound(messages)
 const heardClara=messages.some(m=>m?.author==='agent'&&m?.direction==='outbound'&&/\b(?:sou (?:a )?clara|clara, (?:assistente|concierge)|aqui [eé] clara)\b/i.test(fold(m.text)))
 const heardMurilo=messages.some(m=>m?.author==='agent'&&m?.direction==='outbound'&&/\b(?:sou (?:o )?murilo|murilo, do time comercial|aqui [eé] (?:o )?murilo)\b/i.test(fold(m.text)))
 if(!heardClara||heardMurilo)return null
 if(/\b(?:quero|pode|me passa|me transfere|falar com)\b.{0,75}\bmurilo\b/i.test(fold(text)))return null // pedido explícito já é autorização
 if(offerMurilo(outbound)){
  if(yes.test(fold(text)))return null
  if(no.test(fold(text)))return {agent:'clara',reply:'Sem problemas, continuamos por aqui. Posso esclarecer dúvidas gerais sobre seguros sem encaminhar você para outro agente.',humanHandoff:false,handoff:null}
  return {agent:'clara',reply:'Para sua confirmação: deseja que eu passe o atendimento ao Murilo, nosso assistente comercial, para ajudar com a cotação?',humanHandoff:false,handoff:null}
 }
 // A mesma oferta contextual é usada também pelo fluxo de coleta de
 // nome. Nenhuma regra pode voltar à frase fixa "mesmo veículo".
 return {agent:'clara',reply:muriloTransferInvitation(messages,{
  name:clientDeclaredName(messages),verb:'encaminhar'
 }),humanHandoff:false,handoff:null}
}
