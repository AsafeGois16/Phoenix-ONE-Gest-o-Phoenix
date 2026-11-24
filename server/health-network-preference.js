/**
 * Explicit hospital/network preference is commercial information, not an
 * administrative complaint or a medical emergency. It only affects text
 * classification; the agent selector still needs commercial conversation
 * context to choose Murilo, otherwise Clara remains the default concierge.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
export function isHealthNetworkPreference(text){
 const t=fold(text)
 if(!/\b(?:gostaria|prefiro|preferencia|priorizo|quero ter|quero acesso|quero incluir|seria bom ter|melhorar|procurando uma rede|busco uma rede|ideal seria)\b/.test(t))return false
 if(!/\b(?:hospitais?|rede credenciada|redes hospitalares|zonas?|regioes?|regiao)\b/.test(t))return false
 // Uma mesma mensagem pode mencionar a rede desejada E uma movimentação real.
 // Movimentações de pessoas sempre prevalecem sobre o contexto comercial.
 if(/\b(?:incluir|adicionar|excluir|retirar|remover|cadastrar)\b.{0,110}\b(?:beneficiari[oa]s?|dependentes?|titulares?|filh[oa]s?|espos[ao]s?|funcionari[oa]s?)\b/.test(t))return false
 // Negative claim, operational demand and real clinical distress always win.
 if(/\b(?:problema|negativa|negou|recusou|recusaram|nao cobre|nao atende|sem cobertura|nao consigo|falha no atendimento|reembolso|guia medica|autorizacao|carencia|boleto|fatura|exclusao|inclusao|cancelamento|sinistro|preciso de atendimento|preciso de internacao|internad[oa]s?|dor no peito|falta de ar|risco de vida|urgente)\b/.test(t))return false
 return true
}
