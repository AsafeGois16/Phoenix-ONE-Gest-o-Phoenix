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


## Configuração do token pelo painel (atualização 28/10/2026)

Na aba **Integrações** do Phoenix ONE, o administrador informa a URL completa da Edge Function do Junior `https://<ref>.supabase.co/functions/v1/phoenix-one-api/v1` e o segredo **PHOENIX_ONE_API_TOKEN**. A configuração vai ao serviço de autenticação `phoenix-one-admin` e o token é armazenado criptografado no **Supabase Vault** sob nome único (o valor não volta para o navegador). Quando já existe uma chave, deixar o campo vazio mantém a configuração anterior. Para trocar a chave, inserir a nova e salvar.

O botão de teste usa `phoenix-one-admin:probe`, com `conversation_id` de protocolo aberto, e chama somente `GET /contacts/resolve`, sem mostrar dados pessoais. A consulta contextual do agente usa `phoenix-one-bridge:junior_context`, que lê a mesma credencial do Vault e devolve somente apólices/parcelas permitidas da conversa. A URL deve ser HTTPS da função Supabase esperada; não são aceitos endereços arbitrários.

**Importante:** `PHOENIX_ONE_TOKEN` é OUTRA chave — serve para autenticar o sistema Junior ao chamar `/api/v1/conversations/respond`. `PHOENIX_ONE_WEBHOOK_SECRET` assina avisos. Essas duas continuam como segredos no Vercel e devem ser sincronizadas por canal seguro com a instalação do Junior. Nenhuma chave deve ser enviada por chat.


## Contrato v1, atualização de 28/10/2026 — usuário específico

A gestão do Junior pode enviar `ticket.assigned.v1` com `ticket.assigned_to: { type: 'user', id, name }`. O Phoenix ONE encaminha apenas `type` e `id` para a ponte interna, que grava o identificador do responsável em `phoenix_one.external_ticket_refs.assigned_to_user_id` e altera o estado para `assigned`. O nome da pessoa não é copiado para a base da IA. O agente deixa de ser responsável pela conversa conforme regras da gestão do Junior. O contrato de `/respond` ainda oferece `handoff.department`; esta implementação **não atribui um ticket diretamente a usuários**: falta pactuar a proposta de atribuição pessoa a pessoa, que só a gestão do Junior executará. A gestão também passa a oferecer `GET /users` e aceita `POST /tickets/{protocolo}/transfer` com `user_id`, mas nenhuma dessas chamadas é executada automaticamente nesta revisão.

Mensagens de entrada são exclusivamente do tipo `text` (até 20 itens de 4000 caracteres), com arquivos/áudios descritos como texto. O endpoint existente aceita `text` e preserva o formato de resposta e o prazo máximo de 20 segundos. A lista de parcelas pode omitir `parcela`; o leitor da API trata esse campo como opcional.

## Correção de persistência do Vault — 28/10/2026

Uma falha real de 500 em `phoenix-one-admin` foi causada por `SELECT ... FOR UPDATE` sobre `vault.secrets`: o usuário de conexão tem SELECT, mas não UPDATE sobre essa tabela protegida, e o PostgreSQL rejeita esse bloqueio. Solução: serialização por `pg_advisory_xact_lock(hashtext(credentialName))` e leitura de `vault.secrets` sem `FOR UPDATE`. A gravação e rotação utilizam apenas as funções `vault.create_secret` e `vault.update_secret`; nenhuma permissão adicional foi concedida à tabela do Vault. Um teste de criação e rotação usando chave fictícia foi validado em transação revertida com `ROLLBACK`. O fluxo administrativo com a credencial real do usuário precisa ser testado após a atualização.


## Correção adicional do salvamento de permissões — 28/10/2026

Após corrigir o bloqueio do Vault, os logs de produção registraram novos HTTP 500 (Edge Function v3) com erro PostgreSQL 22023: `cannot extract elements from a scalar`. Origem: `granted_scopes=ARRAY(SELECT jsonb_array_elements_text($2::jsonb))` ao receber o parâmetro `JSON.stringify(selected)` via `postgres.js` (`tx.unsafe`) e serialização de parâmetros. A função v4 converte as permissões já validadas contra a allowlist com `selected.join(',')` e persiste usando `CASE WHEN $2='' THEN '{}'::text[] ELSE string_to_array($2,',') END`; valores permitidos nunca contêm vírgulas. Foram validados SQL de lista preenchida e vazia com ROLLBACK, sem alterar configuração existente. Não expõe a credencial da API nos logs ou respostas. Ainda é necessário validar um salvamento de chave real por sessão administrativa (não dispomos da senha do usuário).
