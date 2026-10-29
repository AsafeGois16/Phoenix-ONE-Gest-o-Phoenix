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

export function detectBackofficeRequest(message){
 const t=fold(message)
 if(!t||t.length>4000)return null
 // Consultas gerais, sem pedido de execução, não transferem a conversa.
 if(/\b(?:como funciona|quais documentos|documentacao necessaria|qual o prazo|quanto tempo|tenho uma duvida|gostaria de saber|queria saber|como fazer|pode me explicar)\b/.test(t))return null
 if(!movementSubjects.test(t))return null
 const action=/\b(?:preciso|quero|gostaria|necessito|solicito|solicitar|peco|pode|podem|favor|pedido|ajuda)\b/.test(t)||
  /\b(?:inclusao|exclusao|alteracao cadastral|movimentacao)\b/.test(t)
 if(!action)return null
 const change=/\b(?:excluir|exclusao|retirar|remover|desvincular|dar baixa)\b/.test(t)?'exclusao':
  /\b(?:incluir|inclusao|adicionar|cadastrar|colocar|admissao)\b/.test(t)?'inclusao':
  /\b(?:alterar|alteracao|corrigir|atualizar|mudanca|mudar|ajustar|migrar|transferir)\b/.test(t)?'alteracao':null
 if(!change)return null
 // Não enviar automaticamente cancelamento de seguro Auto/RE ao Backoffice.
 if(/\b(?:seguro auto|automovel|veiculo|carro|residencial|sinistro)\b/.test(t)&&!/\b(?:saude|odonto|beneficiari|dependente|funcionario|colaborador)\b/.test(t))return null
 const tipo={inclusao:'inclusão',exclusao:'exclusão',alteracao:'alteração cadastral'}[change]
 const produto=productFor(t)
 return {
  type:change,
  department:'backoffice',
  reason:'Solicitação de '+tipo,
  summary:'Solicitação de '+tipo+' relativa a '+produto+'. Backoffice deve conferir elegibilidade, documentação, operadora e eventual vínculo Saúde/Odonto. Nenhuma movimentação foi executada pela IA.',
  reply:'Recebi sua solicitação de '+tipo+'. Vou encaminhar o atendimento ao Backoffice da Phoenix Insurance, responsável por analisar a documentação e realizar esse procedimento. A solicitação ainda não foi efetivada.'
 }
}
