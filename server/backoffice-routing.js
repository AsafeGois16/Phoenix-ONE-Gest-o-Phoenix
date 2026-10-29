/**
 * Fase 2: encaminhamento para a fila do Junior, jamais execução de
 * inclusões, exclusões ou alterações cadastrais pelo Phoenix ONE.
 * A rota direta só é usada quando o cliente pede uma ação operacional,
 * não para dúvidas sobre requisitos, prazos ou carência.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const movementSubjects=/\b(beneficiari[oa]s?|dependentes?|titulares?|funcionari[oa]s?|colaborador(?:es|as)?|empregad[oa]s?|filh[oa]s?|espos[oa]|conjuge|vidas?|plano(?: de saude| odontologico| odonto)?|cadastro|dados cadastrais|matricula)\b/
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
 const history=(Array.isArray(messages)?messages:[])
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
 const base=commonReply(kind)
 if(!product){
   return {...base,stage:'ask_product',humanHandoff:false,
    reply:'Claro! Antes de encaminhar sua solicitação ao Backoffice, preciso confirmar a qual seguro ela se refere: Saúde, Odonto, Vida ou outro?'}
 }
 if(!relation){
   return {...base,stage:'ask_relation',humanHandoff:false,
    reply:'Entendi, a solicitação é referente a '+product+'. É para um titular ou dependente? Assim consigo encaminhar ao Backoffice com as informações corretas.'}
 }
 const reference=routingReference(turns,messages)
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
