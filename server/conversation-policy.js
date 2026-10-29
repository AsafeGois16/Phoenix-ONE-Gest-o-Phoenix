/** Somente regras de conversação; não persiste dados pessoais. */
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const customerTexts=messages=>(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='inbound'&&m.author==='contact').map(m=>String(m.text||''))
export function isCommercialRequest(text){
 return /\b(cot(ar|acao)|orcamento|simul(acao|ar)|proposta comercial|quero contratar|quero comprar|quanto custa (?:um|o) seguro)\b/.test(plain(text))
}
export function shouldLookupPersonalData(messages,agent,accountHistory){
 if(agent==='murilo')return false
 const history=customerTexts(messages),latest=plain(history.at(-1))
 if(!latest||isCommercialRequest(latest))return false
 if(/\b(quais seguros|que seguros|seguros (?:eu )?tenho|meus? seguros|minhas? apolices|qual apolice|meus? contratos|meus? boletos|minhas? parcelas|meus? pagamentos|seguro que tenho|vencimentos?|faturas?|carteirinha|pendencias?|valores? das? parcelas?|detalhes completos|meus? valores?|quais coberturas?|minhas? coberturas?|meus? premios?|minhas? franquias?|meu capital segurado|meu seguro|minha apolice)\b/.test(latest))return true
 if(accountHistory && /\b(coberturas?|franquias?|premios?|capital segurado|vencimentos?|seguradora|pendencias?)\b/.test(latest))return true
 if(accountHistory && (/^\s*(?:[\d./\-\s]{8,25})\s*$/.test(latest)||/\b(?:cpf|cnpj|nasci em|nascimento|cep)\b/.test(latest)))return true
 if(accountHistory && /^(?:sim|claro|isso|pode|detalhes|todos|todas|mais detalhes|quero saber mais|quero (?:ver )?(?:todas?|completo)|mostr[ae] (?:todas?|a lista)|lista completa|relacao completa|me manda todas)\b/.test(latest))return true
 return false
}

/**
 * Clara precisa se identificar mesmo quando a resposta é gerada por uma regra
 * direta do servidor (por exemplo, solicitação inicial de CPF/CNPJ).
 * Nunca adiciona conteúdo quando a IA não responderá e não repete a apresentação
 * caso já exista resposta de agente no mesmo protocolo.
 */
export function ensureClaraIntro(reply,messages){
 const content=String(reply??'').trim()
 if(!content)return content
 const history=Array.isArray(messages)?messages:[]
 const hasAgentResponse=history.some(m=>m?.direction==='outbound'&&m?.author==='agent'&&typeof m.text==='string'&&m.text.trim())
 if(hasAgentResponse)return content
 const normalized=plain(content)
 if(/\b(?:sou a clara|aqui e a clara|me chamo clara|meu nome e clara|clara aqui)\b/.test(normalized))return content
 const introduction='Olá! Sou a Clara, concierge de atendimento da Phoenix Insurance. 💙\n\n'
 return (introduction+content).slice(0,1800)
}

export function firstMuriloAppearance(messages){
 const outbound=(Array.isArray(messages)?messages:[]).filter(m=>m?.direction==='outbound'&&m.author==='agent').map(m=>plain(m.text))
 return !outbound.some(t=>/\b(?:sou o murilo|aqui e o murilo|me chamo murilo|murilo aqui|meu nome e murilo)\b/.test(t))
}
export function ensureMuriloIntro(reply,messages){
 const content=String(reply||'').trim()
 if(!firstMuriloAppearance(messages)||/\b(?:sou o murilo|aqui e o murilo|me chamo murilo|murilo aqui|meu nome e murilo)\b/.test(plain(content)))return content
 return 'Prazer! Sou o Murilo, do time comercial da Phoenix Insurance. Vou te ajudar com essa cotação. '+content
}
export function isReadonlyConsultation(text){
 const t=plain(text)
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
const brl=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n):null
const dateBR=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):safeLine(d)
const fullInstallmentRequest=t=>/\b(?:todas?\s+(?:as\s+)?parcelas|todos?\s+(?:os\s+)?vencimentos|lista\s+completa|relacao\s+completa|lista\s+inteira|detalhes?\s+completos?|tudo\s+completo|mostr[ae]\s+tudo|quero\s+(?:ver\s+)?tud[oa]s?|me\s+envie\s+tudo)\b/.test(t)
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
export function formatVerifiedPortfolio(data,{focus='summary',maxChars=1770}={}){
 const policies=Array.isArray(data?.policies)?data.policies:[]
 const installments=Array.isArray(data?.installments)?data.installments:[]
 const pending=Array.isArray(data?.pending)?data.pending:[]
 if(!policies.length&&!installments.length&&!pending.length)return focus==='pending'?
  'A consulta de pendências ainda não está disponível nesta integração. Para verificar pendências específicas, posso direcionar seu atendimento à equipe responsável.':
  null
 const lines=['Conferi as informações autorizadas do seu cadastro.']
 const add=(items,heading)=>{if(items.length)lines.push('',heading,...items)}
 const policiesLines=policies.map((p,index)=>{
   const fields=[safeLine(p.ramo||p.linha||'Seguro'),p.seguradora?'Seguradora: '+safeLine(p.seguradora):null,p.numero?'Apólice: '+safeLine(p.numero):null,p.fim_vigencia?'Vigência até: '+dateBR(p.fim_vigencia):null,
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
  coverageLines.push('Apólice '+safeLine(p.numero||String(i+1))+':')
  for(const c of shown){
    const item=typeof c==='string'?{nome:c}:c
    if(!item||typeof item!=='object'||!safeLine(item.nome))continue
    coverageLines.push('• '+[safeLine(item.nome),brl(item.capital_segurado)?'Capital: '+brl(item.capital_segurado):null,
     brl(item.franquia)?'Franquia: '+brl(item.franquia):null].filter(Boolean).join(' | '))
  }
  if(covers.length>shown.length)coverageLines.push('Mais '+(covers.length-shown.length)+' cobertura(s) cadastrada(s).')
 }
 const selectedInstallments=selectInstallmentHighlights(installments)
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
 }else if(focus==='coverages'){
   add(policiesLines,'Apólices:')
   if(coverageLines.length)add(coverageLines,'Coberturas e franquias cadastradas:')
   else lines.push('Não há detalhes de coberturas disponíveis nesta consulta.')
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
