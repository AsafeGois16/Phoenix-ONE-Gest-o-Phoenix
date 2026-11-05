# Phoenix ONE ↔ Junior — falha de atribuição ao Backoffice

**Data:** 05/11/2026  
**Incidente:** protocolo de homologação `20261105-0006`  
**Prioridade:** alta (transferência humana não concluída)  
**Escopo:** encaminhamento de movimentação de Saúde, sem executar exclusão ou movimentação.

## Evidências observadas

- Cliente solicitou exclusão de dependente em Saúde e concluiu a etapa de verificação de identidade pelo sistema de gestão.
- A Clara informou não ter localizado plano de Saúde para seleção na consulta autorizada e perguntou se poderia encaminhar ao **Backoffice**.
- Cliente respondeu **“Sim”**.
- A interface informou: **“Clara pediu atendimento humano: Cliente confirmou encaminhamento humano”**, mas também exibia **“Sem fila”**, **“Na fila”**, **“Clara atendendo”**, além de **“Sugestão de Clara”** e botão de triagem **“Transferir para Benefícios”**.
- Consulta ao Supabase `phoenix_one.protocol_agent_state`: o protocolo ainda tinha `stage='with_agent'` e `last_agent='clara'` em 05/11/2026 às 18:04 UTC. Nenhum evento `ticket.assigned.v1` foi encontrado na janela examinada da tabela `phoenix_one.integration_events`.
- Logs detalhados do Vercel não puderam ser recuperados nesta auditoria (timeout do provedor). Portanto, **não está comprovado** o payload exato efetivamente devolvido neste turno.

**Importante:** não incluir CPF, data de nascimento ou identificadores pessoais em anexos ou logs. A validação foi mostrada no painel, mas não autentica para outros fins fora do protocolo.

## Contrato esperado do Phoenix ONE

`POST /api/v1/conversations/respond` retorna uma **proposta**, não transfere tickets no banco do Junior. O código `server/consent-routing.js` trata `Sim` após oferta de Backoffice como confirmação e constrói, em regra:

```json
{
  "agent": "clara",
  "reply": "Perfeito, obrigado pela confirmação. Vou solicitar seu encaminhamento à equipe responsável.",
  "humanHandoff": true,
  "handoff": {
    "department": "backoffice",
    "reason": "Cliente confirmou encaminhamento humano",
    "summary": "Solicitação de atendimento humano confirmada pelo cliente. Conferir detalhes do protocolo no sistema de gestão."
  }
}
```

O `handoff.department` deve prevalecer sobre a triagem genérica `beneficios` para movimentação/exclusão, sem confundir **suporte assistencial** com **Backoffice de movimentações**. Nunca usar o resultado da triagem genérica para sobrepor um `handoff.department='backoffice'` já aprovado.

## Correções necessárias no sistema Junior

1. **Verificar o modo da conversa:** `Sugestão de Clara` indica possível modo `sugestao`. Confirmar se o ticket está em modo `automatico` ou `sugestao`. O modo `sugestao` não deve executar transferências sem aprovação humana, mas deve permitir a ação manual de encaminhar à fila.
2. **Ao receber `humanHandoff=true` no modo automático:** resolver `handoff.department` para o ID real da fila **Backoffice** no Junior; confirmar que ela existe e está habilitada. Não usar `Benefícios` por heurística ou categoria da triagem quando o retorno contém `backoffice`.
3. **Executar a operação na gestão (atômica e idempotente):** atribuir ticket à fila Backoffice, marcar intervenção humana e pausar a Clara. Somente após confirmação de sucesso enviar ao cliente texto compatível com transferência concluída. Em falha, deixar como pendente e oferecer rota de revisão humana, sem alegar sucesso.
4. **Registrar auditoria sem PII:** `conversation_id`, `protocolo`, departamento solicitado, departamento atribuído, estado antes/depois, sucesso/erro e referência de idempotência. Evitar CPF, nascimento, telefone e conteúdo das mensagens.
5. **Emitir evento de controle** `ticket.assigned.v1` autenticado ao Phoenix ONE após atribuição confirmada, para atualizar `phoenix_one.protocol_agent_state` para `assigned`.
6. **Modo sugestão:** não confundir cartão de sugestão com execução de transferência; adicionar ação explícita de aprovação e encaminhamento ao Backoffice, e confirmação visível da fila atribuída.

## Critérios de aceite

- Após confirmação do cliente em modo automático: **fila = Backoffice**, estado de ticket efetivamente atribuído, Clara pausada, evento `ticket.assigned.v1` processado.
- Em modo sugestão: proposta **não** altera fila até aprovação humana; após aprovação, executar os mesmos passos e mostrar resultado real.
- Em ambos os modos: triagem genérica **Benefícios** não deve substituir Backoffice em exclusão/inclusão ou movimentação.
- Se a verificação não localizar apólice elegível, o Backoffice recebe apenas orientação de conferência de vínculo/contrato — **nada é excluído automaticamente**.
- Falha da API/transferência não produz declaração falsa de êxito.

## Estado desta revisão

**Diagnóstico confirmado por print e estado do protocolo. Atribuição e ajuste no sistema Junior pendentes.**
Não foram alterados prompts Clara V12/Murilo V9, bases RAG, Supabase, contratos de API ou 4Zapy para esta análise.
