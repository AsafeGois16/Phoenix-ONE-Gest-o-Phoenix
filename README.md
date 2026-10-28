# Phoenix ONE V0.2 — Núcleo de inteligência da Phoenix

## Arquitetura (decisão definitiva)

Phoenix ONE é um projeto **independente do CRM LEADS**. O CRM **nunca** será origem de dados ou destino de integração. Apenas a infraestrutura do projeto Supabase `LEADS_PHOENIX INSURANCE` está sendo compartilhada temporariamente, por meio do schema isolado `phoenix_one`.

O **sistema de gestão desenvolvido pelo Junior** será a única fonte de dados operacionais (clientes, apólices, usuários, atendimentos e tickets), quando sua API estiver pronta. O Junior também administra o gateway **4Zapy e o WhatsApp**; o Phoenix ONE não deve se conectar ao 4Zapy.

```text
WhatsApp → 4Zapy → Gestão do Junior (CRM operacional, tickets e usuários)
                             ↕ API autenticada, futura
                       PHOENIX ONE
           Clara + Murilo · RAG · Prompts · Memória
                             ↓
            Supabase compartilhado (schema privado phoenix_one)
```

### Situação real da V0.2

**Provisionado e verificado no Supabase:** schema `phoenix_one` com 11 tabelas e RLS, extensão pgvector, função privada de busca vetorial, bucket `phoenix-one-private` (privado, sem políticas de acesso público), agentes Clara/Murilo e versões iniciais de prompt em rascunho. `anon` e `authenticated` não têm USAGE no schema. Integração com Junior e OpenAI estão com estado `disabled`.

**Interface Vercel ainda demonstrativa:** dados criados, tickets simulados, edições e aprendizados ficam no `localStorage` do navegador. A UI **não faz persistência no Supabase**, nem autentica usuários. Não use dados reais de clientes ou pacientes nesta versão.

**Ainda pendente:** backend autenticado de persistência, upload e processamento de PDF/DOCX, embeddings, RAG com resposta generativa, políticas e papéis de revisor, importação das bases oficiais e integração com o Junior. O esquema do banco sozinho não ativa esses recursos.

### Executar localmente

```bash
npm install
npm run dev
```

### Áreas do projeto

- `src/`: interface da demonstração responsiva.
- `api/health.js`: status explícito da configuração sem expor informações de clientes ou segredos.
- `database/schema.sql`: cópia de referência da estrutura provisória; a migração aplicada e versionada no Supabase é a referência final.
- `services/rag.ts`: abstração de RAG, embeddings, citações e ACL; ainda não executado pela UI.
- `services/learning.ts`: contrato para evento assinado e sugestão de aprendizado supervisionado.
- `services/management-adapter.ts`: interface para o sistema do Junior, com `createTicket` e `transferTicket`; classe desconectada bloqueia ações reais.
- `docs/integracao-junior.md`: contrato futuro, incluindo entrada de mensagens, propostas de ações e eventos de tickets resolvidos.

### Regras não negociáveis

1. Não importar, consultar ou modificar tabelas do CRM LEADS.
2. 4Zapy e a execução de qualquer transferência ficam no sistema do Junior.
3. Prompts e RAG não autorizam operações: toda ação de ticket depende do escopo da API do Junior e do resultado dessa API.
4. Tickets concluídos originam **sugestões pendentes**; revisão humana obrigatória antes de publicar na base.
5. Sem segredo no frontend; ambiente provisório não pode incluir dados reais sem autenticação, RLS adequada e política de LGPD.
6. Ao migrar de projeto Supabase, exportar e restaurar apenas objetos do schema `phoenix_one`, documentos privados e embeddings associados.


## Laboratório IA real (V0.3 — ambiente protegido)

A chave `OPENAI_API_KEY` é usada somente no backend `api/lab-chat.js`. A variável `PHOENIX_ONE_LAB_ACCESS_CODE` protege as sessões de teste (cookie assinado HttpOnly). O endpoint jamais acessa o CRM de leads, o sistema de gestão do Junior, WhatsApp, tickets ou tabelas pessoais. As identidades da Clara e do Murilo nesta versão são **prompts de sandbox** no backend; as edições locais da interface ainda não alteram a API. Não inserir dados pessoais reais. O RAG vetorial e a persistência dos documentos ainda não estão conectados à UI.

A rota `/api/lab-session` faz login e verifica a sessão; `/api/lab-chat` conversa com o modelo pela Responses API. Para produção com acesso externo, acrescentar autenticação de usuários, controles persistentes de limites por conta/IP, observabilidade, políticas de retenção e revisão de segurança.


## Prompts históricos preservados — laboratório v0.3.1

Arquivos imutáveis preservados na pasta `prompts/originais/`: Clara 4.6, complemento operacional Clara 4.5 e Murilo SDR 1.0. O laboratório da OpenAI utiliza as versões **integrais** do mestre Clara 4.6 e Murilo 1.0 via módulo `server/agent-prompts.js` (somente backend), e carrega o complemento Clara 4.5 quando a pergunta envolve transferência/encaminhamento. Um guardrail de sandbox impede uso das referências históricas ao BLACK CRM: somente o **sistema do Junior**, após integração formal, pode fornecer dados operacionais e executar tickets. O CRM LEADS não participa.

Os textos foram também registrados como versões 2 de `phoenix_one.agent_versions` no Supabase, preservando as versões 1 anteriores. **Limitação:** esta versão do laboratório lê a cópia versionada no GitHub (bundled), ainda não consulta o banco ao vivo e a aba de edição de agentes continua demonstrativa. Uma próxima etapa fará edição autenticada/versionamento transacional no banco.

Não afirmar sucesso de operações ou acesso a fontes reais. O RAG vetorial e as bases PDF ainda não foram conectadas a este laboratório. O uso de prompts extensos aumenta o consumo da API OpenAI.


## Administração de integração (V0.4)

Nova aba de Integrações com login pelo Supabase Auth e autorização privativa por `phoenix_one.admin_users`, usando Edge Function `phoenix-one-admin` para salvar URL e escopos autorizáveis. Não usa tabelas CRM LEADS. Para o frontend, variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; **NUNCA** usar credenciais administrativas no navegador.

A API do Junior permanece desconectada até cadastrar a URL HTTPS na aba Integrações e registrar os segredos `JUNIOR_MANAGEMENT_API_CLIENT_SECRET` e `JUNIOR_ALLOWED_API_HOST` no ambiente seguro das Edge Functions Supabase. A ação **Testar conexão** apenas consulta `/health`, e só para um host expressamente aprovado. Criar/transferir tickets e consultar apólices requer homologar as rotas; nenhum desses efeitos é acionado nesta etapa. RAG e editor de prompts persistentes permanecem em desenvolvimento.


## Operação real v0.5

Agentes, biblioteca, memória supervisionada e laboratório agora consultam o schema privado `phoenix_one` pelo Edge Function `phoenix-one-core` autenticado, não mais o localStorage. Arquivos PDF/DOCX são extraídos pela API servidor e submetidos à revisão antes da publicação; textos publicados alimentam busca PostgreSQL FTS para resposta RAG. Modelos com embeddings vetoriais ficam em fase posterior. Tickets do Junior não são replicados ou simulados. O CRM LEADS não é fonte de dados.
