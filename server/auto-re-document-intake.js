/**
 * Qualificação documental opcional para os 12 produtos Auto/RE.
 *
 * CPF/CNPJ identifica titular, NUNCA autentica e NUNCA libera apólices.
 * A consulta de contratos pertence ao Junior e exige confirmação segura do
 * vínculo no MESMO protocolo. Não salva, loga, repete nem coloca documento
 * em handoff, modelo, RAG ou contexto generativo.
 *
 * Gatilho: PHX_AUTO_RE_DOCUMENT_INTAKE=true, somente no fluxo fechado Murilo.
 * Não bloquear o cliente que prefere não fornecer o número na conversa.
 */
import {findInboundDocument} from './document-identity.js'
export const AUTO_RE_PRODUCTS=Object.freeze([
 'auto','frota','residencial','fianca','viagem','bike','empresarial',
 'equipamentos','rc','cyber','garantia','credito'
])
const products=new Set(AUTO_RE_PRODUCTS)
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const incoming=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outgoing=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const askNumber=s=>/\bnumero do (?:cpf|cnpj)\b|\b(?:cpf|cnpj) do titular\b/.test(fold(s))&&/\b(?:pode informar|pode me informar|pode enviar|informar o numero)\b/.test(fold(s))
const askType=s=>/\b(?:cotacao sera pelo cpf ou cnpj|sera pelo cpf ou cnpj)\b/.test(fold(s))
const declined=s=>/^(?:nao|nao obrigado|nao obrigada|prefiro nao informar|prefiro nao enviar|nao vou informar|sem documento|depois informo|nao quero informar|nao tenho agora)(?:[.! ])*$/.test(fold(s))
const validType=s=>{
 const t=fold(s)
 if(/\b(?:cnpj|pessoa juridica|empresa|pela pj|por pj)\b/.test(t))return 'cnpj'
 if(/\b(?:cpf|pessoa fisica|por pf|pelo cpf)\b/.test(t))return 'cpf'
 return null
}
function lastQuestion(list,regex){
 for(let i=list.length-1;i>=0;i--){
  if(outgoing(list[i])&&regex(list[i].text))return i
 }
 return -1
}
function numberRequestedAt(list){return lastQuestion(list,askNumber)}
function hasDeclinedDocument(list){
 const i=numberRequestedAt(list)
 return i>=0&&list.slice(i+1).some(m=>incoming(m)&&declined(m.text))
}
function statusDocument(list){
 // Limit document detection to customer replies on this protocol, last 20.
 const doc=findInboundDocument(list)
 return doc.status
}
function typeInHistory(list){
 const doc=findInboundDocument(list)
 if(doc.status==='valid')return doc.type
 for(let i=list.length-1;i>=0;i--)if(incoming(list[i])){
  const type=validType(list[i].text)
  if(type)return type
 }
 return null
}
const safe=reply=>({agent:'murilo',reply,humanHandoff:false,handoff:null})
const requestText=type=>{
 const id=type==='cnpj'?'CNPJ':'CPF'
 return 'Para ajudar a equipe a localizar seu cadastro e evitar perguntas repetidas, pode me informar o número do '+id+' do titular? Se preferir não informar, seguimos com a cotação normalmente.'
}
/**
 * Chamado antes da próxima pergunta do catálogo, mas DEPOIS de segurança,
 * aceite da troca Clara→Murilo e atendimento operacional.
 *
 * Retorna null quando já recebeu documento válido, o cliente recusou
 * a consulta, ou quando o roteiro aprovado já contém pergunta de tipo.
 */
export function autoReDocumentIntake(messages,product,questions=[]){
 if(!products.has(product))return null
 const list=(Array.isArray(messages)?messages:[]).slice(-20)
 if(!list.length||!incoming(list.at(-1)))return null
 const doc=statusDocument(list)
 if(doc==='valid')return null
 if(hasDeclinedDocument(list))return null
 const requested=numberRequestedAt(list)
 if(requested>=0){
  const answers=list.slice(requested+1).filter(incoming)
  const invalidCount=answers.filter(m=>findInboundDocument([m]).status==='invalid').length
  if(answers.length&&invalidCount>0&&invalidCount<=1&&doc==='invalid')
   return safe('Esse número não passou na validação de CPF/CNPJ. Pode conferir e informar novamente, se desejar?')
  if(invalidCount>1)return null // no loops; hand off with pendency
  return null // Do not repeatedly request a number after other replies
 }
 const known=typeInHistory(list)
 if(!known){
  const typeExists=questions.some(q=>/\b(?:cpf ou cnpj|pessoa fisica.*pessoa juridica|pessoa juridica.*pessoa fisica)\b/.test(fold(q.text)))
  if(typeExists||lastQuestion(list,askType)>=0)return null
  return safe('Esta cotação será pelo CPF ou CNPJ?')
 }
 return safe(requestText(known))
}
export function wasDocumentIntakeDeclined(messages){
 return hasDeclinedDocument(Array.isArray(messages)?messages:[])
}
export function didCustomerSupplyValidDocument(messages){
 return findInboundDocument(Array.isArray(messages)?messages:[]).status==='valid'
}
