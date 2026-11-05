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
 // Nome informado após a pergunta da Clara deve avançar imediatamente para o aceite
 // da passagem comercial, em vez de voltar a iniciar o atendimento.
 const previousAgent=list.slice(0,-1).reverse().find(isAgent)
 const nameJustAnswered=Boolean(known&&previousAgent&&namePrompt(previousAgent.text)&&cleanName(last.text)===known)
 const nameJustDeclared=Boolean(clientDeclaredName([last]))
 const muriloAlreadySpoke=intro.some(m=>/\b(?:sou\s+(?:o\s+)?murilo|murilo,\s+do time comercial)\b/i.test(fold(m.text)))
 const muriloOfferAlreadySent=intro.some(m=>/\b(?:posso|deseja|quer)\b.{0,140}\b(?:encaminhar|passar|transferir)\b.{0,120}\bmurilo\b/i.test(fold(m.text)))
 // Urgências e solicitações explícitas de humano não podem ser bloqueadas pelo nome.
 if(/\b(?:ferid|acidente|emergencia|socorro|incendio|sinistro urgente|guincho agora|hospital)\b/.test(latest)||
    /\b(?:falar com|quero|preciso|transferir|encaminhar)\b.{0,65}\b(?:humano|atendente|consultor humano|pessoa do atendimento)\b/.test(latest))return null
 if(selectedAgent==='murilo'&&known&&(nameJustAnswered||nameJustDeclared)&&!muriloAlreadySpoke&&!muriloOfferAlreadySent){
  return {agent:'clara',reply:'Obrigado, '+known+'! Posso passar seu atendimento ao Murilo, nosso assistente comercial, para continuar a cotação?',humanHandoff:false,handoff:null}
 }
 if(!intro.length){
  // A coleta obrigatória aqui é só na abertura comercial ou saudação pura.
  // Consultas documentais, movimentações e operações mantêm suas regras de segurança existentes.
  const greeting=/^(?:(?:oi|ola|opa)(?:[, ]+\s*(?:bom dia|boa tarde|boa noite))?|bom dia|boa tarde|boa noite)[!?. ,]*$/.test(latest)
  if(!known&&(selectedAgent==='murilo'||greeting))return {agent:'clara',reply:'Olá! Sou a Clara, assistente virtual da Phoenix Insurance. Como posso te chamar?',humanHandoff:false,handoff:null}
  // O nome já informado não autoriza nova apresentação da Clara nem uma
  // segunda oferta se o cliente acabou de dizer "sim" à passagem anterior.
  if(known&&selectedAgent==='murilo'&&nameJustDeclared&&!muriloOfferAlreadySent){
   return {agent:'clara',reply:'Obrigado, '+known+'! Posso passar seu atendimento ao Murilo, nosso assistente comercial, para continuar a cotação?',humanHandoff:false,handoff:null}
  }
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

function quoteHistoryText(messages){
 return (Array.isArray(messages)?messages:[]).filter(isContact).slice(-20).map(m=>String(m.text||'')).join(' ')
}
function quoteFacts(messages){
 const text=quoteHistoryText(messages),folded=fold(text),info=[]
 const ramo=/\bfrota\b/.test(folded)?'Frota':/\b(?:residencial|apartamento|imovel)\b/.test(folded)?'Residencial':'Auto'
 info.push('Cotação '+ramo+' solicitada')
 const vehicle=text.match(/\b([\p{L}][\p{L}\d-]{1,24})\s+((?:19|20)\d{2})\b/u)
 if(vehicle)info.push('veículo informado: '+vehicle[1]+' '+vehicle[2])
 if(/\b(?:uso pessoal|meu pessoal|uso particular)\b/.test(folded))info.push('uso pessoal')
 if(/\b(?:seguro novo|protecao nova|cotacao nova)\b/.test(folded))info.push('contratação nova')
 if(/\b(?:renovacao|renovar)\b/.test(folded))info.push('renovação')
 if(/\b(?:protecao padrao|cobertura padrao)\b/.test(folded))info.push('interesse em proteção padrão, a definir com consultor')
 else if(/\b(?:colisao|roubo)\b/.test(folded))info.push('interesse em colisão/roubo (coberturas a verificar)')
 return info.join('; ')+'. '
}
/**
 * Pedido inequívoco de consultor humano em uma cotação Auto/RE já em andamento
 * é, por si só, consentimento para solicitar handoff ao Junior.
 * Não depende da decisão generativa do Murilo nem de convite anterior.
 */
export function directAutoReHumanHandoff(messages,selectedAgent){
 const list=Array.isArray(messages)?messages:[],last=list.at(-1)
 if(selectedAgent!=='murilo'||!isContact(last)||!autoReQuote(list))return null
 const msg=fold(last.text)
 if(/\b(?:nao|nunca|prefiro nao)\b.{0,35}\b(?:transfer|encaminh|humano)\b/.test(msg))return null
 const asked=/(?:\b(?:me transfira|me transferir|me encaminhe|encaminhe|transfira|transferir|transferencia)\b.{0,75}\b(?:humano|atendente|consultor|pessoa)\b|\b(?:falar|conversar|atendimento)\b.{0,55}\b(?:humano|atendente|consultor)\b|\b(?:humano|atendente|consultor)\b.{0,40}\b(?:por favor|agora)\b)/.test(msg)
 if(!asked)return null
 return {agent:'murilo',reply:'Entendido. Vou solicitar agora o encaminhamento da sua cotação à equipe de Auto/RE para atendimento humano.',humanHandoff:true,handoff:{
  department:'patrimonio',
  reason:'Cliente solicitou diretamente consultor humano para cotação Auto/RE',
  summary:quoteFacts(list)+'Encaminhamento humano solicitado expressamente pelo cliente.'
 }}
}
/** Quando os dados iniciais já bastam, oferecer o consultor sem inventar preço ou franquia. */
export function offerReadyAutoReHandoff(messages,selectedAgent){
 const list=Array.isArray(messages)?messages:[],last=list.at(-1)
 if(selectedAgent!=='murilo'||!isContact(last)||!autoReQuote(list))return null
 const lastText=fold(last.text),history=fold(quoteHistoryText(list))
 const consentOrRefusal=/^(?:sim|nao|pode encaminhar|confirmo|autorizo|prefiro nao)[.! ]*$/.test(lastText)
 if(consentOrRefusal||/\b(?:o que|qual valor|quanto|explique|por que|cobre|cobertura de|diferenca)\b/.test(lastText)&&lastText.includes('?'))return null
 const endOfPreferences=/\b(?:protecao padrao|cobertura padrao|somente estas coisas|somente essas coisas|so essas coberturas|apenas essas coberturas|por aqui mesmo|a mais comum)\b/.test(lastText)
 const hasVehicle=/\b[\p{L}][\p{L}\d-]{1,24}\s+(?:19|20)\d{2}\b/u.test(history)
 const hasUsage=/\b(?:uso pessoal|meu pessoal|uso particular|uso comercial|frota)\b/.test(history)
 const hasInsuranceIntent=/\b(?:seguro novo|protecao nova|contratacao|renovacao|renovar)\b/.test(history)
 if(!endOfPreferences||!hasVehicle||!hasUsage||!hasInsuranceIntent)return null
 // A oferta não efetiva a passagem. A próxima resposta do cliente deve confirmar.
 return {agent:'murilo',reply:'Entendi sua preferência para a cotação. A avaliação de preços, coberturas e franquia será feita por um consultor, não automaticamente por este chat. Posso encaminhar as informações já fornecidas à equipe de Auto/RE para que um consultor continue o atendimento?',humanHandoff:false,handoff:null}
}

/** Only the Junior executes the actual human transfer; this adjusts the proposed destination. */
export function alignAutoReHandoff(payload,messages){
 if(payload?.agent!=='murilo'||payload?.humanHandoff!==true||!payload.handoff||
    !['comercial','patrimonio'].includes(payload.handoff.department)||!autoReQuote(messages))return payload
 const name=clientDeclaredName(messages)
 const prefix=name?'Nome informado pelo cliente: '+name+'. ':'Nome de tratamento ainda não informado. '
 const summary=String(payload.handoff.summary||'').trim()
 const facts=quoteFacts(messages)
 const complete=prefix+facts+summary
 return {...payload,handoff:{...payload.handoff,department:'patrimonio',summary:complete.slice(0,350)}}
}

/** Substitui promessa de cotação/retorno automático por pedido de aceite ao Auto/RE. */
export function guardCommercialQuoteClosing(payload,messages){
 if(payload?.agent!=='murilo'||payload?.humanHandoff===true||!autoReQuote(messages))return payload
 const last=(Array.isArray(messages)?messages:[]).filter(isContact).at(-1)
 const lastText=fold(last?.text)
 if(/\b(?:encaminhe|me transfira|quero falar com consultor|quero atendimento humano)\b/.test(lastText))return payload
 const reply=fold(payload?.reply)
 if(/\b(?:posso|deseja|quer)\b.{0,180}\b(?:encaminhar|transferir|passar)\b/.test(reply))return payload
 const unverifiedFuture=/\b(?:vou|irei|iremos|vamos)\b[\s\S]{0,220}\b(?:preparar|enviar|retornar|retorno|consolidar)\b[\s\S]{0,170}\b(?:cotacao|opcoes|proposta|breve)\b/.test(reply)
 const unspecifiedReturn=/\b(?:retorno|retornaremos|entraremos em contato)\b.{0,60}\b(?:em breve|com as opcoes|com a cotacao)\b/.test(reply)
 const inventedRegistration=/\b(?:vou registrar|irei registrar|registrarei|vou anotar|compartilho aqui|enviarei a cotacao|assim que a cotacao estiver pronta)\b/.test(reply)
 if(!unverifiedFuture&&!unspecifiedReturn&&!inventedRegistration)return payload
 return {...payload,reply:'Com as informações que você compartilhou, podemos avançar na análise da cotação. Posso encaminhar sua solicitação à equipe de Auto/RE para um consultor avaliar as opções?',humanHandoff:false,handoff:null}
}
