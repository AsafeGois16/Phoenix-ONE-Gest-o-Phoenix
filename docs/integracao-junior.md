# Phoenix ONE ↔ Gestão do Junior — Contrato de integração (proposta v0.2)

**Responsabilidades:** Junior é o dono do 4Zapy, WhatsApp, CRM operacional, contatos, clientes, tickets, usuários, atribuições e execução de ações. Phoenix ONE é **somente o núcleo de IA** (Clara, Murilo, RAG, prompts e aprendizado supervisionado). Não há integração com o CRM de leads. O projeto Supabase LEADS é apenas uma infraestrutura temporariamente compartilhada, com `phoenix_one` isolado.

## 1. Tráfego de conversas

O Junior recebe a mensagem do 4Zapy e, após identificar o contato e validar autorizações, chama a API do Phoenix ONE. Envia IDs externos estáveis, `conversation_id`, contexto mínimo e mensagens necessárias; nunca envia senhas nem despeja todo o banco de dados. Phoenix ONE retorna uma **resposta proposta** e, opcionalmente, uma **intenção de ação**. O sistema do Junior valida escopos e decide enviar a mensagem e executar/recusar a ação.

Exemplo ilustrativo de retorno do Phoenix ONE (não implementado):

```json
{
  "agent": "clara",
  "reply": "Vou encaminhar sua solicitação para o atendimento responsável.",
  "citations": ["knowledge:procedimentos-2026#3"],
  "humanHandoff": true,
  "proposedAction": {
    "type": "ticket.transfer",
    "arguments": {
      "ticketId": "TICKET-EXEMPLO",
      "destination": { "type": "department", "id": "backoffice_saude" },
      "reason": "Movimentação de beneficiário",
      "summary": "Resumo sem informações desnecessárias",
      "requestId": "idempotency-key-exemplo"
    }
  }
}
```

## 2. Rotas que o Junior poderá oferecer ao Phoenix ONE

| Método | Rota ilustrativa | Escopo |
| --- | --- | --- |
| GET | `/v1/contacts/resolve?phone_e164=...` | `contacts:resolve` |
| GET | `/v1/clients/{id}` | `clients:read` |
| GET | `/v1/policies?client_id=...` | `policies:read` |
| GET | `/v1/tickets/{id}` | `tickets:read` |
| POST | `/v1/tickets` | `tickets:create` |
| POST | `/v1/tickets/{id}/transfer` | `tickets:transfer` |
| POST | `/v1/tickets/{id}/comments` | `tickets:comment` |
| GET | `/v1/users/{id}/capabilities` | `users:capabilities` |

O Junior deve devolver o status verdadeiro de cada operação. **A decisão de IA não é prova de transferência executada.** Transferência para usuário, departamento ou agente deve passar por regras de autorização e disponibilidade, com auditoria.

## 3. Eventos que o Junior enviará ao Phoenix ONE

- `ticket.resolved.v1`: conclusão humana; pode originar candidato de memória (sempre em revisão).
- `ticket.assigned.v1`: humano assumiu; pausar resposta automática do agente quando aplicável.
- `ticket.returned_to_agent.v1`: retorno para Clara/Murilo com contexto autorizado.
- `ticket.updated.v1`: atualização de status e escopo de atendimento.

Modelo ilustrativo de evento de resolução:

```json
{
  "event_id": "EVT-EXEMPLO",
  "event_type": "ticket.resolved.v1",
  "occurred_at": "2026-10-28T14:00:00Z",
  "ticket": {
    "id": "TICKET-EXEMPLO",
    "category": "movimentacao_saude",
    "department": "backoffice_saude",
    "resolution_summary": "Orientação operacional generalizável, sem dados pessoais",
    "status": "resolved"
  }
}
```

## 4. Segurança e contrato técnico

- Autenticação máquina a máquina (OAuth 2.0 client credentials ou equivalente) e escopos mínimos; chaves apenas no servidor.
- Webhooks assinados, proteção contra replay, IDs de evento para idempotência, fila para retry e backoff.
- Resolução de contato feita pelo Junior; respeitar empresa, departamento e finalidade antes de entregar contexto.
- Minimização e redação de dados pessoais; nunca armazenar diagnósticos ou informações clínicas na base compartilhada de conhecimento.
- Learning fica pendente, revisado por humano; decisão, revisor, documentos originadores e versão auditados.
- Campos e códigos definitivos serão pactuados com o Junior quando o sistema de gestão tiver OpenAPI/Swagger.

**Status na V0.2:** contratos desenhados. Gestão, 4Zapy e execução real de tickets **não estão conectados**.
