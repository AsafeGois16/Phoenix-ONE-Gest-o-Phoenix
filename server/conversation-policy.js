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
 if(/\b(quais seguros|que seguros|seguros (?:eu )?tenho|meus? seguros|minhas? apolices|qual apolice|meus? contratos|meus? boletos|minhas? parcelas|meus? pagamentos|seguro que tenho|vencimentos?|faturas?|carteirinha|pendencias?|valores? das? parcelas?|detalhes completos|meus? valores?)\b/.test(latest))return true
 if(accountHistory && (/^\s*(?:[\d./\-\s]{8,25})\s*$/.test(latest)||/\b(?:cpf|cnpj|nasci em|nascimento|cep)\b/.test(latest)))return true
 if(accountHistory && /^(?:sim|claro|isso|pode|detalhes|todos|todas|mais detalhes|quero saber mais)\b/.test(latest))return true
 return false
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
 return /\b(?:seguros? (?:eu )?tenho|meus? seguros|apolices?|detalhes? completos?|detalhes? (?:da|das|dos)|parcelas?|vencimentos?|valor(?:es)?|seguradora|cobertura|pendencia|pagamento|quais seguros)\b/.test(t)
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
export function formatVerifiedPortfolio(data){
 const policies=Array.isArray(data?.policies)?data.policies:[]
 const installments=Array.isArray(data?.installments)?data.installments:[]
 const pending=Array.isArray(data?.pending)?data.pending:[]
 if(!policies.length&&!installments.length&&!pending.length)return null
 const clean=x=>String(x??'').replace(/[\r\n]+/g,' ').trim().slice(0,200)
 const money=x=>typeof x==='number'&&Number.isFinite(x)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(x):null
 const pl=policies.map((p,i)=>{
  const f=[clean(p.ramo||p.linha||'Seguro'),p.seguradora?'Seguradora: '+clean(p.seguradora):null,p.numero?'Apólice: '+clean(p.numero):null,p.fim_vigencia?'Vigência até: '+clean(p.fim_vigencia):null,p.premio_total!=null?'Prêmio total: '+money(p.premio_total):null,p.premio_mensal!=null?'Prêmio mensal: '+money(p.premio_mensal):null,p.capital_segurado!=null?'Capital segurado: '+money(p.capital_segurado):null,p.status?'Situação: '+clean(p.status):null,Array.isArray(p.coberturas)&&p.coberturas.length?'Coberturas informadas: '+p.coberturas.slice(0,6).map(clean).join(', '):null].filter(Boolean)
  return String(i+1)+'. '+f.join(' | ')
 })
 const il=installments.slice(0,12).map((p,i)=>String(i+1)+'. '+[p.apolice?'Apólice: '+clean(p.apolice):null,p.ramo?clean(p.ramo):null,p.vencimento?'Vencimento: '+clean(p.vencimento):null,p.valor!=null?'Parcela: '+money(p.valor):null,p.vencida===true?'Vencida':p.vencida===false?'Não vencida':null].filter(Boolean).join(' | '))
 const pend=pending.slice(0,8).map((p,i)=>String(i+1)+'. '+[clean(p.description),p.status?'Situação: '+clean(p.status):null,p.due_date?'Prazo: '+clean(p.due_date):null].filter(Boolean).join(' | '))
 return ['Conferi as informações autorizadas em seu cadastro:',...(pl.length?['','Seguros:',...pl]:[]),...(il.length?['','Parcelas em aberto (até 12 retornadas pelo sistema):',...il]:[]),...(pend.length?['','Pendências identificadas:',...pend]:[]),...(pl.length&&!policies.some(p=>p.premio_total!=null||p.premio_mensal!=null)?['','O valor do prêmio do seguro não foi disponibilizado nesta consulta. Valores de parcelas aparecem separadamente.']:[])].join('\n').trim()
}
