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
  'Vou solicitar seu atendimento à equipe Auto/RE para dar continuidade ao sinistro. '+
  'O sinistro e o guincho ainda não foram acionados pela IA.',true,{
   department:'patrimonio',reason:'Atendimento humano de Sinistros Auto solicitado pelo cliente',
   summary:note(messages).slice(0,350)
  })
}
const safetyQuestion='Antes de prosseguir, você e o veículo estão em local seguro? Se houver risco imediato, priorize o socorro e sua segurança.'
const traumaQuestion='Se houver feridos ou perigo imediato, priorize o socorro (SAMU 192, Bombeiros 193 ou Polícia 190, conforme o caso). Você está em local seguro?'
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
 if(humanRequest(text)&&danger(text))return {
  ...handoff(list,true),reply:safety+' Vou solicitar o atendimento humano de Sinistros Auto com prioridade.'
 }
 return base(safety)
}
/** Não confundir preferência de cobertura no seguro novo com sinistro real. */
const identificationQuestion='Para facilitar o atendimento pela equipe Auto/RE, pode informar o CPF ou CNPJ do titular do seguro? A gestão poderá solicitar uma confirmação adicional de identidade.'
/** Segurança → identificação → Auto/RE. Guincho urgente não aguarda CPF. */
export function incidentFollowupDecision(messages){
 const list=Array.isArray(messages)?messages:[]
 const ctx=incidentContext(list),last=list.at(-1)
 if(!ctx||!inbound(last))return null
 const text=String(last.text||''),normal=fold(text),prior=fold(latestAgent(list))
 const customerSince=list.slice(ctx.start).filter(inbound).map(m=>m.text)
 const safetyConfirmed=customerSince.some(safeConfirmed)
 const urgent=danger(text)||towRequest(text)&&!noTow(text)
 // Mesmo num atendimento já em curso, risco físico ou guincho urgente
 // prevalecem sobre documento, seguro e consentimento comercial.
 if(urgent){
  const warning=danger(text)?'Se houver risco imediato, priorize sua segurança e o socorro local. ':''
  if(humanRequest(text))return {...handoff(list,true),reply:warning+'Vou solicitar atendimento humano de Sinistros Auto com prioridade. Não acionei o guincho.'}
  return base(warning+'Posso encaminhar você ao Auto/RE com prioridade para avaliar a assistência? Não consigo acionar o guincho automaticamente.')
 }
 // Não interromper validação documental solicitada pelo Junior, inclusive
 // a resposta de nascimento/CEP. O CPF não comprova identidade sozinho.
 if(/\b(?:cpf|cnpj|data de nascimento|cep cadastrado)\b/.test(prior))return null
 // O aceite de oferta de Auto/RE é processado por consent-routing.
 if(pureYes(text)&&/\b(?:encaminhar|transferir|equipe auto|sinistros auto)\b/.test(prior))return null
 const answeringSafety=/\blocal seguro\b/.test(prior)||/\best[aá] em seguranca\b/.test(prior)
 if(answeringSafety){
  if(pureNo(text)||/\b(?:nao\s+(?:estou|estamos|esta|ficou|e)\s+(?:(?:em|num|no)\s+)?(?:um\s+)?local\s+seguro|nao\s+(?:estou|estamos|esta|ficou)\s+seguros?|ainda\s+(?:estou|estamos|esta)\s+(?:na|no)\s+(?:pista|via)|ainda\s+na\s+pista|em\s+risco|perigo)\b/.test(normal)){
   return base('Priorize sua segurança e acione o socorro local se houver risco. Posso encaminhar você ao Auto/RE com prioridade?')
  }
  if(safeConfirmed(text)||pureYes(text))return base('Que bom que estão em segurança. '+identificationQuestion)
  return base('Entendi. Você e o veículo estão em local seguro?')
 }
 // Resposta a uma pergunta antiga sobre guincho: não criar outra rodada
 // de perguntas; passar para a identificação, salvo assistência urgente.
 if(/\b(?:precisa de guincho|guincho ou assistencia|precisa de assistencia)\b/.test(prior)){
  if(pureYes(text))return base('Posso encaminhar você ao Auto/RE com prioridade para avaliar a assistência? Nenhum guincho foi solicitado pela IA.')
  if(pureNo(text)||noTow(text))return base(identificationQuestion)
 }
 if(humanRequest(text)){
  if(!safetyConfirmed)return base(safetyQuestion)
  return base(identificationQuestion)
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
 return base(reference+'Posso encaminhar seu atendimento de Sinistros Auto ao Auto/RE? A equipe confirmará os próximos passos e a cobertura aplicável.')
}
/** Enriquecer o resumo após consentimento, sem expor identificação ou apólice. */
export function enrichConfirmedIncidentHandoff(decision,messages){
 if(!decision||decision.humanHandoff!==true||decision.handoff?.department!=='patrimonio'||!incidentContext(messages))return decision
 return {...decision,agent:'clara',handoff:{...decision.handoff,reason:'Acionamento de Sinistros Auto autorizado pelo cliente',summary:note(messages).slice(0,350)}}
}
