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
  /\b(?:carteirinha|reembolso|sinistro|assistencia|emergencia|autorizacao|cirurgia|guia|beneficiario|dependente|exclusao|inclusao|movimentacao|cancelamento|cancelar|alteracao|atualizar dados|atualizacao cadastral)\b/,
  /\b(?:minha apolice|meu contrato|minha cobertura|meu plano|minha seguradora|meu seguro|seguro que tenho|sou cliente|ja sou cliente|sou segurado|tenho um plano)\b/,
  /\b(?:nao recebi|nao consigo acessar|preciso de ajuda com|problema no atendimento|acompanhar meu pedido|quero falar com atendente)\b/
]
const SALES_PATTERNS=[
  /\b(?:cotacao|cotar|orcamento|simulacao|simular|proposta comercial|proposta de seguro)\b/,
  /\b(?:contratar|contratacao|comprar|adquirir|fechar um seguro|fazer um seguro|fazer seguro|quero um seguro|quero seguro)\b/,
  /\b(?:qual o preco|quanto custa|quanto ficaria|valores para contratar|preco de um seguro|valor de um seguro)\b/,
  /\b(?:tenho interesse em|estou interessado em|quero conhecer planos|quero uma proposta)\b/
]
function intent(text){
 const value=fold(text)
 if(!value)return 'neutral'
 if(SERVICE_PATTERNS.some(p=>p.test(value)))return 'service'
 if(SALES_PATTERNS.some(p=>p.test(value)))return 'sales'
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
 // Somente respostas curtas de acompanhamento mantêm a intenção já identificada
 // no MESMO protocolo. Nunca transformar "Oi" inicial em Murilo por causa do hint.
 const stripped=fold(last)
 const shortFollowUp = stripped.length<=42 && /^(?:sim|claro|pode|pode ser|ok|certo|isso|entendi|vamos|por favor|quero sim|nao|não|obrigad[oa]|com certeza|perfeito|tenho interesse)$/.test(stripped)
 if(shortFollowUp){
   for(const previous of history.slice(0,-1).reverse().slice(0,8)){
      const prior=intent(previous)
      if(prior==='service')return 'clara'
      if(prior==='sales')return 'murilo'
   }
 }
 // Contato desconhecido/lead e agent_hint "murilo" não são prova de venda.
 return 'clara'
}
export function classifyConversationIntent(message){return intent(message)}
