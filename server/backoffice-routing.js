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
 * Coleta mínima antes da transferência: qual seguro e se a operação envolve
 * titular ou dependente. Usa somente mensagens recebidas no mesmo protocolo.
 * Não coleta documentos ou nomes de terceiros, nem consulta dados particulares.
 */
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
 // Não transferir se a pessoa ainda está perguntando sobre a documentação.
 if(/\b(?:quais documentos|documentos necessarios|documentacao|o que precisa apresentar)\b/.test(last)){
   return {...base,stage:'ask_confirmation',humanHandoff:false,
     reply:'Os documentos específicos dependem da operadora e do vínculo. O Backoffice poderá confirmar a relação aplicável ao seu caso. Deseja que eu encaminhe sua solicitação?'}
 }
 const details=displayKind[kind]+' de '+relation+' em '+product
 return {...base,stage:'handoff',humanHandoff:true,
  summary:'Cliente solicita '+details+'. Backoffice deve conferir elegibilidade, documentos, operadora e eventual vínculo entre Saúde e Odonto. Nenhuma movimentação foi executada pela IA.',
  reply:'Obrigada pelas informações! Vou encaminhar seu pedido de '+displayKind[kind]+' ('+relation+', '+product+') ao Backoffice da Phoenix Insurance, responsável pela conferência documental e execução. A solicitação ainda não foi efetivada.'}
}
/** Compatibilidade com integrações que enviam só a mensagem inicial. */
export function detectBackofficeRequest(message){
 return assessBackofficeIntake([{direction:'inbound',author:'contact',text:message}])
}
