# Contrato implementado: Phoenix ONE ↔ Gestão Junior (v1)

**Conforme especificação recebida em 28/10/2026, migration 0249 do Junior.**

## Endereço fornecido ao Junior

Definir `PHOENIX_ONE_URL=https://phoenix-one-ai.vercel.app/api` no sistema do Junior.

- `POST {PHOENIX_ONE_URL}/v1/conversations/respond`
- `POST {PHOENIX_ONE_URL}/v1/events`

**4Zapy e o envio de mensagens permanecem exclusivamente no sistema do Junior.** O Phoenix ONE apenas gera proposta `{agent, reply, humanHandoff, handoff}`. O sistema do Junior acrescenta o protocolo e efetiva a transferência quando `humanHandoff=true`. Nenhuma escrita operacional direta é executada pelo endpoint de resposta.

## Segredos (não versionar valores)

A Vercel contém `PHOENIX_ONE_TOKEN` (Bearer de chamadas recebidas), `PHOENIX_ONE_WEBHOOK_SECRET` (HMAC de eventos) e `PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN` (comunicação entre funções Vercel e o schema privado). Esses segredos devem ser transferidos ao Junior em **canal seguro**, não por mensagens abertas.

No projeto Vercel adicionar, quando disponibilizados pelo Junior:
- `JUNIOR_MANAGEMENT_API_URL=https://<SUPABASE_DO_JUNIOR>/functions/v1/phoenix-one-api/v1`
- `PHOENIX_ONE_API_TOKEN` (segredo **criado pelo Junior** para a API de consulta limitada ao protocolo aberto).
  
### Responder conversas

- Bearer `PHOENIX_ONE_TOKEN`; corpo conforme contrato. Tempo limite interno de 18 s, para respeitar os 20 s externos.
- Envio de contexto resumido e **sem CPF/CNPJ, telefone ou identificadores de cadastro ao modelo**.
- `agent_hint` é respeitado para selecionar Clara/Murilo; fallback por `contact.kind`.
- Busca RAG autorizada por agente somente em documentos `published` e sem sensibilidade `restricted`.
- Se a API do Junior estiver configurada, busca `GET /conversations/{conversation_id}/context` somente em perguntas sobre dados contratuais/financeiros; o Junior valida protocolo aberto. Falha de consulta não vira alegação de acesso.
- Resposta estruturada com `agent`, `reply`, `humanHandoff`, `handoff`. Setores aceitos: `patrimonio`, `beneficios`, `comercial`.
- Sem chave OpenAI ou sem autenticação válida: erro explícito. O sistema do Junior segue para humano.

### Eventos

- Bearer não é usado: validação pelos headers `X-Phoenix-Event-Id`, `X-Phoenix-Timestamp`, `X-Phoenix-Signature`; HMAC-SHA256 de `{timestamp}.{raw_body}` usando `PHOENIX_ONE_WEBHOOK_SECRET`.
- Rejeita timestamp com diferença superior a cinco minutos; exige evento UUID correspondente ao header.
- Registra `ticket.assigned.v1`, `ticket.updated.v1`, `ticket.returned_to_agent.v1` e `ticket.resolved.v1` no Supabase privado, idempotência por UUID.
- Um `ticket.resolved.v1` com resumo cria **candidato de aprendizado aguardando revisão humana**, nunca documento publicado automaticamente; PII óbvia é mascarada, com sinalização de revisão adicional.
- Falha de banco deve gerar erro HTTP para que o Junior realize retries.

### Testes de homologação recomendados

1. Chamada não autorizada a `/respond` → **401**.
2. Corpo inválido → **400**.
3. Chamada válida em modo `sugestao` com mensagem fictícia → **200** (não envia WhatsApp).
4. Evento assinado com timestamp válido → **200**.
5. Reenvio do mesmo evento → **200**, `duplicate: true`, sem segundo aprendizado.
6. Evento adulterado/antigo → **401**.
7. Resolução de ticket de teste aparece na fila de curadoria do Phoenix ONE.
8. Caso de handoff em `beneficios` e depois em `patrimonio`, validado no sistema do Junior (não fazer em produção com clientes reais).

**Limitações:** sem URL e `PHOENIX_ONE_API_TOKEN` do Junior, o contexto de apólices e parcelas não estará disponível. Nenhuma rota operacional é chamada diretamente para transferência ou comentários no v1, pois a própria resposta com `humanHandoff` instrui o sistema do Junior a realizar a transferência. A autenticação do sistema Junior e o teste de ida e volta dependem do provisionamento seguro dos dois lados.
