/**
 * Validações pontuais do roteiro fechado do Murilo.
 *
 * Somente corrige contradições já observadas: vidas x idades e local ambíguo.
 * Não adiciona perguntas comerciais ao catálogo nem usa LLM, geocodificação
 * ou dados de terceiros. Caso a pessoa não saiba responder, não insiste.
 */
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const inbound=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outbound=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const ageQuestion=s=>/\b(?:quais sao as idades|informe as idades|informar as idades|idades das pessoas|idades de quem)\b/.test(fold(s))
const cityQuestion=s=>/\b(?:em qual cidade|qual cidade|qual municipio)\b/.test(fold(s))
const numberOfLives=s=>{
 const f=fold(s),m=[...f.matchAll(/\b(\d{1,3})\s*(?:vidas?|pessoas|beneficiarios|participantes|colaboradores)\b/g)]
 return m.length?Number(m.at(-1)[1]):null
}
const agesInAnswer=s=>{
 const v=fold(s).replace(/^idades?\s*[:=-]\s*/,'').replace(/^sao\s*(?:as seguintes)?\s*[:=-]?\s*/,'').trim()
 // Accept only age lists, never numbers from CNPJ, dates, prices, or policies.
 if(!/^\d{1,3}(?:\s*[,;]\s*\d{1,3}|\s+e\s+\d{1,3}|\s+\d{1,3})+$/.test(v))return null
 const nums=(v.match(/\b\d{1,3}\b/g)||[]).map(Number)
 if(nums.length<2||nums.length>99||nums.some(n=>n>110||n<0))return null
 return nums
}
function lastAnswerAfterQuestion(messages,predicate){
 for(let i=messages.length-1;i>=0;i--){
  if(!outbound(messages[i])||!predicate(messages[i].text))continue
  const next=messages.slice(i+1).find(inbound)
  if(next)return {questionIndex:i,answerIndex:messages.indexOf(next,i+1),answer:next.text}
 }
 return null
}
function alreadyClarified(messages,predicate){
 const idx=messages.findLastIndex(m=>outbound(m)&&predicate(m.text))
 if(idx<0)return null
 return {index:idx,answer:messages.slice(idx+1).find(inbound)?.text??null}
}
const livesClarification=s=>/\bpara confirmar as vidas e idades\b/.test(fold(s))
const locationClarification=s=>/\bpara confirmar a localizacao\b/.test(fold(s))
export function healthLivesCheck(messages){
 const history=Array.isArray(messages)?messages:[]
 const age=lastAnswerAfterQuestion(history,ageQuestion)
 if(!age)return null
 const reported=agesInAnswer(age.answer)
 if(!reported)return null
 const counts=history.slice(0,age.answerIndex+1).filter(inbound)
  .map(m=>numberOfLives(m.text)).filter(n=>n!==null)
 if(!counts.length)return null
 let lives=counts.at(-1)
 // A response to our prior discrepancy check can correct the number of lives
 // even when the customer answers simply "5".
 const clarified=alreadyClarified(history,livesClarification)
 if(clarified?.answer){
  const typed=fold(clarified.answer)
  const bare=typed.match(/^(?:sao\s*)?(\d{1,3})(?:\s*(?:vidas?|pessoas))?\.?$/)
  const declared=numberOfLives(typed)
  if(declared!==null)lives=declared
  else if(bare)lives=Number(bare[1])
 }
 if(lives===reported.length||!Number.isSafeInteger(lives)||lives<1||lives>999)return null
 // One and only one clarification. If already asked, pass the mismatch to the
 // human via the closing offer rather than looping on the same question.
 const detail={declared:lives,received:reported.length,difference:lives-reported.length}
 if(clarified)return {type:'pending',...detail}
 if(lives>reported.length){
  return {type:'question',...detail,reply:
   'Para confirmar as vidas e idades: você informou '+lives+' vidas e '+reported.length+
   ' idades. As outras '+(lives-reported.length)+' idades ainda serão enviadas ou devemos ajustar a quantidade de vidas?'}
 }
 return {type:'question',...detail,reply:
  'Para confirmar as vidas e idades: você informou '+lives+' vidas e '+reported.length+
  ' idades. Qual é a quantidade correta de pessoas que entrarão no plano?'}
}
export function healthCityCheck(messages){
 const history=Array.isArray(messages)?messages:[]
 const asked=lastAnswerAfterQuestion(history,cityQuestion)
 if(!asked)return null
 const clarified=alreadyClarified(history,locationClarification)
 if(clarified)return null
 const text=fold(asked.answer)
 // Vila Mariana é bairro da cidade de São Paulo, não uma zona norte.
 const vila=/(?:(?:vila mariana))/.test(text)
 const north=/\b(?:zona norte|zn)\b/.test(text)
 const south=/\b(?:zona sul|zs)\b/.test(text)
 if(vila&&north)return {type:'question',reply:'Para confirmar a localização: você prefere atendimento na Zona Norte de São Paulo ou no bairro Vila Mariana?'}
 if(vila&&south)return null
 // "Zona Norte" sem o município não responde à pergunta "em qual cidade".
 const zone=/\b(?:zona (?:norte|sul|leste|oeste)|zn|zs|zl|zo)\b/.test(text)
 const city=/\b(?:sao paulo|guarulhos|osasco|santo andre|sao bernardo|barueri|maua|diadema|suzano|itaquaquecetuba|aruba)\b/.test(text)
 if(zone&&!city&&!vila&&text.length<=55)return {type:'question',reply:'Para confirmar a localização: essa região fica na cidade de São Paulo ou em outro município?'}
 return null
}
export function volunteeredNetworkPriority(messages){
 const texts=(Array.isArray(messages)?messages:[]).filter(inbound).map(m=>fold(m.text))
 return texts.some(t=>/\b(?:rede credenciada (?:maior|melhor|mais ampla)|rede (?:maior|mais ampla|melhor)|melhorar (?:a|minha|nossa)?\s*rede|ampliar (?:a|minha|nossa)?\s*rede|mais (?:hospitais|opcoes de hospitais)|prioridade (?:e |eh )?(?:a )?rede|buscando uma rede credenciada maior|quero (?:uma )?rede maior)\b/.test(t)) ||
  /\b(?:melhor custo.beneficio|menor mensalidade|reduzir (?:o )?custo|mais economico|mais barato)\b/.test(t))
}
