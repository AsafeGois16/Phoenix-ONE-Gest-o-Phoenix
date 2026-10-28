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
