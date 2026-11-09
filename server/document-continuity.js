/**
 * Continuidade documental transversal: Auto, RE, Saúde, Odonto, Vida,
 * Fiança e demais produtos. A gestão do Junior é a ÚNICA fonte de validação.
 * Não persiste, não registra e não encaminha CPF/CNPJ ao modelo de linguagem.
 */
import {findInboundDocument} from './document-identity.js'

const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const inbound=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const agentMessage=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const asksDoc=t=>{
 const v=fold(t)
 if(/\b(?:nao|sem)\s+(?:preciso|necessario|solicitar|pedir)\b.{0,60}\b(?:cpf|cnpj)\b/.test(v))return false
 return /\b(?:cpf|cnpj)\b/.test(v)&&
 /\b(?:informe|informar|forneca|enviar|envie|mandar|pode|poderia|preciso|solicito|solicitar|numero|titular)\b/.test(v)
}
const asksProof=t=>{
 const v=fold(t)
 return /\b(?:data de nascimento|cep cadastrado|seu cep|o cep)\b/.test(v)&&
 /\b(?:informe|informar|pode|poderia|preciso|verificar|confirmar|validar)\b/.test(v)
}
const hasProofAnswer=t=>{
 const s=String(t||'').trim()
 return /^(?:\d{2}[-/.]\d{2}[-/.]\d{4}|\d{4}[-/.]\d{2}[-/.]\d{2}|\d{8}|\d{5}-\d{3})$/.test(s)
}
function precedingAgent(messages){
 return (Array.isArray(messages)?messages:[]).slice(0,-1).reverse().find(agentMessage)||null
}
function priorDocumentRequested(messages){
 return (Array.isArray(messages)?messages:[]).slice(0,-1).slice(-16).some(m=>agentMessage(m)&&asksDoc(m.text))
}
/**
 * Somente se o documento/prova acaba de chegar em resposta a solicitação
 * explícita. Não vasculha histórico para autenticar cotações, nem
 * interpreta um documento antigo como autorização para novo assunto.
 */
export function documentContinuationState(messages,agent){
 if(agent!=='clara'||!Array.isArray(messages)||!messages.length)return null
 const last=messages.at(-1)
 if(!inbound(last))return null
 const latest=findInboundDocument([last])
 const value=fold(last.text)
 // O cliente pode oferecer o CPF/CNPJ junto com o próprio pedido de serviço.
 // Não solicitar outro documento e NÃO ativar consulta em cotações.
 const personalService=/\b(?:acionar|acionamento|sinistro|indenizacao|reembolso|consultar|verificar|segunda via|cancelar|excluir|incluir)\b/.test(value)&&
  /\b(?:seguro|apolice|contrato|plano|boleto|fatura|sinistro)\b/.test(value)
 const quoteOnly=/\b(?:cotacao|cotar|orcamento|simulacao|simular|seguro novo)\b/.test(value)&&
  !/\b(?:sinistro|acionar|acionamento|cancelar|excluir)\b/.test(value)
 if(latest.status!=='missing'&&personalService&&!quoteOnly){
  return {kind:'document',document:latest}
 }
 const previous=precedingAgent(messages)
 if(!previous)return null
 if(latest.status!=='missing'&&asksDoc(previous.text)){
  return {kind:'document',document:latest}
 }
 if(asksProof(previous.text)&&hasProofAnswer(last.text)&&priorDocumentRequested(messages)){
  const doc=findInboundDocument(messages.slice(0,-1))
  if(doc.status==='valid')return {kind:'proof',document:doc}
 }
 return null
}
export function repeatsDocumentRequest(reply){
 const t=fold(reply)
 if(/\b(?:nao precisa|nao e necessario|nao precisa reenviar|ja recebi|ja informou)\b.{0,100}\b(?:cpf|cnpj)\b/.test(t))return false
 return /\b(?:pode|poderia|por favor|preciso|necessario|solicito|solicitar|envie|informe|informar|forneca|mandar)\b.{0,140}\b(?:cpf|cnpj)\b/.test(t)
}
/** Resposta de segurança caso a geração volte a pedir documento após VERIFIED.
 * Nunca inventa contrato ou declara handoff que não ocorreu. */
export function noRepeatAfterVerified(messages){
 const list=(Array.isArray(messages)?messages:[]).filter(inbound).map(m=>fold(m.text))
 const topic=list.filter(t=>!/^\s*[\d./\-\s]{8,25}\s*$/.test(t)).join(' ')
 if(/\bfianca\b/.test(topic))
  return 'Sua identidade foi confirmada no sistema da Phoenix. Não precisa reenviar o CPF ou CNPJ. Para tratar do acionamento do Seguro Fiança, a equipe responsável precisará conferir o contrato e as condições. Posso encaminhar seu atendimento à equipe Auto/RE? Nenhum acionamento foi realizado pela IA.'
 return 'Sua identidade foi confirmada no sistema. Não é necessário informar novamente o CPF ou CNPJ. Vou continuar a orientação sobre sua solicitação com base nos dados autorizados, sem afirmar que algum acionamento ou alteração foi realizado.'
}
