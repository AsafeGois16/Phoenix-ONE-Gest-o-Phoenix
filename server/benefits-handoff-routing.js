/**
 * Regra operacional Phoenix: atendimento humano de Benefícios passa pela fila
 * Backoffice do Junior. Não muda RAG, prompt mestre, nem a própria atribuição.
 * O Junior realiza o handoff quando humanHandoff=true.
 */
const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const mentionsBenefits=t=>/\b(?:saude|plano medico|medico|hospital|odonto\w*|odontolog\w*|dentist\w*|seguro (?:de )?vida|vida em grupo|acidentes pessoais|dit|previdencia|viagem|beneficios)\b/.test(fold(t))
const mentionsService=t=>/\b(?:sinistro|urgencia|emergencia|atendimento|autorizacao|negativa|negado|reembolso|problema|dificuldade|plano de saude|plano odontolog|apolice|falecimento|faleceu|seguro de vida|acidentes pessoais|previdencia|viagem)\b/.test(fold(t))
const isCommercial=t=>/\b(?:cotacao|cotar|orcamento|simulacao|simular|quanto custa|preco de|novo seguro)\b/.test(fold(t))
function relatedToBenefits(messages){
 const list=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact')
 const t=list.slice(-10).map(m=>m.text||'').join(' ')
 return mentionsBenefits(t)&&mentionsService(t)&&!(isCommercial(list.at(-1)?.text||''))
}
/** Aplica inclusive a ofertas geradas pelo modelo a partir de RAG legada.
 * Áudio com departamento definido pelo Junior não passa por esta função.
 */
export function routeBenefitsToBackoffice(payload,messages){
 if(!payload||payload.agent!=='clara')return payload
 const benefitsContext=relatedToBenefits(messages)
 const department=payload.handoff?.department
 const reroute=payload.humanHandoff===true&&department==='beneficios'&&benefitsContext
 if(!reroute&&!benefitsContext)return payload
 const reply=String(payload.reply||'')
  .replace(/\b(?:equipe|time|setor|departamento) de Benef[ií]cios\b/gi,'equipe de Backoffice')
  .replace(/\bpara Benef[ií]cios\b/gi,'para o Backoffice')
 const handoff=reroute?{
  ...payload.handoff,
  department:'backoffice',
  reason:String(payload.handoff.reason||'Atendimento humano solicitado').slice(0,140)
 }:payload.handoff
 return {...payload,reply,handoff}
}
