import {detectSdrQuoteProduct} from './murilo-sdr-flow.js'

/**
 * Única fonte do texto de oferta Clara→Murilo. Evita que múltiplos guards
 * usem frases antigas de Auto para um pedido de Saúde, Odonto ou outro ramo.
 *
 * Reaproveita somente dados explícitos do histórico ATUAL fornecido pelo
 * Gestão Phoenix; produto ambíguo ou não identificado recebe texto neutro.
 * Nunca chama modelo, consulta apólice ou cria lead/handoff.
 */
const LABELS=Object.freeze({
 saude:'plano de saúde',saude_empresarial:'plano de saúde empresarial',
 odonto:'plano odontológico',odonto_empresarial:'plano odontológico empresarial',
 vida:'seguro de Vida',vida_grupo:'seguro de Vida em grupo',
 pet:'seguro Pet',previdencia:'previdência privada',
 auto:'seguro Auto',frota:'seguro Frota',residencial:'seguro Residencial',
 fianca:'seguro Fiança',viagem:'seguro Viagem',bike:'seguro Bike',
 empresarial:'seguro Empresarial',equipamentos:'seguro de Equipamentos',
 rc:'seguro de Responsabilidade Civil',cyber:'seguro Cyber',
 garantia:'Seguro Garantia',credito:'Seguro de Crédito'
})
const benefitCount=new Set(['saude','saude_empresarial','odonto','odonto_empresarial','vida_grupo'])
function declaredLives(messages){
 const texts=(Array.isArray(messages)?messages:[])
  .filter(m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string')
  .map(m=>m.text)
 for(let i=texts.length-1;i>=0;i--){
  const matches=[...texts[i].matchAll(/\b(\d{1,3})\s*vidas?\b/gi)]
  if(!matches.length)continue
  const n=Number(matches.at(-1)[1])
  if(n>=1&&n<=999)return n
 }
 return null
}
export function muriloTransferInvitation(messages,{name=null,verb='encaminhar'}={}){
 const product=detectSdrQuoteProduct(messages)
 let subject=LABELS[product]?'sua cotação de '+LABELS[product]:'sua solicitação de cotação'
 if(benefitCount.has(product)){
  const lives=declaredLives(messages)
  if(lives)subject+=' para '+lives+' '+(lives===1?'vida':'vidas')
 }
 const greeting=name?'Prazer, '+name+'! ':''
 if(verb==='passar')
  return greeting+'Posso passar '+subject+' ao Murilo, nosso assistente comercial, para continuar o atendimento?'
 return greeting+'Posso encaminhar '+subject+' ao Murilo, nosso assistente comercial, para continuar o atendimento?'
}
