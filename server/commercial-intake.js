/**
 * Coleta de nome de tratamento e roteamento de oportunidades Auto/RE.
 * Sem persistência, sem identificação documental e sem acesso ao Junior.
 * O nome vem exclusivamente da mensagem do contato, não do perfil WhatsApp.
 */
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const isContact=m=>m?.direction==='inbound'&&m?.author==='contact'&&typeof m.text==='string'
const isAgent=m=>m?.direction==='outbound'&&m?.author==='agent'&&typeof m.text==='string'
const namePrompt=text=>/\b(?:como\s+(?:posso|devo)\s+(?:te\s+|lhe\s+)?chamar|qual\s+(?:e\s+)?(?:o\s+)?seu\s+nome|me\s+(?:informa|diz)\s+(?:seu\s+)?nome)\b/i.test(fold(text))
const nameReject=/\b(?:quero|preciso|cotar|cotacao|seguro|carro|veiculo|auto|frota|sim|nao|obrigad|bom|boa|ola|oi|prefiro|cliente|teste|empresa|dependente|beneficiario|pessoa|responsavel|plano)\b/i

function cleanName(value){
 const fragment=String(value||'').split(/[,.!?;:\n]|\s+(?:e quero|e preciso|gostaria|quero|preciso|para cotar|sobre o seguro|que trabalha)\b/i)[0].trim()
 if(!fragment||fragment.length>70||/\d|@|https?:|[\/<>{}]/.test(fragment))return null
 if(!/^[\p{L}][\p{L}' -]*$/u.test(fragment))return null
 const words=fragment.split(/\s+/).filter(Boolean)
 if(!words.length||words.length>4||words.some(w=>w.length>24)||words.some(w=>nameReject.test(fold(w))))return null
 if(words[0].length<2)return null
 return words.map(w=>w.charAt(0).toLocaleUpperCase('pt-BR')+w.slice(1).toLocaleLowerCase('pt-BR')).join(' ')
}
export function clientDeclaredName(messages){
 const list=Array.isArray(messages)?messages:[]
 // Prefer explicitly presented names even if the greeting/question was long ago.
 for(let i=list.length-1;i>=0;i--){
  const m=list[i]
  if(!isContact(m))continue
  const raw=m.text.trim()
  const declaration=raw.match(/(?:^|[\s,.;])(?:meu nome (?:é|eh)|me chamo|pode me chamar de|me chama de|sou o|sou a)\s+([\p{L}][\p{L}' -]{1,70})/iu)
  if(declaration){
   const name=cleanName(declaration[1]);if(name)return name
  }
  const previous=list.slice(0,i).reverse().find(isAgent)
  if(previous&&namePrompt(previous.text)){
   const name=cleanName(raw)
   if(name)return name
  }
 }
 return null
}
export function nameIntakeDecision(messages,selectedAgent){
 const list=Array.isArray(messages)?messages:[]
 const last=list.at(-1)
 if(!isContact(last))return null
 const intro=list.filter(isAgent)
 const known=clientDeclaredName(list)
 const latest=fold(last.text)
 // Urgências e solicitações explícitas de humano não podem ser bloqueadas pelo nome.
 if(/\b(?:ferid|acidente|emergencia|socorro|incendio|sinistro urgente|guincho agora|hospital)\b/.test(latest)||
    /\b(?:falar com|quero|preciso|transferir|encaminhar)\b.{0,65}\b(?:humano|atendente|consultor humano|pessoa do atendimento)\b/.test(latest))return null
 if(!intro.length){
  if(!known)return {agent:'clara',reply:'Olá! Sou a Clara, assistente virtual da Phoenix Insurance. Como posso te chamar?',humanHandoff:false,handoff:null}
  if(selectedAgent==='murilo')return {agent:'clara',reply:'Olá, '+known+'! Sou a Clara, assistente virtual da Phoenix Insurance. Posso encaminhar sua cotação ao Murilo, nosso assistente comercial?',humanHandoff:false,handoff:null}
  return null
 }
 if(selectedAgent!=='murilo'||known)return null
 if(intro.some(m=>/\b(?:murilo)\b/i.test(m.text)&&/\b(?:sou|assistente|comercial)\b/i.test(m.text)))return null
 if(intro.some(m=>namePrompt(m.text)))return null
 if(intro.some(m=>/\bclara\b/i.test(m.text)))return {agent:'clara',reply:'Antes de passar sua cotação ao Murilo, como posso te chamar?',humanHandoff:false,handoff:null}
 return null
}
function autoReQuote(messages){
 const text=(Array.isArray(messages)?messages:[]).filter(isContact).slice(-16).map(m=>fold(m.text)).join(' ')
 const product=/\b(?:auto|automovel|carro|veiculo|frota|residencial|patrimonial|imovel|fianca|bike|equipamento)\b/.test(text)
 const commercial=/\b(?:cotar|cotacao|orcamento|seguro novo|renovacao|renovar|contratar|proposta|comparar|cotacoes)\b/.test(text)
 return product&&commercial
}
/** Only the Junior executes the actual human transfer; this adjusts the proposed destination. */
export function alignAutoReHandoff(payload,messages){
 if(payload?.agent!=='murilo'||payload?.humanHandoff!==true||!payload.handoff||
    !['comercial','patrimonio'].includes(payload.handoff.department)||!autoReQuote(messages))return payload
 const name=clientDeclaredName(messages)
 const prefix=name?'Nome informado pelo cliente: '+name+'. ':'Nome de tratamento ainda não informado. '
 const summary=String(payload.handoff.summary||'').trim()
 const complete=prefix+summary
 return {...payload,handoff:{...payload.handoff,department:'patrimonio',summary:complete.slice(0,350)}}
}
