/**
 * Sinistros Auto: triagem segura e objetiva, sem abertura de sinistro, consulta
 * fictícia de cobertura ou emissão de guincho. Operação pertence ao Junior.
 * Não persiste dados pessoais nem consulta apólices antes de identity/resolve.
 */
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const inbound=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outbound=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const pureYes=t=>/^(?:sim|s|claro|isso|exatamente|esta|esta sim|sim esta|sim estou|estamos|seguro|estamos seguros)[.!, ]*$/.test(fold(t))
const pureNo=t=>/^(?:nao|n|nao preciso|dispenso|sem necessidade|nao, obrigado)[.!, ]*$/.test(fold(t))
const humanRequest=t=>/\b(?:quero|preciso|pode|solicito|me encaminhe|me transfira|encaminhe|transfira|falar com|conversar com)\b.{0,100}\b(?:humano|atendente|pessoa|consultor|equipe|sinistros|atendimento auto|auto\/re)\b/.test(fold(t))
const danger=t=>{const value=fold(t)
 return /\b(?:sangr|desmai|inconscient|pres[oa]|nao respira|grave|risco de vida|fogo|incendio|fumaca|vazamento|perigo|em risco|na pista|via movimentada)\b/.test(value)||
  /\bferid[oa]s?\b/.test(value)&&!noInjuries(value)
}
const noInjuries=t=>/\b(?:ninguem (?:se )?feriu|ninguem ficou ferido|sem feridos|nao houve feridos|todos bem|ninguem se machucou)\b/.test(fold(t))
const towRequest=t=>/\b(?:preciso|necessito|quero|chamar|solicitar|acionar)\b.{0,75}\b(?:guincho|reboque|assistencia 24|assistencia auto)\b/.test(fold(t))
const noTow=t=>/\b(?:nao preciso|sem necessidade|dispenso|nao quero|sem)\b.{0,55}\b(?:guincho|reboque|assistencia)\b/.test(fold(t))
const safeConfirmed=t=>/\b(?:estou|estamos|carro|veiculo|local|lugar|esta|ficou)\b.{0,48}\b(?:segur[oa]|protegido|fora da via|fora da pista|estacionado)\b/.test(fold(t))||
 /\b(?:em local seguro|fora da pista|fora da via)\b/.test(fold(t))
const isQuote=t=>/\b(?:cotacao|cotar|orcamento|simulacao|simular|contratar|quanto custa|preco de)\b/.test(fold(t))
export function isIncidentReport(text){
 const t=fold(text)
 if(!t)return false
 const explicit=/\b(?:sofri|tive|aconteceu|acabei de sofrer|estive envolvid[oa] em|bati|colidi|colidiram|roubaram|furtaram)\b.{0,120}\b(?:colisao|acidente|batida|carro|veiculo|auto|moto|sinistro|roubo|furto)\b/.test(t)||
  /\b(?:colisao|batida|acidente|roubo|furto)\b.{0,90}\b(?:meu carro|meu veiculo|automovel|meu auto|veiculo)\b/.test(t)
 const service=/\b(?:abrir|acionar|comunicar|registrar|dar entrada|preciso de|quero abrir)\b.{0,85}\b(?:sinistro|meu seguro auto|seguro do carro|seguro auto|guincho por acidente)\b/.test(t)
 // Perguntas hipotéticas sobre a cotação NÃO são sinistros reais.
 if(isQuote(t)&&!explicit&&!/\b(?:aconteceu|ocorreu|acidente real|sinistro real)\b/.test(t))return false
 return explicit||service
}
const hasTopicChange=text=>{
 const t=fold(text)
 return /\b(?:agora tenho outra duvida|quero falar de outro assunto|quero retomar a cotacao|preciso da segunda via|preciso excluir dependente)\b/.test(t)
}
export function incidentContext(messages){
 const list=Array.isArray(messages)?messages:[]
 // A consulta só utiliza histórico efetivamente enviado pelo Junior no mesmo protocolo.
 for(let i=list.length-1;i>=0;i--){
  const m=list[i]
  if(!inbound(m))continue
  if(hasTopicChange(m.text))return null
  if(isIncidentReport(m.text))return {start:i,kind:'auto'}
 }
 return null
}
function base(reply,humanHandoff=false,handoff=null){return {agent:'clara',reply,humanHandoff,handoff}}
function latestAgent(messages){return [...messages].reverse().find(outbound)?.text||''}
function lastReport(messages){
 const context=incidentContext(messages)
 return context?String(messages[context.start]?.text||''):''
}
function note(messages){
 const customer=(Array.isArray(messages)?messages:[]).filter(inbound)
 const words=customer.map(m=>fold(m.text)).join(' ')
 const original=fold(lastReport(messages))
 const kind=/\b(?:roubo|furto|roubaram|furtaram)\b/.test(original)?'roubo/furto':
  /\b(?:colisao|batida|bati|colidi|acidente)\b/.test(original)?'colisão/acidente':'acionamento de Sinistros Auto'
 const injuries=noInjuries(words)?'Cliente informou inicialmente ausência de feridos. ':'' 
 const tow=towRequest(words)&&!noTow(words)?'Cliente mencionou possível necessidade de assistência/guincho; verificar condições e disponibilidade. ':''
 return 'Cliente solicita atendimento de Sinistros Auto por '+kind+'. '+injuries+tow+
   'A IA não abriu sinistro, não solicitou guincho e não confirmou cobertura. A equipe deverá confirmar apólice e elegibilidade no sistema autorizado.'
}
function handoff(messages,priority=false){
 return base((priority?'Entendido. Como a assistência pode ser urgente, ':'Entendido. ')+
  'Vou solicitar ao Junior o encaminhamento à equipe Auto/RE para atendimento de Sinistros Auto. '+
  'Isso não significa que um sinistro ou guincho já tenha sido acionado.',true,{
   department:'patrimonio',reason:'Atendimento humano de Sinistros Auto solicitado pelo cliente',
   summary:note(messages).slice(0,350)
  })
}
const safetyQuestion='Antes de consultar o seguro, você e o veículo estão em local seguro? Se houver perigo imediato, priorize o afastamento da via e o atendimento de emergência.'
const traumaQuestion='Se houver alguém ferido ou risco imediato, acione o socorro local (SAMU 192, Bombeiros 193 ou Polícia 190 conforme a situação). Você está em local seguro?'
/** Rodar ANTES de coleta de nome, documento e consulta de apólices. */
export function incidentFirstSafetyDecision(messages){
 const ctx=incidentContext(messages),list=Array.isArray(messages)?messages:[]
 const last=list.at(-1)
 if(!ctx||!inbound(last)||!isIncidentReport(last.text))return null
 const alreadyAsked=list.some(m=>outbound(m)&&
   /\b(?:local seguro|voce esta em seguranca|guincho|assistencia de emergencia)\b/.test(fold(m.text)))
 if(alreadyAsked)return null
 const text=String(last.text||'')
 const safety=danger(text)?traumaQuestion:
  (noInjuries(text)?'Que bom que ninguém ficou ferido. ':'Sinto muito pelo ocorrido. ')+safetyQuestion
 if(humanRequest(text))return {
  ...handoff(list,true),reply:safety+' Vou solicitar atendimento humano de Sinistros Auto agora.'
 }
 return base(safety)
}
/** Não confundir preferência de cobertura no seguro novo com sinistro real. */
export function incidentFollowupDecision(messages){
 const list=Array.isArray(messages)?messages:[]
 const ctx=incidentContext(list),last=list.at(-1)
 if(!ctx||!inbound(last))return null
 const text=String(last.text||'')
 const prior=fold(latestAgent(list))
 if(humanRequest(text))return handoff(list,true)
 // Não bloquear coleta documental em etapa já explicitamente solicitada.
 if(/\b(?:cpf|cnpj|data de nascimento|cep cadastrado)\b/.test(prior))return null
 // Não interceptar a confirmação de uma oferta humana: o tratamento
 // genérico de consentimento vem primeiro no endpoint.
 if(pureYes(text)&&/\b(?:encaminhar|transferir|equipe auto|sinistros auto)\b/.test(prior))return null
 if(towRequest(text)&&!noTow(text)||danger(text)){
  const emergency=danger(text)?'Se houver risco imediato, priorize sua segurança e acione o socorro apropriado. ':''
  return base(emergency+'Não consigo solicitar um guincho ou confirmar a cobertura automaticamente. Posso encaminhar seu atendimento à equipe de Auto/RE para avaliar a assistência com prioridade?')
 }
 if(/\blocal seguro\b/.test(prior)||/\besta[o]? em local seguro\b/.test(prior)){
  if(pureNo(text)||/\b(?:nao esta seguro|ainda na pista|em risco|perigo)\b/.test(fold(text))){
   return base('Priorize sair da área de risco, se for seguro fazê-lo. Se houver perigo imediato, acione o socorro local. Precisa que eu solicite o encaminhamento à equipe Auto/RE para atendimento humano?')
  }
  if(safeConfirmed(text)||pureYes(text)){
   if(noTow(text))return base('Entendi. Não vou acionar serviços sem autorização. Para localizar sua apólice Auto com segurança e dar continuidade ao atendimento de Sinistros, pode informar o CPF ou CNPJ do titular? A confirmação de identidade pode exigir uma etapa adicional.')
   return base('Que bom que estão em segurança. Você precisa de guincho ou assistência para o veículo agora?')
  }
  return base('Não é necessário informar a apólice neste momento. Antes de prosseguir, você e o veículo estão em local seguro?')
 }
 if(/\b(?:precisa de guincho|guincho ou assistencia|precisa de assistencia)\b/.test(prior)){
  if(pureNo(text)||noTow(text))
   return base('Entendido. Para consultar a apólice Auto com segurança antes de encaminhar a solicitação, pode informar o CPF ou CNPJ do titular? A confirmação de identidade pode exigir uma etapa adicional.')
  if(pureYes(text))
   return base('Posso solicitar agora o encaminhamento à equipe Auto/RE para orientar o acionamento de assistência? Não posso confirmar cobertura nem solicitar guincho automaticamente.')
  return null
 }
 return null
}
const isAuto=policy=>{
 const t=fold([policy?.ramo,policy?.linha,policy?.product_code].filter(Boolean).join(' '))
 return /\b(?:auto|automovel|veiculo|carro|frota|moto|motocicleta)\b/.test(t)
}
/** Executar SOMENTE após Junior retornar status VERIFIED para o protocolo. */
export function incidentVerifiedDecision(messages,policies){
 if(!incidentContext(messages))return null
 const list=(Array.isArray(policies)?policies:[]).filter(isAuto).slice(0,12)
 let reference='A identidade foi confirmada pela gestão. '
 if(list.length===1){
  const insurer=String(list[0]?.seguradora||'').replace(/[\r\n\t<>]/g,' ').trim().slice(0,70)
  reference+='Encontrei uma apólice Auto na consulta'+(insurer?' da seguradora '+insurer:'')+'. '
 }else if(list.length>1){
  reference+='Há mais de uma apólice de veículo na consulta; a equipe precisará confirmar a correta. '
 }else{
  reference+='Não encontrei uma apólice de Auto identificável nessa consulta. A equipe poderá conferir o cadastro. '
 }
 return base(reference+'A consulta não confirma cobertura para o acidente nem autorização de guincho. Posso encaminhar você ao Auto/RE para atendimento de Sinistros Auto?')
}
/** Enriquecer o resumo após consentimento, sem expor identificação ou apólice. */
export function enrichConfirmedIncidentHandoff(decision,messages){
 if(!decision||decision.humanHandoff!==true||decision.handoff?.department!=='patrimonio'||!incidentContext(messages))return decision
 return {...decision,agent:'clara',handoff:{...decision.handoff,reason:'Acionamento de Sinistros Auto autorizado pelo cliente',summary:note(messages).slice(0,350)}}
}
