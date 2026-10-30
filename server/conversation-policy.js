/** Somente regras de conversação; não persiste dados pessoais. */
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
/**
 * Identificação robusta de apresentações. O modelo pode dizer "Sou Clara"
 * ou "Sou a Clara"; ambas são apresentação, inclusive quando o texto do
 * histórico já não está na janela recente. Não depende de pontuação ou caixa.
 */
export function containsAgentIntroduction(text,agent){
 const normalized=plain(text)
 if(agent==='clara')return /\b(?:sou (?:a )?clara|aqui e (?:a )?clara|me chamo clara|meu nome e clara|clara aqui)\b/.test(normalized)
 if(agent==='murilo')return /\b(?:sou (?:o )?murilo|aqui e (?:o )?murilo|me chamo murilo|meu nome e murilo|murilo aqui)\b/.test(normalized)
 return false
}
const customerTexts=messages=>(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact').map(m=>String(m.text||''))
export function isCommercialRequest(text){
 return /\b(cot(ar|acao)|orcamento|simul(acao|ar)|proposta comercial|quero contratar|quero comprar|quanto custa (?:um|o) seguro)\b/.test(plain(text))
}
export function shouldLookupPersonalData(messages,agent,accountHistory){
 if(agent==='murilo')return false
 const history=customerTexts(messages),latest=plain(history.at(-1))
 if(!latest||isCommercialRequest(latest))return false
 if(isAssistanceEligibilityQuestion(latest))return true
 if(/\b(quais seguros|que seguros|seguros (?:eu )?tenho|meus? seguros|minhas? apolices|qual apolice|meus? contratos|meus? boletos|minhas? parcelas|meus? pagamentos|seguro que tenho|vencimentos?|faturas?|carteirinha|pendencias?|valores? das? parcelas?|detalhes completos|meus? valores?|quais coberturas?|minhas? coberturas?|meus? premios?|minhas? franquias?|meu capital segurado|meu seguro|minha apolice)\b/.test(latest))return true
 if(accountHistory && /\b(coberturas?|franquias?|premios?|capital segurado|vencimentos?|seguradora|pendencias?)\b/.test(latest))return true
 if(accountHistory && (/^\s*(?:[\d./\-\s]{8,25})\s*$/.test(latest)||/\b(?:cpf|cnpj|nasci em|nascimento|cep)\b/.test(latest)))return true
 if(accountHistory && /^(?:sim|claro|isso|pode|detalhes|todos|todas|mais detalhes|quero saber mais|quero (?:ver )?(?:todas?|completo)|mostr[ae] (?:todas?|a lista)|lista completa|relacao completa|me manda todas)\b/.test(latest))return true
 if(accountHistory && fullInstallmentRequest(latest))return true
 return false
}

/**
 * Clara precisa se identificar mesmo quando a resposta é gerada por uma regra
 * direta do servidor (por exemplo, solicitação inicial de CPF/CNPJ).
 * Nunca adiciona conteúdo quando a IA não responderá e não repete a apresentação
 * caso já exista resposta de agente no mesmo protocolo.
 */
export function ensureClaraIntro(reply,messages,alreadyPresented=false){
 const content=String(reply??'').trim()
 if(!content)return content
 const history=Array.isArray(messages)?messages:[]
 const hasClaraIntroduction=observedAgentIntroductions(history).clara
 if(alreadyPresented||hasClaraIntroduction)return content
 if(containsAgentIntroduction(content,'clara'))return content
 const introduction='Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. 💙\n\n'
 return (introduction+content).slice(0,1800)
}


/** Only recognize introductions in messages that Junior confirms as outbound agent speech.
 * Do not persist message content, identities, contact data or attempted suggestions.
 */
export function observedAgentIntroductions(messages){
 const texts=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string').map(m=>plain(m.text))
 return {
  clara:texts.some(t=>containsAgentIntroduction(t,'clara')),
  murilo:texts.some(t=>containsAgentIntroduction(t,'murilo'))
 }
}
/** Remove redundant self-introduction at the start of a generated response,
 * preserving the useful answer and any greeting that is not a new self-introduction.
 */
export function omitRepeatedAgentIntroduction(reply,agent,alreadyPresented=false){
 const content=String(reply??'').trim()
 if(!content||!alreadyPresented)return content
 const named=agent==='clara'?'clara':agent==='murilo'?'murilo':null
 if(!named)return content
 const expression=new RegExp("^(?:ol[aá][!,. ]*|bom dia[!,. ]*|boa tarde[!,. ]*|boa noite[!,. ]*)?(?:sou (?:(?:a|o) )?"+named+"|aqui [eé] (?:(?:a|o) )?"+named+"|me chamo "+named+"|meu nome [eé] "+named+")[^.!?\\n]{0,95}[.!?]?\\s*","i")
 const stripped=content.replace(expression,'').trim()
 return stripped||'Como posso ajudar?'
}

/**
 * Defesa final contra duas apresentações de Clara NA MESMA resposta.
 * A primeira saudação é preservada; apresentações repetidas no início dos
 * parágrafos são removidas sem apagar perguntas ou orientações seguintes.
 * Se o Junior adicionar uma saudação externa, essa camada não controla o texto.
 */
export function dedupeClaraIntroductions(reply,alreadyPresented=false){
 const raw=String(reply??'').trim()
 if(!raw)return raw
 let seen=Boolean(alreadyPresented)
 const introduction=/^(?:(?:ol[aá]|bom dia|boa tarde|boa noite)[!,. ]*\s*)?(?:(?:sou (?:a )?clara)|(?:aqui [eé] (?:a )?clara)|(?:me chamo clara)|(?:meu nome [eé] clara))\b[^.!?\n]{0,175}[.!?]\s*(?:💙\s*)?/i
 const cleaned=[]
 for(const paragraph of raw.split(/\n\s*\n/)){
  const trimmed=paragraph.trim()
  if(!trimmed)continue
  if(!introduction.test(trimmed)){cleaned.push(trimmed);continue}
  if(!seen){cleaned.push(trimmed);seen=true;continue}
  const rest=trimmed.replace(introduction,'').trim()
  if(rest)cleaned.push(rest)
 }
 return cleaned.join('\n\n').trim()||'Como posso ajudar?'
}

/** Remove placeholders técnicos de números mascarados do texto visível ao cliente. */
export function hideIdentifierPlaceholders(reply){
 return String(reply??'')
  .replace(/\s*\|\s*Ap[oó]lice:\s*\[IDENTIFICADOR\]/gi,'')
  .replace(/Ap[oó]lice\s+\[IDENTIFICADOR\]:/gi,'Coberturas cadastradas:')
  .replace(/Ap[oó]lice:\s*\[IDENTIFICADOR\]/gi,'Número da apólice não exibido')
}

export function firstMuriloAppearance(messages,alreadyPresented=false){
 if(alreadyPresented)return false
 const outbound=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='outbound'&&m.author==='agent').map(m=>plain(m.text))
 return !outbound.some(t=>containsAgentIntroduction(t,'murilo'))
}
/**
 * Primeira cotação residencial: a abertura deve ser progressiva. O endereço
 * completo, CEP e documento não são necessários nessa etapa.
 * Só corrige uma pergunta invasiva gerada pelo modelo; nos demais casos mantém
 * a resposta natural e a consulta ao prompt mestre/RAG.
 */
export function refineMuriloFirstResidentialReply(reply,customerText,firstTurn=true){
 const content=String(reply??'').trim()
 if(!content||!firstTurn)return content
 const asked=plain(customerText)
 if(!/\b(?:residencial|residencia)\b/.test(asked)||!/\b(?:cotacao|cotar|orcamento|contratar|seguro)\b/.test(asked))return content
 const answer=plain(content)
 const premature=/\b(?:endereco|cep|logradouro|rua|numero do imovel|cpf|cnpj)\b/.test(answer)
 // Só corrige quando o modelo adiantou documentação/endereço antes da triagem.
 const alreadyQualified=/\b(?:casa ou apartamento|tipo de imovel|em qual cidade|qual cidade|cidade e o tipo|cidade fica)\b/.test(answer)
 if(!premature||alreadyQualified)return content
 return 'Vou te ajudar com essa cotação. Para começar, o imóvel é uma casa ou apartamento e em qual cidade ele fica?'
}
export function ensureMuriloIntro(reply,messages,customerText='',alreadyPresented=false){
 const content=String(reply??'').trim()
 if(!content)return ''
 const first=firstMuriloAppearance(messages,alreadyPresented)
 if(!first)return content
 const candidate=refineMuriloFirstResidentialReply(content,customerText,first)
 if(containsAgentIntroduction(candidate,'murilo'))return candidate
 const sales= /\b(?:cotacao|cotar|contratar|orcamento|seguro)\b/.test(plain(customerText))
 const intro='Olá! Sou o Murilo, do time comercial da Phoenix Insurance. '
 const connector=sales && !/\b(?:vou te ajudar|ajudo voce|vamos comecar)\b/.test(plain(candidate))?'Vou te ajudar com essa cotação. ':''
 return (intro+connector+candidate).slice(0,1800)
}
export function isAssistanceEligibilityQuestion(text){
 const t=plain(text)
 if(/\b(?:acionar|chamar|solicitar|pedir|preciso de|mande|mandar|enviar)\b.{0,40}\bguincho\b/.test(t))return false
 return /\b(?:guincho|reboque|assistencia 24 horas)\b/.test(t)
  && /\b(?:tenho direito|inclui|cobre|cobertura|tem|disponivel|posso usar|qual|quais|quantos|limite|km|quilometros)\b/.test(t)
}
export function isReadonlyConsultation(text){
 const t=plain(text)
 if(isAssistanceEligibilityQuestion(text))return true
 if(/\b(?:quero falar com|atendente|consultor|pessoa|transferir|encaminhar|mandar boleto|envia boleto|enviar boleto|cancelar|excluir|incluir|sinistro|indenizacao|solicitar|abrir chamado)\b/.test(t))return false
 return /\b(?:seguros? (?:eu )?tenho|meus? seguros|apolices?|detalhes? completos?|detalhes? (?:da|das|dos)|parcelas?|vencimentos?|valor(?:es)?|seguradora|coberturas?|franquias?|capital segurado|premios?|pendencias?|pagamento|quais seguros|lista completa|relacao completa|todas as parcelas|todos os vencimentos|me mostre tudo)\b/.test(t)
}
export function isVerifiedReadonlyContext(messages){
 const recent=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact').slice(-10).reverse()
 for(const m of recent){
  const text=plain(m.text)
  if(isReadonlyConsultation(text))return true
  if(isCommercialRequest(text)||/\b(?:cancelar|enviar boleto|encaminhar|atendente|excluir|incluir|sinistro)\b/.test(text))return false
 }
 return false
}
/**
 * Somente dados da resposta identity/resolve com status verified.
 * Não inferir status de pendências ou calcular prêmio a partir das parcelas.
 */
const safeLine=x=>String(x??'').replace(/[\r\n\0-\x1f]+/g,' ').trim().slice(0,160)
const safePolicyNumber=x=>{const n=safeLine(x);return n&&!/^\[(?:IDENTIFICADOR|DOCUMENTO|CONTATO|EMAIL)\]$/i.test(n)?n:null}
const insuranceProduct=x=>{const t=plain(x);if(/\b(?:automovel|auto|carro|veiculo|moto)\b/.test(t))return 'auto';if(/\b(?:odontologico|odonto|dental)\b/.test(t))return 'odonto';if(/\b(?:saude|medico|hospitalar)\b/.test(t))return 'saude';if(/\b(?:vida|invalidez)\b/.test(t))return 'vida';return null}
export function requestedPortfolioProduct(messages){
 const inbound=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact').slice(-8).reverse()
 for(const item of inbound){
  const t=plain(item.text)
  if(/\b(?:cpf|cnpj)\b/.test(t)||/^\s*[\d./\s-]{8,25}$/.test(t))continue
  // Pedido de carteira completa nunca é limitado por uma menção anterior
  // a Auto, Vida ou outro ramo.
  if(/\b(?:quais seguros|meus seguros|todos os seguros|todas as apolices|consultar meus seguros|lista completa de seguros)\b/.test(t))return null
  if(/\b(?:guincho|reboque)\b/.test(t))return 'auto'
  if(/\b(?:seguro|apolice|cobertura|franquia|guincho|reboque|assistencia)\b/.test(t)){
   const detected=insuranceProduct(t)
   if(detected)return detected
  }
 }
 return null
}
const brl=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n):null
const dateBR=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):safeLine(d)
const fullInstallmentRequest=t=>/\b(?:quero\s+(?:ver\s+)?(?:a\s+)?(?:lista\s+)?complet[oa]|(?:me\s+)?mostr[ae]\s+(?:a\s+)?lista\s+completa|todas?\s+(?:as\s+)?parcelas|todos?\s+(?:os\s+)?vencimentos|lista\s+completa|relacao\s+completa|lista\s+inteira|detalhes?\s+completos?|tudo\s+completo|mostr[ae]\s+tudo|quero\s+(?:ver\s+)?tud[oa]s?|me\s+envie\s+tudo)\b/.test(t)
export function portfolioFocus(messages){
 const inbound=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact')
 const entries=inbound.slice(-10).reverse()
 for(let i=0;i<entries.length;i++){
   const t=plain(entries[i].text)
   if(!t||/^\s*[\d.\-/ ]{8,25}\s*$/.test(t))continue
   if(fullInstallmentRequest(t)){
     if(/\b(?:parcelas?|vencimentos?|boletos?|pagamentos?|mensalidades?)\b/.test(t))return 'installments_full'
     if(/\b(?:coberturas?|franquias?)\b/.test(t))return 'coverages'
     const older=entries.slice(i+1).map(m=>plain(m.text))
     if(older.some(text=>/\b(?:parcelas?|vencimentos?|boletos?|pagamentos?|mensalidades?)\b/.test(text)))return 'installments_full'
     return 'details'
   }
   if(isAssistanceEligibilityQuestion(t))return 'assistance'
   if(/\b(?:coberturas?|franquias?|capital segurado)\b/.test(t))return 'coverages'
   if(/\b(?:pendencias?|documentos pendentes|o que esta pendente)\b/.test(t))return 'pending'
   if(/\b(?:parcelas?|vencimentos?|boletos?|pagamentos?|mensalidades?)\b/.test(t))return 'installments'
   if(/\b(?:seguros?|apolices?|seguradoras?)\b/.test(t))return 'summary'
 }
 return 'summary'
}
function saoPauloToday(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const p=Object.fromEntries(parts.map(v=>[v.type,v.value]))
 return p.year+'-'+p.month+'-'+p.day
}
function dueISO(date){
 if(typeof date!=='string')return null
 const input=date.trim()
 const iso=input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
 const br=input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
 const y=iso?Number(iso[1]):br?Number(br[3]):0
 const m=iso?Number(iso[2]):br?Number(br[2]):0
 const d=iso?Number(iso[3]):br?Number(br[1]):0
 const stamp=new Date(Date.UTC(y,m-1,d))
 if(!y||stamp.getUTCFullYear()!==y||stamp.getUTCMonth()+1!==m||stamp.getUTCDate()!==d)return null
 return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')
}
export function selectInstallmentHighlights(installments,{today}={}){
 const listed=Array.isArray(installments)?installments.slice(0,12):[]
 const reference=dueISO(today)||saoPauloToday()
 const entries=listed.map((value,index)=>({value,index,date:dueISO(value?.vencimento)}))
 const sorted=(a,b)=>(a.date||'9999-99-99').localeCompare(b.date||'9999-99-99')||a.index-b.index
 const overdue=entries.filter(x=>x.value?.vencida===true).sort(sorted)
 const upcoming=entries.filter(x=>x.value?.vencida===false&&x.date&&x.date>=reference).sort(sorted)[0]||null
 return {overdue:overdue.map(x=>x.value),next:upcoming?.value||null,listed}
}
export function formatVerifiedPortfolio(data,{focus='summary',maxChars=1770,today,product=null}={}){
 const allPolicies=Array.isArray(data?.policies)?data.policies:[]
 const policies=product?allPolicies.filter(p=>insuranceProduct(p.ramo||p.linha||'')===product):allPolicies
 const installments=Array.isArray(data?.installments)?data.installments:[]
 const pending=Array.isArray(data?.pending)?data.pending:[]
 if(!policies.length&&!installments.length&&!pending.length)return focus==='pending'?
  'A consulta de pendências ainda não está disponível nesta integração. Para verificar pendências específicas, posso direcionar seu atendimento à equipe responsável.':
  null
 const lines=['Conferi as informações autorizadas do seu cadastro.']
 const add=(items,heading)=>{if(items.length)lines.push('',heading,...items)}
 const policiesLines=policies.map((p,index)=>{
   const fields=[safeLine(p.ramo||p.linha||'Seguro'),p.seguradora?'Seguradora: '+safeLine(p.seguradora):null,safePolicyNumber(p.numero)?'Apólice: '+safePolicyNumber(p.numero):null,p.fim_vigencia?'Vigência até: '+dateBR(p.fim_vigencia):null,
    p.premio_total!=null&&brl(p.premio_total)?'Prêmio total: '+brl(p.premio_total)+' (período da apólice)':null,
    p.premio_mensal!=null&&brl(p.premio_mensal)?'Mensalidade: '+brl(p.premio_mensal):null,
    p.capital_segurado!=null&&brl(p.capital_segurado)?'Capital segurado da apólice: '+brl(p.capital_segurado):null,
    p.status?'Situação: '+(p.status==='em_vigor'?'Em vigor':safeLine(p.status)):null
   ].filter(Boolean)
   return (index+1)+'. '+fields.join(' | ')
 })
 const coverageLines=[]
 for(let i=0;i<policies.length;i++){
  const p=policies[i],covers=Array.isArray(p.coberturas)?p.coberturas:[]
  if(!covers.length)continue
  const shown=covers.slice(0,focus==='summary'?2:12)
  coverageLines.push('Apólice '+(safePolicyNumber(p.numero)||('seguro '+(i+1)))+':')
  for(const c of shown){
    const item=typeof c==='string'?{nome:c}:c
    if(!item||typeof item!=='object'||!safeLine(item.nome))continue
    coverageLines.push('• '+[safeLine(item.nome),brl(item.capital_segurado)?'Capital: '+brl(item.capital_segurado):null,
     brl(item.franquia)?'Franquia: '+brl(item.franquia):null].filter(Boolean).join(' | '))
  }
  if(covers.length>shown.length)coverageLines.push('Mais '+(covers.length-shown.length)+' cobertura(s) cadastrada(s).')
 }
 const selectedInstallments=selectInstallmentHighlights(installments,{today})
 const formatInstallment=(p,i)=>(i+1)+'. '+[
  p.apolice?'Apólice: '+safeLine(p.apolice):null,p.ramo?safeLine(p.ramo):null,
  p.vencimento?'Vencimento: '+dateBR(p.vencimento):null,
  brl(p.valor)?'Parcela: '+brl(p.valor):null,
  p.vencida===true?'Vencida':p.vencida===false?'Não vencida':null
 ].filter(Boolean).join(' | ')
 const installmentLines=selectedInstallments.listed.map(formatInstallment)
 const overdueLines=selectedInstallments.overdue.map(formatInstallment)
 const nextLine=selectedInstallments.next?formatInstallment(selectedInstallments.next,0):null
 const addCompactInstallments=()=>{
   if(overdueLines.length)add(overdueLines,overdueLines.length===1?'Parcela vencida:':'Parcelas vencidas:')
   if(nextLine)add([nextLine],'Próximo vencimento:')
   if(installments.length&&!overdueLines.length&&!nextLine)lines.push('Não encontrei parcelas com vencimento confirmado para exibir no resumo.')
   if(installments.length>overdueLines.length+(nextLine?1:0))lines.push('Se quiser, posso mostrar a lista completa de parcelas em aberto.')
 }
 const pendingLines=pending.slice(0,8).map((p,i)=>(i+1)+'. '+[
   safeLine(p.description??p.descricao),p.status||p.situacao?'Situação: '+safeLine(p.status??p.situacao):null,
   p.due_date||p.prazo?'Prazo: '+dateBR(p.due_date??p.prazo):null
 ].filter(Boolean).join(' | ')).filter(x=>x.length>3)
 if(focus==='pending'){
   if(pendingLines.length)add(pendingLines,'Pendências informadas pela gestão:')
   else lines.push('A origem das pendências ainda não está integrada. Não consigo confirmar por aqui se existe alguma pendência.')
 }else if(focus==='coverages'||focus==='assistance'){
   add(policiesLines,focus==='assistance'?'Seguro consultado:':'Apólices:')
   if(coverageLines.length)add(coverageLines,'Coberturas e franquias cadastradas:')
   else lines.push('Não há detalhes de coberturas disponíveis nesta consulta.')
   if(focus==='assistance')lines.push('A assistência cadastrada não confirma, por si só, direito ao guincho, disponibilidade, distância atendida ou condições de acionamento. Posso encaminhar para confirmação da seguradora ou da equipe de Auto.')
 }else if(focus==='installments'||focus==='installments_full'){
   if(focus==='installments_full'){
     add(installmentLines,'Lista completa de parcelas em aberto disponibilizadas pelo sistema (até 12):')
     if(!installmentLines.length)lines.push('A consulta não retornou parcelas em aberto.')
   }else addCompactInstallments()
 }else{
   add(policiesLines,'Seguros:')
   if(focus==='details')add(coverageLines,'Coberturas cadastradas:')
   if(focus==='details')add(installmentLines,'Parcelas em aberto disponibilizadas pelo sistema (até 12):')
   else addCompactInstallments()
   if(pendingLines.length)add(pendingLines,'Pendências informadas pela gestão:')
   if(policies.length&&!policies.some(p=>brl(p.premio_total)||brl(p.premio_mensal)))lines.push('O valor do prêmio do seguro não foi disponibilizado nesta consulta. Valores de parcelas aparecem separadamente.')
 }
 const output=[]
 const limit=Math.max(280,Math.min(1800,Number(maxChars)||1770))
 for(const line of lines){
  const candidate=[...output,line].join('\n')
  if(candidate.length>limit-95){
    output.push('Há outros detalhes cadastrados. Posso consultar uma informação específica para você.')
    break
  }
  output.push(line)
 }
 return output.join('\n').trim()
}
