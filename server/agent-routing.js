import {isAdministrativeMovementRequest} from './backoffice-routing.js'
import {isHealthNetworkPreference} from './health-network-preference.js'
/**
 * Identidade pública dos agentes Phoenix ONE.
 * Clara é a porta de entrada universal; Murilo só assume demanda comercial explícita.
 * agent_hint e contact.kind do Junior são sugestões, não autorização para transferir
 * automaticamente toda conversa de número desconhecido ao SDR.
 * A função é determinística, sem dados pessoais ou chamadas externas.
 */
function fold(text) {
  return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
}
const SERVICE_PATTERNS=[
  /\b(?:2\s*(?:a|via|vida)|segunda|segunda\s*via|segunda\s*vida)\s*(?:via\s*)?(?:do\s*)?(?:boleto|fatura|parcela|pagamento)?\b/,
  /\b(?:boleto|fatura|vencimento|parcela|pagamento|cobranca|debito|nota fiscal|quitacao|inadimplencia|segunda via|2a via|2 via)\b/,
  /\b(?:carteirinha|reembolso|sinistro|emergencia|autorizacao|cirurgia|guia|beneficiario|dependente|exclusao|excluir|inclusao|incluir|movimentacao|cancelamento|cancelar|alteracao|atualizar dados|atualizacao cadastral)\b/,
  /\b(?:minha apolice|meu contrato|minha cobertura|meu plano|minha seguradora|meu seguro|seguro que tenho|sou cliente|ja sou cliente|sou segurado|tenho um plano|quais seguros|meus seguros|minhas apolices|quais apolices)\b/,
  /\b(?:nao recebi|nao consigo acessar|preciso de ajuda com|problema no atendimento|acompanhar meu pedido|quero falar com atendente)\b/,
  /\b(?:dor no peito|falta de ar|nao respira|inconsciente|convulsao|sangramento intenso|risco de vida|internacao urgente|preciso de pronto.socorro)\b/,
  /\b(?:nao consigo (?:marcar|agendar|fazer) (?:uma?\s+|a\s+)?(?:consulta|exame)|(?:consulta|exame) (?:negad[oa]|recusad[oa]))\b/
]
const SALES_PATTERNS=[
  /\b(?:cotacao|cotar|orcamento|simulacao|simular|proposta comercial|proposta de seguro|renovar|renovacao|renovando|renove|cotacao de renovacao)\b/,
  /\b(?:contratar|contratacao|comprar|adquirir|fechar um seguro|fazer um seguro|fazer seguro|quero um seguro|quero seguro)\b/,
  /\b(?:qual o preco|quanto custa|quanto ficaria|valores para contratar|preco de um seguro|valor de um seguro)\b/,
  /\b(?:tenho interesse em|estou interessado em|quero conhecer planos|quero uma proposta)\b/
]
function intent(text){
 const value=fold(text)
 if(!value)return 'neutral'
 // Inclusão/exclusão de beneficiário em plano EXISTENTE prevalece mesmo que
 // a frase comece com "antes de continuar a cotação". A solicitação deixa de
 // ser comercial e precisa passar por Clara antes de qualquer Backoffice.
 if(isAdministrativeMovementRequest(text))return 'service'
 // Solicitações operacionais inequívocas prevalecem até em mensagens mistas.
 const operational=/\b(?:boleto|fatura|parcela|pagamento|reembolso|carteirinha|negativa|autorizacao|cirurgia|emergencia|inadimplencia|segunda via)\b/.test(value)||
   /\b(?:acionar|acione|preciso acionar|solicitar acionamento|abrir sinistro|sofri|faleceu|veio a falecer|preciso de guincho)\b.{0,90}\b(?:assistencia|sinistro|seguro|funeral|guincho|falecimento)\b/.test(value)||
   /\b(?:preciso de assistencia|assistencia urgente|socorro agora)\b/.test(value)
 if(operational)return 'service'
 // Renovação comercial não pode encobrir novo sinistro nem pedido de cancelamento.
 if(/\b(?:abrir|registrar|comunicar|acionar)\s+(?:um\s+|o\s+)?sinistro\b/.test(value)||
   /\b(?:quero|preciso|desejo|solicito)\s+(?:o\s+|a\s+)?(?:cancelar|cancelamento|excluir|exclusao)\b/.test(value))
  return 'service'
 // Uma cobertura mencionada em cotação continua sendo assunto do comercial.
 // Serve para todos os produtos: Vida, Auto, Saúde, Residencial, Viagem etc.
 if(SALES_PATTERNS.some(p=>p.test(value)))return 'sales'
 if(/\b(?:assistencia|indenizacao|cobertura)\b/.test(value)&&
    /\b(?:funeral|falecimento|invalidez|24 horas|24h|na cotacao|na proposta)\b/.test(value))
   return 'neutral'
 if(isHealthNetworkPreference(text))return 'neutral'
 if(SERVICE_PATTERNS.some(p=>p.test(value)))return 'service'
 return 'neutral'
}
export function selectConversationAgent(body) {
 const history=(Array.isArray(body?.messages)?body.messages:[])
   .filter(m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string')
   .map(m=>m.text)
 const last=history.at(-1)||''
 const current=intent(last)
 if(current==='service')return 'clara'
 if(current==='sales')return 'murilo'
 // Resposta neutra à ÚLTIMA pergunta comercial do Murilo tem precedência
 // sobre demandas operacionais antigas no mesmo histórico. A pergunta deve
 // ser realmente de qualificação, e não uma proposta de passagem entre agentes.
 const messages=Array.isArray(body?.messages)?body.messages:[]
 const lastAgentMessage=[...messages].reverse().find(m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string')
 const lastAgentText=fold(lastAgentMessage?.text)
 const offeredTransfer=/\b(?:posso|podemos|pode)\b.{0,55}\b(?:encaminhar|transferir|passar)\b.{0,55}\b(?:murilo|assistente comercial|equipe|atendente|humano)\b/.test(lastAgentText)
 const qualificationQuestion=/\?/.test(lastAgentText)&&/\b(?:cotacao|orcamento|simulacao|rede credenciada|hospital|hospitais|regioes?|franquia|cobertura|protecao|veiculo|imovel|empresa|vidas)\b/.test(lastAgentText)
 const recentSalesAgent=messages.slice(-14).some(m=>m?.direction==='outbound'&&m.author==='agent'&&/\b(?:sou (?:o )?murilo|aqui e (?:o )?murilo|me chamo murilo|murilo, do time comercial)\b/.test(fold(m.text)))
 const genuineQualification=qualificationQuestion&&!offeredTransfer&&
  (recentSalesAgent||body?.agent_hint==='murilo'||/\b(?:cotacao|orcamento|simulacao)\b/.test(lastAgentText))
 const newTopic=/^(?:outro assunto|tenho outra duvida|quero falar de outro assunto|quero retomar outro assunto)\b/.test(fold(last))
 if(genuineQualification&&!newTopic)return 'murilo'
 // Somente respostas curtas de acompanhamento mantêm a intenção já identificada
 // no MESMO protocolo. Nunca transformar "Oi" inicial em Murilo por causa do hint.
 const stripped=fold(last)
 // Manter Murilo durante a continuidade da cotação, mesmo em respostas não curtas.
 for(const previous of history.slice(0,-1).reverse().slice(0,12)){
   const prior=intent(previous)
   if(prior==='service')return 'clara'
   if(prior==='sales')return 'murilo'
 }

 // Respostas neutras de qualificação não significam troca de assunto.
 // Quando a janela do Junior já não contém a mensagem original "quero cotar",
 // use apenas evidências de que Murilo realmente respondeu neste protocolo.
 const outbound=(Array.isArray(body?.messages)?body.messages:[])
  .filter(m=>m?.direction==='outbound'&&m?.author==='agent'&&typeof m.text==='string')
 const lastOutbound=fold(outbound.at(-1)?.text)
 const confirmedMurilo=outbound.some(m=>/\b(?:sou (?:o )?murilo|aqui e (?:o )?murilo|me chamo murilo|murilo, do time comercial)\b/.test(fold(m.text)))
 const recentlyClara=outbound.some(m=>/\b(?:sou (?:a )?clara|aqui e (?:a )?clara|me chamo clara)\b/.test(fold(m.text)))
 const salesQuestion=/\b(?:cotacao|cotar|orcamento|seguro novo|renovacao|franquia|protecao padrao|cobertura padrao)\b/.test(lastOutbound)||
  /\b(?:carro|veiculo)\b.{0,90}\b(?:uso pessoal|uso particular|frota|trabalho)\b/.test(lastOutbound)
 const shortAnswer=stripped.length>0&&stripped.length<=110&&
  !/^(?:oi|ola|bom dia|boa tarde|boa noite|tenho outra duvida|outro assunto)$/.test(stripped)
 if(shortAnswer&&(confirmedMurilo||
    (body?.agent_hint==='murilo'&&salesQuestion&&!recentlyClara))){
   return 'murilo'
 }
 // Um hint ou contato desconhecido, isoladamente, não é prova de venda.
 return 'clara'
}
export function hasExplicitConversationIntent(messages){
 return (Array.isArray(messages)?messages:[])
  .filter(m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string')
  .slice(-12).some(m=>intent(m.text)!=='neutral')
}
export function classifyConversationIntent(message){return intent(message)}
