/**
 * Additional LAB-ONLY coaching for the current fictional user turn.
 * This never changes deployed agent prompts or the production Junior bridge.
 * It uses only what the simulated client already wrote; no account lookup.
 */
const folded=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const clientText=messages=>(Array.isArray(messages)?messages:[]).filter(m=>m?.role==='user'&&typeof m.content==='string').map(m=>m.content)
const recent=(messages,n=3)=>clientText(messages).slice(-n)
const mentionsCommercial=x=>/\b(?:cotar|cotacao|comparar|comparacao|proposta|orcamento|renovacao)\b/.test(folded(x))
const offeredMurilo=messages=>(Array.isArray(messages)?messages:[]).some(m=>
 m?.role==='assistant'&&/\bmurilo\b/.test(folded(m.content))&&
 /\b(?:posso|deseja|quer|autoriz|encaminh|passar|direcionar)\b/.test(folded(m.content)))
const acceptedMurilo=x=>/\bmurilo\b/.test(folded(x))&&/\b(?:sim|pode|autorizo|aceito|passe|passar|encaminh)\b/.test(folded(x))
const propertyType=x=>/\b(?:apartamento|casa|sobrado|kitnet|loja|sala comercial)\b/.exec(folded(x))?.[0]||null
const knownCity=x=>{
 const match=/\bem\s+([\p{L}\p{M}]{3,45})(?=[\s,.;!?]|$)/iu.exec(x)
 return match?match[1]:null
}
/** Only addendum instructions, not user messages or simulated approvals. */
export function labCoachingInstructions(agent,messages){
 if(!['clara','murilo'].includes(agent)||!Array.isArray(messages))return ''
 const clients=clientText(messages),last=clients.at(-1)||''
 const notes=[]
 if(agent==='clara'){
  if(acceptedMurilo(last)){
   notes.push('A pessoa confirmou a passagem para Murilo. Responda ao aceite com clareza. Não comece a coletar marca, modelo, placa, ano, coberturas ou outros dados da cotação. Apenas diga que a solicitação de passagem ao Murilo será encaminhada pelo sistema de gestão, SEM afirmar que a transferência já aconteceu.')
  }else if(mentionsCommercial(last)&&/\b(?:comercial|seguradora|cotacao|cotar)\b/.test(folded(last))){
   notes.push('Clara faz triagem, NÃO conduz a qualificação do SDR. Para esse interesse comercial, identifique o seguro citado e faça apenas a pergunta de consentimento: pode encaminhar o atendimento ao Murilo, assistente comercial? Não solicite dados de cotação até haver autorização e troca de agente.')
  }
 }
 if(agent==='murilo'){
  const propertyMessages=recent(messages,3).filter(x=>/\b(?:imovel|residencial|apartamento|casa|bens)\b/.test(folded(x)))
  const info=propertyMessages.map(x=>({kind:propertyType(x),city:knownCity(x)}))
   .find(x=>x.kind&&x.city)
  if(info){
   // Use the already explicitly supplied fictitious type/city, not a lookup.
   notes.push('No histórico do cliente, o imóvel é '+info.kind+' em '+info.city+'. Reconheça explicitamente na próxima resposta esses DOIS dados já informados (tipo de imóvel e cidade), sem repetir as perguntas. Faça apenas a próxima pergunta realmente necessária para cotação, de maneira progressiva. Não afirme que buscou ou salvou esses dados no cadastro.')
  }
 }
 if(!notes.length)return ''
 return '\n\nCOMPORTAMENTO ADICIONAL SOMENTE PARA TESTE DE QUALIDADE CONVERSACIONAL:\n'+notes.join('\n')
}
