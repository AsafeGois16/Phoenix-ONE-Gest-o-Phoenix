/**
 * Phoenix ONE: Murilo SDR finite interview (LAB FEATURE FLAG).
 * The question bank is the ONLY source of new qualification questions.
 * Does NOT read/inspect media, invoke OCR, save contacts or override routing,
 * consent, emergency instructions, identity checks, or Junior human ownership.
 */
import {approvedQuestionsFor,SDR_PRODUCT_CODES} from './murilo-approved-questions.js'
import {healthLivesCheck,healthCityCheck,volunteeredNetworkPriority} from './murilo-conversation-quality.js'
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const inbound=m=>m?.direction==='inbound'&&m.author==='contact'
const outbound=m=>m?.direction==='outbound'&&m.author==='agent'
const safe=msg=>({agent:'murilo',reply:msg,humanHandoff:false,handoff:null})
const names={
 saude:/\b(?:plano (?:de )?saude|convenio medico|seguro saude)\b/,
 odonto:/\b(?:odonto|odontologico|odontologia|plano dental)\b/,
 vida:/\b(?:seguro (?:de )?vida|vida em grupo)\b/,
 pet:/\b(?:seguro pet|plano pet|plano de saude (?:para )?(?:meu |um )?pet)\b/,
 previdencia:/\bprevidencia\b/,
 auto:/\b(?:seguro auto|seguro (?:de )?(?:carro|automovel|moto)|cotar (?:um )?(?:carro|automovel|moto))\b/,
 frota:/\b(?:seguro (?:de )?frota|cotacao (?:de )?frota|cotar frota)\b/,
 residencial:/\b(?:seguro residencial|seguro (?:da|minha) casa|cotacao (?:de )?residencial)\b/,
 fianca:/\b(?:seguro fianca|fianca locaticia)\b/,
 viagem:/\b(?:seguro viagem|cotacao (?:de )?viagem)\b/,
 bike:/\b(?:seguro (?:de )?(?:bike|bicicleta))\b/,
 empresarial:/\b(?:seguro empresarial|seguro patrimonial (?:da |para )?empresa)\b/,
 equipamentos:/\b(?:seguro (?:de |para )?equipamentos?)\b/,
 rc:/\b(?:responsabilidade civil|seguro rc|rc profissional)\b/,
 cyber:/\b(?:seguro cyber|seguro cibernetico)\b/,
 garantia:/\b(?:seguro garantia|seguro garantias|garantia contratual)\b/,
 credito:/\b(?:seguro (?:de )?credito|credito segurado|seguro de recebiveis)\b/
}
const patLine=new Set(['auto','frota','residencial','fianca','viagem','bike','empresarial','equipamentos','rc','cyber','garantia','credito'])
export function detectSdrQuoteProduct(messages){
 const history=(Array.isArray(messages)?messages:[]).filter(inbound).slice(-20).map(m=>fold(m.text)).filter(Boolean)
 // An earlier product is retained for short, neutral replies; a new quote
 // request supersedes it only when unambiguous. Never infer a mixed product.
 let active=null
 for(const line of history){
  if(/\b(?:quero falar de outro assunto|outro assunto)\b/.test(line)){active=null;continue}
  const matches=Object.entries(names).filter(([,re])=>re.test(line)).map(([k])=>k)
  // "Plano de saúde para pet" belongs only to Pet, not Health.
  if(matches.includes('pet'))matches.splice(matches.indexOf('saude'),matches.includes('saude')?1:0)
  if(matches.includes('frota'))matches.splice(matches.indexOf('auto'),matches.includes('auto')?1:0)
  if(matches.length>1){
   // A preference to use a hospital/benefit in a new insurance doesn't
   // amount to a second insurance product.
   if(matches.includes('saude')&&matches.includes('vida')&&!/\b(?:e seguro de vida|mais seguro de vida|saude e vida)\b/.test(line))matches.splice(matches.indexOf('vida'),1)
  }
  if(matches.length>1)return null
  if(matches.length===1)active=matches[0]
 }
 if(!active)return null
 const corpus=history.join(' ')
 if(active==='saude'&&/\b(?:saude empresarial|plano de saude empresarial|pme de saude)\b/.test(corpus))return 'saude_empresarial'
 if(active==='odonto'&&/\b(?:odonto empresarial|odontologico empresarial)\b/.test(corpus))return 'odonto_empresarial'
 if(active==='vida'&&/\b(?:vida em grupo|seguro de vida empresarial)\b/.test(corpus))return 'vida_grupo'
 return active
}
const commercialEvidence=text=>/\b(?:cotacao|cotar|orcamento|contratar|quero (?:um |uma )?(?:seguro|plano)|renovacao|renovar|proposta comercial)\b/.test(fold(text))
function identityType(messages,product){
 const lines=messages.filter(inbound).map(m=>fold(m.text))
 for(let i=lines.length-1;i>=0;i--){
  const v=lines[i]
  if(/\b(?:cnpj|pessoa juridica|pelo pj|por pj|empresa(?:rial)?)\b/.test(v))return 'cnpj'
  if(/\b(?:cpf|pessoa fisica|pelo pf|por pf|individual)\b/.test(v))return 'cpf'
 }
 return ['saude_empresarial','odonto_empresarial','vida_grupo'].includes(product)?'cnpj':null
}
function newOrRenewal(messages){
 const lines=messages.filter(inbound).map(m=>fold(m.text))
 for(let i=lines.length-1;i>=0;i--){
  if(/\b(?:renovar|renovacao|ja tenho apolice|seguro atual|renovando)\b/.test(lines[i]))return true
  if(/\b(?:seguro novo|nova contratacao|primeiro seguro|primeira contratacao|pela primeira vez|sem seguro|novo seguro)\b/.test(lines[i]))return false
 }
 return null
}
function prevState(messages){
 const lines=messages.filter(inbound).map(m=>fold(m.text))
 const p=lines.findLastIndex(v=>/\b(?:previdencia)\b/.test(v))
 const after=p<0?lines:lines.slice(p)
 let hasPlan=null,thirdParty=false
 for(const v of after){
  if(/\b(?:para (?:outra|meu filho|minha filha|meus filhos|terceira) pessoa|para meus filhos)\b/.test(v))thirdParty=true
  if(/\b(?:ja tenho previdencia|possuo (?:um )?plano|tenho (?:um )?plano (?:de )?previdencia)\b/.test(v))hasPlan=true
  if(/\b(?:nao tenho previdencia|ainda nao tenho (?:um )?plano|nunca tive previdencia)\b/.test(v))hasPlan=false
 }
 // "Sim" / "Não" immediately after a previdência existing-plan question.
 const last=fold(messages.filter(inbound).at(-1)?.text),previous=fold(messages.filter(outbound).at(-1)?.text)
 if(/\b(?:ja possui|possui) algum plano de previdencia\b/.test(previous)){
  if(/^(?:sim|tenho|ja tenho)[!. ]*$/.test(last))hasPlan=true
  if(/^(?:nao|ainda nao)[!. ]*$/.test(last))hasPlan=false
 }
 return {hasPlan,thirdParty}
}
const containsAsked=(outboundText,question)=>{
 const v=fold(outboundText).replace(/[.!?]+/g,'').trim()
 const candidate=fold(question).replace(/[.!?]+/g,'').trim()
 return candidate.length>7&&(v.includes(candidate)||candidate.includes(v)&&v.length>35)
}
const privateDetails=/(?:doenca grave|preexistente|cpf do tutor|endereco do tutor)/i
const normalizations={
 'Seria pelo CPF ou CNPJ?':/\b(?:pelo cpf|pelo cnpj|pessoa fisica|pessoa juridica|empresa|empresarial)\b/,
 'Você possui plano atualmente? Se sim, qual?':/\b(?:ja tenho plano|tenho plano|nao tenho plano|meu plano atual|meu convenio atual)\b/,
 'Você possui seguro de vida atualmente? Se sim, qual?':/\b(?:ja tenho seguro de vida|nao tenho seguro de vida|meu seguro de vida atual)\b/
}
function volunteered(question,messages){
 const text=messages.filter(inbound).map(x=>fold(x.text)).join(' ')
 const q=fold(question)
 for(const [label,re] of Object.entries(normalizations)){if(q===fold(label)&&re.test(text))return true}
 if(/\bmarca, modelo e ano\b/.test(q)&&/\b(?:onix|gol|corolla|hb20|civic|creta|argo|tracker|nivus|polo|uno|mobi|fit|strada|saveiro|moto|honda|toyota)\b.{0,40}\b20\d{2}\b/.test(text))return true
 if(/\bseguro novo ou renovacao\b/.test(q)&&/\b(?:seguro novo|nova contratacao|novo seguro|renovacao|renovar|primeiro seguro)\b/.test(text))return true
 if(/\bquantas (?:pessoas|vidas)\b|\bquantidade de vidas\b|\bsomente para voce ou para mais vidas\b/.test(q)&&
   (/\b\d{1,4}\s*(?:pessoas|vidas|funcionarios|colaboradores|viajantes)\b/.test(text)||/\b(?:so para mim|somente para mim|apenas para mim|so eu|eu e minha esposa|eu e meu marido)\b/.test(text)))return true
 if(/\b(?:idades? das pessoas|as idades|idade das pessoas)\b/.test(q)&&
   /\b(?:idade\s*(?:de|:)?\s*\d{1,2}|\d{1,2}\s*anos|\d{1,2}\s*e\s*\d{1,2}\s*anos)\b/.test(text))return true
 if(/\bem qual cidade\b/.test(q)&&
   /\b(?:moro|resido|moramos|cidade de|moramos em|utilizar(?:ao|a) em)\s+(?:em\s+)?[a-z]{3,}/.test(text))return true
 if(/\bcodigo cnpj|\bcnpj da empresa\b/.test(q)&&/\b(?:cnpj|\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2})\b/.test(text))return true
 if(/\bplano atual\b/.test(q)&&
   (/\b(?:tenho|temos|possuo|possuimos|usamos|atualmente temos|atualmente tenho|estou no|estamos na|nosso plano|meu plano|plano atual|ja temos)\b.{0,65}\b(?:amil|unimed|bradesco|sulamerica|sul america|hapvida|gndi|notredame|porto)\b/.test(text)||/\b(?:nao tenho plano|sem plano atualmente)\b/.test(text)))return true
 if(/\b(?:custo.beneficio|rede credenciada maior)\b/.test(q)&&volunteeredNetworkPriority(messages))return true
 if(/\bprefere\b|\bpreferencia por algum hospital\b/.test(q)&&/\b(?:prefiro|gostaria|quero)\b.{0,50}\b(?:hospital|laboratorio)\b/.test(text))return true
 if(/\bqual (?:e |é )?o destino\b/.test(q)&&/\b(?:viajaremos|destino|vamos para|iremos para)\b/.test(text))return true
 return false
}
function questionsFor(messages,product){
 const {hasPlan,thirdParty}=prevState(messages)
 const type=identityType(messages,product),renewal=newOrRenewal(messages)
 return approvedQuestionsFor(product,{type,renewal,hasPlan,thirdParty})
}
function recentQuestionCount(messages,questions){
 const answered=new Set()
 for(const m of messages.filter(outbound)){
  for(const q of questions)if(containsAsked(m.text,q.text))answered.add(q.id)
 }
 return answered
}
const isImageMetadata=m=>inbound(m)&&m.media_received===true&&
  (!m.media_kind||['image','photo','document','pdf'].includes(m.media_kind))
const photoWasRequested=messages=>messages.filter(outbound).slice(-3).some(m=>/\b(?:encaminhar|enviar|envie|mandar)\b.{0,100}\b(?:apolice|foto|nota fiscal|comprovante|relacao|documento|edital)\b/i.test(fold(m.text)))
function offer(product){
 const line=patLine.has(product)?'Auto/RE':'Benefícios da Phoenix'
 return safe('Com as informações disponíveis, um consultor pode concluir a avaliação. Posso encaminhar sua solicitação à equipe de '+line+'?')
}
/**
 * Returns one deterministic, approved question per message. A photograph is
 * acknowledged only if Junior reports its receipt through trusted metadata.
 * If the question is about sensitive health/identity data, do not collect in
 * this chat. Leave it to authorized human processing.
 */
export function nextMuriloSdrDecision(messages,{maxQuestions=7}={}){
 const list=Array.isArray(messages)?messages:[]
 const last=list.at(-1)
 if(!inbound(last))return null
 const lastCustomer=fold(last.text).replace(/[,.!]+/g,' ').replace(/\s+/g,' ').trim()
 const priorAgent=fold([...list].reverse().find(outbound)?.text)
 // Não insistir em convite já recusado: sem lead e sem novo encaminhamento.
 if(/^(?:nao|nao obrigado|nao obrigada|agora nao|prefiro nao)[.! ]*$/.test(lastCustomer)&&
    /\bposso encaminhar\b/.test(priorAgent))
  return safe('Sem problemas, não farei o encaminhamento. Continuamos à disposição.')

 const product=detectSdrQuoteProduct(list)
 if(!product||!SDR_PRODUCT_CODES.includes(product))
  return safe('Quero evitar perguntas fora do seu contexto. Posso encaminhar sua solicitação a um consultor para confirmar o produto e continuar?')
 // Uma única pergunta de CONFERÊNCIA quando as respostas são contraditórias.
 // Não amplia o formulário nem insiste quando o cliente não sabe responder.
 // Deve ocorrer antes do limite de sete perguntas e antes do aceite humano.
 if(['saude','saude_empresarial','odonto','odonto_empresarial'].includes(product)){
  const lives=healthLivesCheck(list)
  if(lives?.type==='question')return safe(lives.reply)
  const locality=healthCityCheck(list)
  if(locality?.type==='question')return safe(locality.reply)
 }
 const questions=questionsFor(list,product)
 const asked=recentQuestionCount(list,questions)
 const currentQuestionCount=asked.size
 const prefix=isImageMetadata(last)&&photoWasRequested(list)?'Recebi o anexo indicado pelo sistema. ':''
 if(currentQuestionCount>=maxQuestions)return offer(product)
 let next=null
 for(const q of questions){
  if(q.sensitive||privateDetails.test(q.text))continue
  if(asked.has(q.id)||volunteered(q.text,list))continue
  next=q
  break
 }
 if(!next)return offer(product)
 // A media flag contains neither image bytes nor OCR text; never analyze it.
 // A response to a customer FAQ may acknowledge a limitation, but must not
 // insert extra discovery questions beyond the user's approved catalogue.
 const question=next.text
 const latest=fold(last.text)
 const caveat=/\b(?:qual|quais|preco|quanto custa|cobre|cobertura|rede credenciada|hospital)\b.*\?/.test(latest)?
  'A confirmação de preços e coberturas depende da avaliação do consultor. ':''
 return safe((prefix+caveat+question).slice(0,850))
}
export function muriloMediaReceived(message){return isImageMetadata(message)}
