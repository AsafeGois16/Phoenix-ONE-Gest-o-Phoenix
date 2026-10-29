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


## Roteamento de agentes — revisão após teste WhatsApp 28/10/2026

A Clara Concierge é a **porta de entrada padrão do atendimento** independentemente de número novo, `contact.kind='lead'` ou `agent_hint='murilo'`. O Phoenix ONE escolhe agente pela intenção da mensagem: dúvidas gerais, saudações, segunda via de boleto, apólice, parcelas, sinistros, movimentações e suporte ficam com **Clara**; somente pedidos **comercialmente explícitos** (cotação, orçamento, contratação, simulação, preço de seguro) são tratados por **Murilo**. Pedidos de serviço têm prioridade sobre expressões comerciais ambíguas. A continuidade de um interesse comercial já identificado pode manter o Murilo quando a pessoa responder brevemente ("Sim", "Claro"). Toda seleção é feita apenas com o histórico das mensagens do protocolo recebido; sem acesso a contatos externos ou CRM LEADS.

**Ajuste necessário do lado Junior:** não classificar número novo automaticamente como Murilo nem exibir saudação de Murilo por regra local. Envie preferencialmente `agent_hint='clara'` ao abrir conversa, e permita Murilo somente após identificar necessidade comercial. O Phoenix ONE faz uma correção adicional por intenção caso receba `agent_hint` inconsistente. A resposta inclui `agent` e é o nome que o sistema deve exibir/registrar. Nenhuma troca altera o dono do WhatsApp nem executa transferência de tickets. A implementação atual não possui uma ferramenta autônoma de repasse entre Clara e Murilo; a seleção é por mensagem e contexto.


## Proposta de contrato v1.1 — consulta documental por CPF/CNPJ

Necessário porque telefones WhatsApp podem estar desatualizados ou vinculados a mais de uma pessoa. CPF/CNPJ é apenas chave de busca. Conhecer o número **não autentica** o solicitante.

**Junior implementa:** `POST {SUPABASE_URL}/functions/v1/phoenix-one-api/v1/identity/resolve` com mesmo Bearer de serviço, acesso exclusivo a protocolos abertos, proteção anti-enumeração e verificação adicional (OTP em canal previamente verificado ou validação humana). Não reutilizar a consulta por telefone para dados privados.

Corpo enviado somente entre serviços, nunca à OpenAI: `{"conversation_id":"UUID","protocolo":"AAAAMMDD-NNNN","document_type":"cpf","document":"11_DIGITOS","purpose":"policies_and_installments"}`. Para CNPJ, tipo `cnpj` e 14 dígitos. O Junior valida legitimidade do representante de pessoa jurídica.

Para sucesso, o Junior retorna `{"status":"verified","conversation_id":"UUID","protocolo":"AAAAMMDD-NNNN","document_type":"cpf","document_last4":"XXXX","verification":{"status":"verified","method":"otp"},"policies":[],"installments":[]}`. Métodos permitidos: `otp`, `staff_verified`, `existing_verified_session` (com verificação anterior ligada ao mesmo protocolo, não telefone). Campo `document_last4` deve corresponder ao documento enviado. Sem validação, devolver `status` de `verification_required`, `multiple_matches` ou `not_found` SEM dados privados; preferir mensagens genéricas para não revelar se o CPF existe.

**Phoenix ONE agora faz:** valida CPF/CNPJ no servidor, remove documento de qualquer texto enviado à OpenAI, deixa de consultar apólices/parcelas por `conversation_id` isoladamente, chama `identity/resolve` exclusivamente via Edge Function privada que lê token do Vault. Se API v1.1 não existe ou identidade não verificada, realiza encaminhamento humano sem expor dados. Não grava o CPF/CNPJ em RAG, logs, memórias ou banco do Phoenix ONE.

**Fluxo:** pedido de detalhes -> Clara pede CPF/CNPJ do titular -> cliente fornece número -> Phoenix ONE valida sintaxe e o Junior valida identidade e vínculo ao cadastro -> só a confirmação verificada autoriza consulta -> apólices e parcelas são entregues à Clara. Caso haja mais de um titular/apólice, o Junior aplica controle de acesso à seleção.

**IMPORTANTE:** Este endpoint é uma extensão proposta e ainda **não foi confirmado como implementado** no sistema do Junior. O comportamento atual preserva sigilo e transfere ao humano até a homologação. A execução do 4Zapy e tickets permanece integralmente no Junior.


## Contrato atualizado em 28/10/2026 — prova de identidade conforme API do Junior

O Junior informou que a rota POST /identity/resolve foi implementada com CPF/CNPJ e uma segunda solicitação opcional de proof. Esta seção prevalece sobre trechos anteriores que citavam somente OTP ou repasse humano imediato.

1. Clara solicita CPF ou CNPJ somente para pesquisa de informações privadas; não presume titularidade pelo telefone.
2. A gestão responde status=verification_required, verification.method=birth_date (pessoa física), cep (pessoa jurídica) ou human, além de attempts_left.
3. Nos dois primeiros casos, Clara pede a informação correspondente; o backend do Phoenix ONE só extrai nascimento/CEP após uma pergunta explícita e envia a prova para POST /identity/resolve usando o token criptografado no Vault. Nenhuma informação de prova ou documento entra na OpenAI.
4. O Junior confirma o vínculo e a identidade no protocolo aberto; apenas status=verified com document_last4 correspondente é aceito como autorização para acessar policies e installments. A resposta ao modelo inclui apenas os dados contratuais autorizados.
5. status=verification_failed, too_many_attempts, invalid_document, not_found, protocol_not_open ou confirmação humana obrigatória resulta em encaminhamento, sem revelar dados privados.

Parâmetros de prova enviados apenas entre servidores: proof: {birth_date: '1990-11-25'} para PF ou proof: {cep: '01234567'} para PJ. Dados acima são apenas exemplos.

A API do Junior é responsável pelos limites de 3 documentos por protocolo, 3 tentativas de prova e 20 consultas por hora. O Phoenix ONE não contorna bloqueios e não armazena documentos nem provas.

Risco residual: data de nascimento e CEP podem ser conhecidos por terceiros, portanto são fatores relativamente fracos. Recomenda-se confirmação por segundo canal confiável, ou revisão humana, antes de liberar detalhes financeiros em modo automático.

Validação de homologação: executar o fluxo completo de prova com CPF e CNPJ fictícios/autorizados, bem como bloqueio, 404 e tentativas incorretas; os testes automatizados validam o comportamento do Phoenix ONE, mas não substituem a prova fim a fim com a API real do Junior.


## Otimização de latência — 29/10/2026

No Phoenix ONE, mensagens de identificação (pedido de CPF/CNPJ ou correção de documento) agora respondem diretamente, **sem executar RAG nem OpenAI**. Quando o cliente devolve a prova de identidade pedida pela Clara, o contexto do Knowledge Hub e a consulta documental do Junior são iniciados em paralelo; nunca libera dados antes da verificação pelo Junior. Saudações curtas recuperam apenas o prompt mestre, sem pesquisa desnecessária nos documentos. As respostas geradas pela OpenAI continuam usando o prompt completo publicado e o mesmo JSON de resposta/handoff.

O backend gera logs com marcador `phoenix_response_latency` e somente medições agregadas: `agent`, `path`, `status`, `totalMs`, `knowledgeMs`, `identityMs`, `modelMs`. **Nunca registrar número do protocolo, CPF/CNPJ, nascimento, CEP, telefones, mensagens, documentos ou tokens.** Esses tempos se aplicam apenas à chamada no Phoenix ONE e não incluem o debounce, processamento do 4Zapy ou entrega WhatsApp.

**Ajuste recomendado ao Junior (não aplicado por este repositório):** o contrato V1 atualmente espera até 4 segundos para agregar mensagens. Avaliar em homologação um debounce adaptativo de ~1,5–2 segundos somente se não aumentar respostas duplicadas a sequências de mensagens. O Junior deve registrar durações sem PII: `debounceMs`, `phoenixApiMs`, `whatsappSendMs`, `endToEndMs` por protocolo de teste, sem IDs pessoais no log. Medir p50/p95 com amostra antes/depois; não prometer ganho numérico sem esses dados. Manter timeout total previsto no contrato e fallback humano.
