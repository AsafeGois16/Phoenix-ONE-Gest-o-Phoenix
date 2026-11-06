/**
 * Fase 2: encaminhamento para a fila do Junior, jamais execução de
 * inclusões, exclusões ou alterações cadastrais pelo Phoenix ONE.
 * A rota direta só é usada quando o cliente pede uma ação operacional,
 * não para dúvidas sobre requisitos, prazos ou carência.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const movementSubjects=/\b(beneficiari[oa]s?|dependentes?|titulares?|funcionari[oa]s?|colaborador(?:es|as)?|empregad[oa]s?|filh[oa]s?|espos[oa]|conjuge|vidas?|plano(?: de saude| odontologico| odonto)?|odontologic[ao]s?|cadastro|dados cadastrais|matricula)\b/
const productFor=t=>/\bodonto|odontologico\b/.test(t)?'Odonto':/\bsaude|medico|medica\b/.test(t)?'Saúde':'plano ou cadastro'

export function detectBackofficeStatusRequest(message){
 const t=fold(message)
 if(!t||t.length>4000)return null
 if(!/\b(?:minha|meu|nosso|nossa|pedido|solicitacao|processo)\b/.test(t))return null
 if(!/\b(?:inclusao|exclusao|movimentacao|alteracao cadastral|incluir|excluir|dependente|beneficiario)\b/.test(t))return null
 if(!/\b(?:andamento|status|situacao|retorno|novidade|concluid[ao]|finalizad[ao]|resolvid[ao]|foi realizad[ao]|ja foi|quando fica pronto)\b/.test(t))return null
 return {
   type:'andamento',
   department:'backoffice',
   reason:'Consulta sobre andamento de movimentação',
   summary:'Cliente solicita posição sobre movimentação interna. A API da Fase 2 não expõe andamento, pendências ou prazos da equipe; Backoffice deve conferir o processo e comunicar somente informações autorizadas.',
   reply:'O andamento das movimentações internas precisa ser confirmado pelo Backoffice. Vou encaminhar seu atendimento à equipe responsável para verificar a situação e orientar você com segurança.'
 }
}


const movementKind=text=>{
 const t=fold(text)
 if(!t||t.length>4000)return null
 // Incluir COBERTURA na cotação é assunto comercial, não movimentação
 // de beneficiário. Vale para todos os ramos (Vida, Saúde, Auto etc.).
 const isQuote=/\b(?:cotacao|cotar|orcamento|simulacao|simular|proposta|contratar|contratacao|novo seguro)\b/.test(t)
 const isQuoteScope=/\b(?:cobertura|assistencia|indenizacao|protecao|seguro|plano)\b/.test(t)
 // Quando o cliente interrompe uma cotação para INCLUIR/EXCLUIR um
 // beneficiário de um plano existente, a movimentação é prioritária.
 // "incluir cobertura/assistência na cotação" continua sendo comercial.
 const beneficiaryChange=/\b(?:excluir|exclusao|retirar|remover|desvincular|incluir|inclusao|adicionar|cadastrar)\b/.test(t)&&
  /\b(?:beneficiari[oa]s?|dependentes?|titulares?|funcionari[oa]s?|colaborador(?:es|as)?|filh[oa]s?|espos[ao]s?|conjuge)\b/.test(t)&&
  /\b(?:plano|saude|odonto|odontologic[ao]|cadastro|apolice)\b/.test(t)
 if(isQuote&&isQuoteScope&&!beneficiaryChange)return null
 if(/\b(?:como funciona|quais documentos|documentacao necessaria|qual o prazo|quanto tempo|tenho uma duvida|gostaria de saber|queria saber|como fazer|pode me explicar)\b/.test(t))return null
 if(!movementSubjects.test(t))return null
 if(/\b(?:seguro auto|automovel|veiculo|carro|residencial|sinistro)\b/.test(t)&&!/\b(?:saude|odonto|beneficiari|dependente|funcionario|colaborador)\b/.test(t))return null
 const action=/\b(?:preciso|quero|gostaria|necessito|solicito|solicitar|peco|pode|podem|favor|pedido|ajuda)\b/.test(t)||
   /\b(?:inclusao|exclusao|alteracao cadastral|movimentacao)\b/.test(t)
 if(!action)return null
 return /\b(?:excluir|exclusao|retirar|remover|desvincular|dar baixa)\b/.test(t)?'exclusao':
  /\b(?:incluir|inclusao|adicionar|cadastrar|colocar|admissao)\b/.test(t)?'inclusao':
  /\b(?:alterar|alteracao|corrigir|atualizar|mudanca|mudar|ajustar|migrar|transferir)\b/.test(t)?'alteracao':null
}
/** Movimentação real de beneficiário, não simples inclusão de cobertura na cotação.
 * É usado somente na classificação determinística entre agentes. */
export function isAdministrativeMovementRequest(text){return Boolean(movementKind(text))}
const getProduct=text=>{
 const t=fold(text)
 const health=/\b(?:saude|medico|medica)\b/.test(t)
 const dental=/\b(?:odonto|odontologico|odontologica)\b/.test(t)
 if(health&&dental)return 'Saúde e Odonto'
 if(health)return 'Saúde'
 if(dental)return 'Odonto'
 if(/\b(?:vida|seguro de vida)\b/.test(t))return 'Vida'
 return null
}
const getRelation=text=>{
 const t=fold(text)
 if(/\b(?:dependentes?|filh[oa]s?|espos[oa]s?|conjuges?|companheir[oa]s?|marido)\b/.test(t))return 'dependente'
 if(/\b(?:titular(?:es)?)\b/.test(t))return 'titular'
 return null
}
const displayKind={inclusao:'inclusão',exclusao:'exclusão',alteracao:'alteração cadastral'}
const commonReply=kind=>({
 type:kind,department:'backoffice',
 reason:'Solicitação de '+displayKind[kind]
})
const newTopic=/\b(?:cotar|cotacao|orcamento|quais seguros|meus seguros|segunda via|parcela|boleto|sinistro)\b/

/**
 * A pergunta "posso pedir outra coisa?" inicia um NOVO assunto, mesmo quando
 * o histórico do Junior ainda contém uma movimentação concluída.
 * Só identifica aberturas sem uma nova solicitação específica no mesmo texto.
 */
export function isStandaloneNewRequest(text){
 const value=fold(text).replace(/[?!.]+$/,'').trim()
 const standalone=/^(?:(?:certo|ok|beleza|obrigad[oa]|tudo bem|entendi|perfeito|ta bom|combinado)[, ]+)?(?:pode(?:ria)? me ajudar (?:em|com) (?:(?:mais )?uma|outra|uma outra) coisa|tem como me ajudar (?:em|com) (?:(?:mais )?uma|outra) coisa|tenho (?:(?:mais )?uma|outra) (?:duvida|pergunta|coisa)|posso (?:te )?pedir (?:(?:mais )?uma|outra) coisa|posso (?:te )?fazer (?:(?:mais )?uma|outra) pergunta|posso falar de outro assunto|podemos falar de outro assunto|preciso de ajuda com outra coisa|quero tratar de outro assunto|e sobre outro assunto|mais uma coisa|outra duvida|outra pergunta|outra coisa|pode me ajudar novamente)$/
 if(standalone.test(value))return true
 // Retorno do atendimento humano: uma frase contextual ("O Backoffice já
 // recebeu minha solicitação.") pode anteceder a ABERTURA de novo assunto.
 // Só cortar o histórico se a última oração não trouxer uma questão específica
 // sobre a movimentação anterior. "Já recebeu meu pedido?" não é novo assunto.
 const newSubject=/^(?:(?:e )?agora[, ]+)?(?:tenho (?:uma )?outra (?:duvida|pergunta|coisa)|gostaria de (?:fazer )?outra pergunta|quero (?:tratar|falar) de outro assunto|preciso de ajuda com outra coisa|posso falar de outro assunto)$/
 const clauses=value.split(/[.!?;]+/).map(p=>p.trim()).filter(Boolean)
 if(newSubject.test(value)||clauses.length>1&&newSubject.test(clauses.at(-1)))return true
 // Também aceitar a pontuação natural "O Backoffice já recebeu, agora tenho
 // outra dúvida", sem confundir pedidos de andamento/estado da exclusão.
 const now=value.lastIndexOf(' agora ')
 return now>0&&newSubject.test(value.slice(now+1))&&
   /\b(?:backoffice|atendimento|solicitacao|pedido|equipe|departamento)\b/.test(value.slice(0,now))
}
function movementHandoffCompleted(message){
 if(message?.direction!=='outbound'||message.author!=='agent'||typeof message.text!=='string')return false
 const value=fold(message.text)
 // Só considerar o encaminhamento que o agente AFIRMOU estar realizando,
 // jamais perguntas do tipo "Deseja que eu encaminhe?".
 return /\bbackoffice\b/.test(value)&&
   /\b(?:vou|irei|estou|sera)\s+(?:(?:te|seu atendimento|sua solicitacao|seu pedido)\s+)?(?:direcionar|encaminhar|passar|transferir)\b/.test(value)
}
/**
 * Descarta apenas o contexto operacional da triagem encerrada.
 * O histórico continua integral no Junior e os controles de saudação permanecem
 * por protocolo no Supabase. Não persistimos nem alteramos mensagens.
 */
export function activeMovementHistory(messages){
 const list=Array.isArray(messages)?messages:[]
 let boundary=-1
 for(let i=0;i<list.length;i++){
   if(movementHandoffCompleted(list[i]))boundary=i
   if(list[i]?.direction==='inbound'&&list[i]?.author==='contact'&&
      isStandaloneNewRequest(list[i].text))boundary=i-1
 }
 return list.slice(boundary+1)
}
/**
 * Coleta antes do Backoffice: produto, titular/dependente e referência do
 * plano (operadora OU empresa). Não pede documentos de menores ou terceiros.
 * O nome da empresa fica no histórico do Junior, não no resumo do Phoenix ONE.
 */
function routingReference(turns,messages){
 const corpus=turns.map(m=>fold(m.text)).join(' ')
 const latest=fold(turns.at(-1)?.text)
 if(/\b(?:amil|bradesco|sulamerica|sul america|hapvida|notredame|notre dame|intermedica|porto seguro|porto saude|unimed|prevent senior|med senior|sao cristovao|sao miguel|santa helena|assim saude|care plus|omint)\b/.test(corpus))
   return 'operadora'
 const company=corpus.match(/\b(?:empresa|empregadora)\s+(?:(?:e|eh|se chama|chamada|da|do)\s+)?([a-z][a-z0-9 .'-]{2,65})/)
 if(company&&!/^(?:que|onde|a|o|para|qual|responsavel|tem|possui|vincul|trabalh|contrat|oferece|fornece|do meu plano)\b/.test(company[1].trim()))
   return 'empresa'
 // Apenas interpretar respostas livres quando a última mensagem enviada
 // pela Clara fez exatamente esta pergunta de qualificação.
 const lastAgent=[...(Array.isArray(messages)?messages:[])].reverse()
  .find(m=>m?.direction==='outbound'&&m.author==='agent'&&typeof m.text==='string')
 const askedReference=/\boperadora\b/.test(fold(lastAgent?.text))&&/\bempresa\b/.test(fold(lastAgent?.text))
 if(!askedReference||turns.length<2)return null
 if(/^(?:nao sei|nao lembro|desconheco|nao tenho essa informacao|nao sei informar|prefiro nao informar)[.! ]*$/.test(latest))
   return 'não informada'
 if(latest.length>=3&&latest.length<=110&&/[a-z]{3}/.test(latest)&&
    !/\b(?:cpf|cnpj|rg|data de nascimento|meu filho|minha filha|beneficiario|dependente|titular|incluir|excluir|documentos|documentacao)\b/.test(latest)&&
    !/^(?:sim|nao|ok|certo|obrigado|obrigada|entendi|saude|odonto|vida)\b/.test(latest))
   return 'informada'
 return null
}
export function assessBackofficeIntake(messages){
 const current=activeMovementHistory(messages)
 const history=current
  .filter(m=>m?.direction==='inbound'&&m.author==='contact'&&typeof m.text==='string')
  .slice(-12)
 if(!history.length)return null
 const last=fold(history.at(-1).text)
 if(!last)return null
 // A consulta de andamento é outro fluxo: continua com o Backoffice humano.
 if(detectBackofficeStatusRequest(history.at(-1).text))return null
 let first=-1,kind=null
 for(let i=history.length-1;i>=0;i--){
   const type=movementKind(history[i].text)
   if(type){first=i;kind=type;break}
 }
 if(first<0)return null
 const turns=history.slice(first)
 // Novo assunto explícito encerra a triagem anterior.
 if(first<history.length-1&&newTopic.test(last))return null
 const corpus=turns.map(m=>fold(m.text)).join(' ')
 const product=getProduct(corpus)
 const relation=getRelation(corpus)
 const base={...commonReply(kind),product,relation}
 if(!product){
   return {...base,stage:'ask_product',humanHandoff:false,
    reply:'Claro! Antes de encaminhar sua solicitação ao Backoffice, preciso confirmar a qual seguro ela se refere: Saúde, Odonto, Vida ou outro?'}
 }
 if(!relation){
   return {...base,stage:'ask_relation',humanHandoff:false,
    reply:'Entendi, a solicitação é referente a '+product+'. É para um titular ou dependente? Assim consigo encaminhar ao Backoffice com as informações corretas.'}
 }
 const reference=routingReference(turns,current)
 const documentsQuestion=/\b(?:quais documentos|documentos necessarios|documentacao|o que precisa apresentar)\b/.test(last)
 if(!reference){
   const intro=documentsQuestion?'Os documentos variam conforme a operadora e o vínculo, e serão confirmados pelo Backoffice. ':''
   return {...base,stage:'ask_reference',humanHandoff:false,
    reply:intro+'Entendi! Para direcionar seu pedido de '+displayKind[kind]+' ('+relation+', '+product+'), pode informar a operadora do plano ou a empresa à qual ele está vinculado? Se não souber, tudo bem.'}
 }
 // Dúvidas sobre requisitos são respondidas sem encaminhamento automático.
 if(documentsQuestion){
   return {...base,stage:'ask_confirmation',humanHandoff:false,
     reply:'Os documentos específicos dependem da operadora e do vínculo. O Backoffice poderá confirmar a relação aplicável ao seu caso. Deseja que eu encaminhe sua solicitação?'}
 }
 const details=displayKind[kind]+' de '+relation+' em '+product
 const origin=reference==='não informada'?'A operadora/empresa não foi identificada pelo cliente.':'O cliente informou a referência da operadora/empresa no histórico da conversa.'
 return {...base,stage:'handoff',humanHandoff:true,
  summary:'Cliente solicita '+details+'. '+origin+' Backoffice deve conferir elegibilidade, documentos, operadora e eventual vínculo entre Saúde e Odonto. Nenhuma movimentação foi executada pela IA.',
  reply:'Obrigada pelas informações! Vou encaminhar seu pedido de '+displayKind[kind]+' ('+relation+', '+product+') ao Backoffice da Phoenix Insurance, responsável pela conferência documental e execução. A solicitação ainda não foi efetivada.'}
}
/** Compatibilidade com integrações que enviam só a mensagem inicial. */
export function detectBackofficeRequest(message){
 return assessBackofficeIntake([{direction:'inbound',author:'contact',text:message}])
}
