/**
 * Phoenix ONE · Clara's authenticated RAG LAB-only output guard.
 *
 * This code is not used by the production Junior/WhatsApp response route.
 * The lab has NO identity/contract lookup, no action tools and no way to send
 * bills or register a transfer. Intervene conservatively on risky text.
 * The original model answer stays in memory on the server only; never log it.
 */
const clean=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const userMessages=messages=>(Array.isArray(messages)?messages:[])
 .filter(x=>x&&x.role==='user'&&typeof x.content==='string').map(x=>x.content)
const sensitive=/\b(?:cpf|cnpj|rg|numero do documento|documento de identidade|nome completo|e-?mail|data de nascimento|cep|comprovante de endereco|documentos pessoais|identificador do colaborador|identificacao do dependente)\b/i
const request=/\b(?:informe|informar|poderia|pode|preciso|necessito|envie|enviar|encaminhe|forneca|fornecer|me passe|me diga|confirme|confirmar|qual e|qual o|qual a|necessario|para seguir|para prosseguir|para acessar)\b/
const negative=/\b(?:nao precisa|nao e necessario|nao informe|nao envie|sem informar|sem pedir|nao solicito|evite enviar|nao compartilhe|nao solicitar|sem solicitar)\b/
const actionClaim=/\b(?:ja (?:registrei|encaminhei|transferi|enviei|consultei|verifiquei|emiti|solicitei)|(?:vou|iremos|vamos) (?:registrar|encaminhar|transferir|enviar|consultar|verificar|emitir|solicitar|abrir|acionar)|(?:solicitacao|exclusao|inclusao|encaminhamento|transferencia) (?:ja foi|foi) (?:registrad[ao]|enviad[ao]|realizad[ao]|efetivad[ao])|(?:foi|esta) (?:registrad[ao]|transferid[ao]))\b/
const offeredUnavailableAction=/\b(?:posso|podemos|consigo|poderia) (?:registrar|encaminhar|transferir|enviar|emitir|abrir)\b/
const negatedUnavailableAction=/\b(?:nao posso|nao podemos|nao consigo|nao tenho como) (?:registrar|encaminhar|transferir|enviar|emitir|abrir)\b/
const accountClaim=/\b(?:posso|consigo|vou|irei|podemos) (?:consultar|verificar|acessar|localizar|conferir|checar)\b.{0,90}\b(?:boleto|parcela|apolice|cadastro|valor|vencimento|status|seguro|contrato|informac(?:ao|oes))\b/
const promisedContact=/\b(?:a equipe|o backoffice|o financeiro|nossos especialistas|um especialista)\b.{0,75}\b(?:entrara em contato|entrarao em contato|vai ligar|vao ligar|retornara|retornarao|dara retorno|darao retorno|vai iniciar o processo|pode iniciar o processo)\b/
const documentSpecific=/\b(?:leve|tenha|mantenha|separe|providencie|apresente)\b.{0,95}\b(?:rg|cpf|cnpj|documentos pessoais|comprovante de endereco|documentacao)\b/
const unverifiedStart=/\b(?:iniciar|comecar|abrir|dar entrada)\b.{0,50}\b(?:processo|pedido|inclusao|movimentacao)\b.{0,65}\b(?:sem documentos|documentos incompletos|faltando documentos)\b/
const timingInvented=/\b(?:com urgencia para este mes|ainda neste mes|ate o fim deste mes|em ate \d+ dias|exclusao imediata)\b/
function sensitiveRequests(text){
 // Match each clause separately to avoid flagging "não envie CPF" warnings.
 // This is a warning heuristic; a blocked model response is replaced entirely.
 const clauses=String(text||'').split(/[\n.!?;]+/)
 return clauses.some(part=>{
  const t=clean(part)
  return sensitive.test(t)&&request.test(t)&&!negative.test(t)
 })
}
function intent(messages){
 const all=clean(userMessages(messages).join(' ')),last=clean(userMessages(messages).at(-1)||'')
 // When the last turn is short ("sim", "orienta os passos"), recover
 // the topic only from the customer's earlier messages.
 if(/\b(?:boleto|segunda via|parcela|pagamento|fatura)\b/.test(all))return 'boleto'
 if(/\b(?:excluir|exclusao|exclua|retirar|remover|cancelar dependente)\b/.test(all))return 'exclusao'
 if(/\b(?:incluir|inclusao|adicionar|inserir dependente)\b/.test(all))return 'inclusao'
 if(/\b(?:transferir|encaminhar|equipe|humano|atendente)\b/.test(last))return 'encaminhamento'
 return 'geral'
}
const SAFE={
 boleto:'A segunda via oficial é emitida pela seguradora, e o Financeiro da Phoenix pode ajudar a encaminhá-la quando estiver disponível. Neste ambiente de teste não tenho acesso aos boletos ou valores e não consigo consultar parcelas nem enviar documentos. Para prosseguir, solicite o atendimento do Financeiro pelo canal oficial e seguro da Phoenix.',
 exclusao:'A exclusão de dependente é uma movimentação tratada pelo Backoffice. A equipe precisa confirmar os requisitos e a data de corte aplicável antes de solicitar a alteração à operadora. Neste ambiente de teste não consigo registrar ou encaminhar pedidos. Para prosseguir, procure o Backoffice pelo canal oficial e seguro da Phoenix.',
 inclusao:'A inclusão de dependente no plano empresarial é acompanhada pelo Backoffice. A equipe deverá verificar as exigências da operadora e indicar os documentos necessários antes de confirmar o andamento. Neste ambiente de teste não consigo registrar ou encaminhar a solicitação. Para prosseguir, procure o Backoffice pelo canal oficial e seguro da Phoenix.',
 encaminhamento:'Posso explicar o procedimento geral e qual equipe é responsável. Neste ambiente de teste não consigo transferir conversas nem registrar solicitações. Para encaminhar o pedido, utilize o canal oficial e seguro de atendimento da Phoenix.',
 geral:'Posso orientar sobre o procedimento, mas neste ambiente de teste não tenho acesso a cadastros particulares nem posso executar consultas, transferências ou solicitações. Se houver necessidade de ação, a equipe da Phoenix poderá conferir o pedido pelo canal oficial e seguro.'
}
export function guardClaraLabAnswer({agent,messages,answer}){
 const original=String(answer||'').trim()
 if(agent!=='clara')return {answer:original,applied:false,reason:null}
 const norm=clean(original)
 const reasons=[]
 if(sensitiveRequests(original))reasons.push('pedido_de_dados')
 if(actionClaim.test(norm))reasons.push('acao_operacional_nao_disponivel')
 if(offeredUnavailableAction.test(norm)&&!negatedUnavailableAction.test(norm))reasons.push('oferta_de_acao_indisponivel')
 if(accountClaim.test(norm))reasons.push('consulta_nao_disponivel')
 if(promisedContact.test(norm))reasons.push('retorno_ou_inicio_nao_confirmado')
 if(documentSpecific.test(norm)||unverifiedStart.test(norm))reasons.push('documentos_ou_inicio_nao_confirmados')
 if(timingInvented.test(norm))reasons.push('prazo_nao_confirmado')
 if(!reasons.length)return {answer:original,applied:false,reason:null}
 return {answer:SAFE[intent(messages)],applied:true,reason:reasons}
}
