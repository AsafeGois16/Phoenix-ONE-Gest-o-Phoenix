/**
 * Phoenix ONE -> Gestão Phoenix (Junior) v1.1. Additive handoff metadata.
 * Lab-only until both teams approve the 14 end-to-end scenarios.
 *
 * Does not modify the model schema, agents, prompts, RAG, consent or transport.
 * 'outro', unknown and ambiguous products intentionally have NO product code.
 */
import {identifyOrchestrationProducts} from './orchestration-preview.js'
import {classifyConversationIntent} from './agent-routing.js'

export const JUNIOR_PRODUCT_LINES=Object.freeze({
 auto:'patrimonio',frota:'patrimonio',residencial:'patrimonio',
 fianca:'patrimonio',viagem:'patrimonio',bike:'patrimonio',
 empresarial:'patrimonio',equipamentos:'patrimonio',rc:'patrimonio',
 cyber:'patrimonio',garantia:'patrimonio',credito:'patrimonio',
 saude:'beneficios',saude_empresarial:'beneficios',
 odonto:'beneficios',odonto_empresarial:'beneficios',
 vida:'beneficios',vida_grupo:'beneficios',pet:'beneficios',
 previdencia:'beneficios'
})
export const JUNIOR_PRODUCT_CODES=Object.freeze([...Object.keys(JUNIOR_PRODUCT_LINES),'outro'])
const LABEL_CODES=Object.freeze({
 Auto:'auto',Moto:'auto',Frota:'frota',Residencial:'residencial',
 'Fiança Locatícia':'fianca',Viagem:'viagem',Bike:'bike',
 Empresarial:'empresarial',Equipamentos:'equipamentos',
 'Responsabilidade Civil':'rc',Cyber:'cyber',Garantia:'garantia',
 Crédito:'credito',Saúde:'saude',Odonto:'odonto',Vida:'vida',
 Pet:'pet',Previdência:'previdencia'
})
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const inbound=messages=>(Array.isArray(messages)?messages:[])
 .filter(m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string')
const quoteHint=text=>/\b(?:cotacao|cotar|orcamento|simulacao|simular|contratar|novo seguro|quanto custa|preco|proposta comercial)\b/.test(fold(text))
export function juniorProductForLabel(label,source=''){
 const base=LABEL_CODES[label]||null
 if(!base)return null
 const text=fold(source)
 if(base==='vida'&&/\b(?:seguro de vida em grupo|vida em grupo)\b/.test(text))return 'vida_grupo'
 if(base==='saude'&&/\b(?:plano (?:de )?saude empresarial|saude empresarial|plano (?:de )?saude pme)\b/.test(text))return 'saude_empresarial'
 if(base==='odonto'&&/\b(?:plano odontologico empresarial|odonto empresarial|odontologico empresarial)\b/.test(text))return 'odonto_empresarial'
 return base
}
export function juniorProductFromMessages(messages){
 const recent=inbound(messages).slice(-12)
 // Ignore historical topics before a clear "new topic" marker.
 const resetIndex=recent.findLastIndex(m=>/^(?:outro assunto|tenho outra duvida|quero falar de outro assunto)[.! ]*$/i.test(fold(m.text)))
 const scoped=recent.slice(resetIndex+1)
 const text=scoped.map(m=>m.text).join(' ')
 if(!text)return null
 const recognized=identifyOrchestrationProducts(text)
 if(/\b(?:seguro (?:de )?credito|seguro de credito)\b/.test(fold(text)))recognized.push(['Crédito','auto_re'])
 if(/\b(?:seguro fianca|fianca locaticia)\b/.test(fold(text))&&!recognized.some(p=>p[0]==='Fiança Locatícia'))recognized.push(['Fiança Locatícia','auto_re'])
 // A word like 'vida' is not proof that the client requests life insurance.
 const filtered=recognized.filter(([label])=>label!=='Vida'||quoteHint(text)||/\b(?:seguro (?:de )?vida|vida em grupo|vida individual)\b/.test(fold(text)))
 const codes=[...new Set(filtered.map(([label])=>juniorProductForLabel(label,text)).filter(Boolean))]
 return codes.length===1?codes[0]:null
}
function effectiveIntent(messages){
 const list=inbound(messages).slice(-12)
 for(let i=list.length-1;i>=0;i--){
  const intent=classifyConversationIntent(list[i].text)
  if(intent!=='neutral')return intent
 }
 return 'neutral'
}
export function enrichClaraHandoff(payload,messages,{claraOnly=false}={}){
 if(!claraOnly||payload?.agent!=='clara'||payload.humanHandoff!==true||!payload.handoff)return payload
 const handoff=payload.handoff
 const {department}=handoff
 // Keep pre-validated model/route fields only if explicitly in the contract.
 const product=JUNIOR_PRODUCT_LINES[handoff.product]?handoff.product:juniorProductFromMessages(messages)
 const intent=effectiveIntent(messages)
 let classified=null
 if(['backoffice','beneficios','financeiro'].includes(department)){
  classified='operacional'
 }else if(intent==='service'){
  classified='operacional'
 }else if(intent==='sales'&&['comercial','patrimonio'].includes(department)){
  // Handoff=true was already gated by the existing consent/routing policy.
  classified='nova_cotacao'
 }else if(intent==='neutral'&&inbound(messages).at(-1)?.text?.trim().endsWith('?')){
  classified='duvida'
 }
 const next={...handoff}
 if(product)next.product=product
 else delete next.product
 if(classified)next.intent=classified
 else delete next.intent
 return {...payload,handoff:next}
}
