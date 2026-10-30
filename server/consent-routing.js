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
const wantHuman=text=>/\b(?:quero|preciso|pode|solicito|me encaminhe|me transfira|encaminhe|transfira|chame)\b.{0,80}\b(?:atendente|humano|pessoa do atendimento|consultor|especialista|equipe|setor|departamento|backoffice|transferir|encaminhar)\b/i.test(fold(text))
export function isHumanHandoffConfirmed(messages){
 const last=lastText(messages),previous=recentOutbound(messages)
 if(wantHuman(last))return true
 return yes.test(fold(last))&&offerHuman(previous)
}
export function humanDepartmentFromOffer(messages){
 const s=fold(recentOutbound(messages))
 if(/\b(?:backoffice|movimentac|inclusao|exclusao|dependente|beneficiario)\b/.test(s))return 'backoffice'
 if(/\b(?:auto|automovel|carro|veiculo|patrimonio|sinistro)\b/.test(s))return 'patrimonio'
 if(/\b(?:saude|odonto|beneficios|plano de saude)\b/.test(s))return 'beneficios'
 if(/\b(?:comercial|cotacao|vendas)\b/.test(s))return 'comercial'
 return null // não assumir setor sem clareza suficiente
}
export function confirmedOfferHandoff(messages){
 if(!isHumanHandoffConfirmed(messages)||!offerHuman(recentOutbound(messages))||offerMurilo(recentOutbound(messages)))return null
 const department=humanDepartmentFromOffer(messages)
 return department?{agent:'clara',reply:'Perfeito, obrigado pela confirmação. Vou solicitar seu encaminhamento à equipe responsável.',humanHandoff:true,handoff:{
  department,reason:'Cliente confirmou encaminhamento humano',summary:'Solicitação de atendimento humano confirmada pelo cliente. Conferir detalhes do protocolo no sistema de gestão.'}}:null
}
export function enforceHumanHandoffConsent(payload,messages){
 if(payload?.humanHandoff!==true||!payload?.handoff)return payload
 if(isHumanHandoffConfirmed(messages))return payload
 const department=payload.handoff.department
 const label={patrimonio:'Atendimento Auto e Patrimonial',beneficios:'Benefícios',backoffice:'Backoffice',comercial:'Comercial'}[department]||'atendimento'
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
 return {agent:'clara',reply:'Claro, podemos cotar o seguro do mesmo veículo em outras seguradoras. Posso encaminhar sua conversa ao Murilo, nosso assistente comercial, para continuar a cotação?',humanHandoff:false,handoff:null}
}
