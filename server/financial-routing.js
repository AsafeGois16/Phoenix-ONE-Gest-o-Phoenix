/**
 * Regras de segunda via de boleto para Clara: nenhuma emissão, envio ou
 * promessa de ação sem API de confirmação. Apenas encaminhamento proposto
 * e executado pelo Junior, quando existir o destino "financeiro" contratado.
 *
 * O histórico é fornecido pelo Junior, do MESMO protocolo, e nenhum CPF,
 * data de nascimento ou boleto é persistido ou enviado ao modelo.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const inbound=m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string'
const outbound=m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string'
const lastOutbound=messages=>(Array.isArray(messages)?messages:[]).slice(0,-1).reverse().find(outbound)?.text||''
const previousMessages=messages=>(Array.isArray(messages)?messages:[]).filter(inbound)
const isYes=t=>/^(?:sim|s|sim pode|sim, pode|claro|pode sim|pode|pode encaminhar|confirmo|autorizo|ok|com certeza|pode ser|por favor)[.! ]*$/.test(fold(t))
const isNo=t=>/^(?:nao|nao, obrigado|nao obrigada|prefiro nao|agora nao)[.! ]*$/.test(fold(t))
const financialOffer=s=>/\b(?:posso|deseja|quer|gostaria|poderia)\b.{0,145}\b(?:encaminhar|transferir|direcionar|passar|solicitar atendimento|colocar em contato)\b.{0,145}\bfinanceir[oa]\b/.test(fold(s))
const deceptiveOffer=s=>/\b(?:posso|deseja|quer|gostaria)\b.{0,160}\b(?:verificar|enviar|emitir|gerar|providenciar|disponibilizar|mandar)\b.{0,130}\b(?:boleto|segunda via|fatura)\b/.test(fold(s))
const billingReissue=s=>{
 const t=fold(s)
 return /\b(?:boleto|boletos|fatura|faturas|parcela|parcelas)\b/.test(t)&&
 /\b(?:segunda via|2a via|2 via|reemissao|reemitir|reenvio|reenviar|emitir|gerar|enviar|envie|mandar|manda|encaminhar)\b/.test(t)
}
const requestFinance=s=>{
 const t=fold(s)
 return /\b(?:quero|preciso|pode|me transfira|transfira|encaminhe|me encaminhe|falar com|atendimento do|atendimento do setor)\b.{0,110}\bfinanceir[oa]\b/.test(t)
}
const financialTopic=messages=>previousMessages(messages).slice(-9).some(m=>billingReissue(m.text))
const sameProtocolDocumentMention=messages=>{
 const list=previousMessages(messages)
 const has=/\b(?:cpf|cnpj)\b/i.test(list.map(m=>m.text).join(' '))||
 list.some(m=>/(?<!\d)(?:\d{3}[.]?\d{3}[.]?\d{3}[-]?\d{2}|\d{11}|\d{14})(?!\d)/.test(m.text))
 return has
}
const summary=(messages)=>{
 const recent=previousMessages(messages).slice(-10).map(m=>fold(m.text)).join(' ')
 const product=/\bodonto|odontolog/.test(recent)?'Odonto':/\bsaude|medic/.test(recent)?'Saúde':'seguro não especificado'
 const prior=sameProtocolDocumentMention(messages)?
  'Há informação documental no histórico do protocolo; validar identidade e vínculo novamente na gestão antes de consultar ou revelar parcelas. ':
  'Verificar identidade e vínculo por canal seguro antes de consultar ou revelar parcelas. '
 return 'Cliente solicita suporte para segunda via de boleto de '+product+'. '+prior+
  'IA não emitiu, enviou ou registrou boleto. Financeiro deve conferir as condições e o canal oficial de emissão.'
}
export function isFinancialAccountQuestion(text){
 const t=fold(text)
 return /\b(?:boleto|boletos|fatura|faturas|parcela|parcelas|pagamento|vencimento)\b/.test(t)
}
/** Valores, vencimentos e status são privados e requerem identity/resolve. */
export function needsVerifiedFinancialLookup(text){
 const t=fold(text)
 if(/\b(?:como funciona|como fazer|como obter|como solicitar)\b/.test(t))return false
 return isFinancialAccountQuestion(t)&&
  /\b(?:qual|quanto|valor|vencimento|vence|data|situacao|status|pendente|vencido|pagou|pago|meu|meus|minha|minhas)\b/.test(t)
}
/**
 * Reaproveitar somente a CHAVE documental digitada neste protocolo e apenas
 * em uma nova consulta à API do Junior. Ter CPF NÃO autentica o titular.
 */
export function shouldReuseProtocolDocument(messages,activeMessages){
 const last=Array.isArray(activeMessages)?activeMessages.at(-1):null
 return inbound(last)&&isFinancialAccountQuestion(last.text)&&
  sameProtocolDocumentMention(messages)
}
export function financeDepartmentEnabled(){
 // O contrato atual do Junior ainda não documentou a fila 'financeiro'.
 // A chave permanece desabilitada até confirmação explícita da compatibilidade.
 return process.env.PHOENIX_ONE_JUNIOR_FINANCEIRO_ENABLED==='true'
}
function financeContactReply(){
 return 'A segunda via deve ser conferida pelo Financeiro da Phoenix junto à operadora. '+
 'Ainda não consigo solicitar transferência automática à fila Financeiro nesta integração. '+
 'Você pode contatar o setor pelo canal oficial relacionamento@phoenixseg.com.br. '+
 'Nenhum boleto foi emitido ou enviado por mim. Caso precise de dados do contrato, a equipe confirmará sua identidade com segurança.'
}
function offerFinancialHandoff(){
 return {
  agent:'clara',
  reply:'A segunda via é disponibilizada pela operadora, e a equipe do Financeiro poderá conferir o procedimento. '+
    'Eu não consigo emitir nem enviar boletos diretamente por aqui. Posso encaminhar sua solicitação ao Financeiro para atendimento humano?',
  humanHandoff:false,handoff:null
 }
}
function handoff(messages){
 return {
  agent:'clara',
  reply:'Entendido. Vou solicitar à gestão o encaminhamento do seu atendimento ao Financeiro para conferência da segunda via. Nenhum boleto foi emitido ou enviado por mim.',
  humanHandoff:true,
  handoff:{department:'financeiro',reason:'Solicitação de segunda via de boleto',summary:summary(messages)}
 }
}
/** Regras determinísticas somente para solicitação de segunda via; não para
 * perguntas informativas de valor, data ou situação de pagamentos. */
export function financialSecondCopyDecision(messages,agent='clara'){
 const list=Array.isArray(messages)?messages:[]
 const last=list.at(-1)
 if(agent!=='clara'||!inbound(last))return null
 const text=last.text
 const prior=lastOutbound(list)
 if(isNo(text)&&financialOffer(prior))return {agent:'clara',reply:'Certo, não farei nenhum encaminhamento. Se precisar, o Financeiro pode orientar pelo canal oficial relacionamento@phoenixseg.com.br.',humanHandoff:false,handoff:null}
 if(isYes(text)&&financialOffer(prior)){
  return financeDepartmentEnabled()?handoff(list):{agent:'clara',reply:financeContactReply(),humanHandoff:false,handoff:null}
 }
 if(isYes(text)&&deceptiveOffer(prior)&&financialTopic(list)){
  return financeDepartmentEnabled()?offerFinancialHandoff():{agent:'clara',reply:financeContactReply(),humanHandoff:false,handoff:null}
 }
 if(requestFinance(text)&&financialTopic(list)){
  return financeDepartmentEnabled()?handoff(list):{agent:'clara',reply:financeContactReply(),humanHandoff:false,handoff:null}
 }
 if(billingReissue(text)){
  return financeDepartmentEnabled()?offerFinancialHandoff():{agent:'clara',reply:financeContactReply(),humanHandoff:false,handoff:null}
 }
 return null
}
