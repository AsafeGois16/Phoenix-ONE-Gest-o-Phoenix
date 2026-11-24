# Auditoria geral de integridade — Phoenix ONE
**Data:** 24/11/2026 · **Situação:** revisão técnica e correções isoladas em PR de laboratório; **não publicar sem homologação Junior/Phoenix**.

## Escopo efetivamente inspecionado

- Inventário do `main`: **232 entradas de arquivos**, incluindo **37 módulos `server`**, **12 rotas `api`**, **26 itens `src`** e **58 testes**. Foi feita varredura estática dos módulos de servidor e APIs, leitura dirigida de rotas e fluxos críticos, e leitura de interfaces centrais. A auditoria não corresponde a prova formal de ausência de defeitos em cada linha.
- Prompt mestre ativo no Supabase (`phoenix_one.agent_versions`), inventário de políticas e versões; prompts históricos `server/agent-prompts.js` e `prompts/originais/`.
- RAG real: documentos publicados, revisão, públicos por agente, trechos, embeddings, índices FTS e SQL de recuperação do `phoenix-one-core` e `phoenix-one-bridge`.
- Integração Junior: `/api/v1/conversations/respond`, `/api/v1/events`, `orchestration-pilot`, `orchestration-operational`, `phoenix-one-bridge`, `phoenix-one-admin`, `junior-v1` e regra de consentimento.
- Knowledge Hub, importação de fontes e transcrição: rotas autenticadas, buckets temporários, processo de revisão e opções legadas/novas.
- Supabase ao vivo: versão/fonte de funções Edge, buckets/roles e advisors de segurança/performance. Vercel: variáveis por **nome e alvo, nunca valores secretos**, implantação e logs recentes.

**Limite de visibilidade:** não foi auditado o código interno do Gestão Phoenix do Junior, nem realizados testes reais de conversas/WhatsApp ou de pagamento da OpenAI; exigem a homologação combinada.

## Resultados verificados em 24/11

| Área | Resultado | Interpretação |
|---|---|---|
| Agentes | Clara V12, Murilo V9 e Grazy Copy V4; cada um com exatamente 1 versão ativa | Versões consistentes |
| RAG | 38 documentos: 31 publicados, 7 arquivados; 270 chunks | Coleção existente e habilitada |
| Embeddings | 270 chunks sem embedding; `phoenix-one-core` e `bridge` usam PostgreSQL Full-Text Search com GIN | **Não é defeito:** projeto opera por recuperação textual, não semântica |
| Revisão RAG | 7 documentos publicados sem `reviewed_at`, todos de uma migração em 05/11 | Pendência de rastreabilidade; **não despublicar automaticamente** |
| Audiência | 1 documento técnico publicado sem agente associado | Não é recuperável pelos agentes e pode ser intencional |
| Orquestração | modo global `clara_only`, revisão 6 no instante da consulta | Configuração de produção, não alterada |
| Vercel | `PHX_ORCHESTRATION_PILOT_ENABLED` não aparece nas variáveis listadas; código ativa por padrão salvo se explicitamente `false` | Importante documentar reversão explícita |
| Edge Function live | `phoenix-one-core`, `phoenix-one-admin`, `phoenix-one-megabrain-context` coincidiam com `main`; `phoenix-one-bridge` **não** | Bloqueio de atualização inadvertida do Bridge |
| Divergência Bridge | Diferenças em rotas de verificação V4 ainda sem ativação, ~400 linhas no `main` contra ~250 implantadas | Requer cotejo de contrato e deploy separado; não enviar arquivo `main` sem aprovação |
| Arquivos temporários | 2 objetos recentes, cerca de 18,83 MB em `phoenix-hub-transcription-temp` | Acompanhar limpeza; nada foi excluído |
| Storage | Buckets de transcrição privados com políticas de usuário | Controle de acesso existente |
| Advisories | Vários lints de Supabase de nível INFO/WARN em infraestrutura compartilhada, sem achado especificamente identificado para schema Phoenix na amostra de WARN | Não aplicar revogações ou RLS massivos sem impacto individualizado |

## Achados priorizados e ações

### P0/P1 — Prioridade alta

**A01 — Edição de prompt destrói flags de política (corrigido na branch).** O `save_agent` da função `phoenix-one-core` substituía o JSONB `policy` por apenas três metadados (`source`, `management`, `review`), descartando restrições e flags anteriores. Correção: preservar o objeto ativo, atualizar apenas metadados editoriais, preservar `tone` se ausente e serializar versões via advisory lock de transação. Teste automatizado inserido. **Ainda não aplicado na Edge Function de produção.**

**A02 — Interface confundia laboratório e produção (corrigido na branch).** A tela de edição dizia que salvar criava versão para laboratório, mas os endpoints produtivos leem imediatamente `agent_versions.active`. Correção: texto de aviso e confirmação explícita antes de salvar. A versão ativa não foi alterada.

**A03 — Divergência de roteamento após Somente Clara (em correção na PR #78).** `clara_only` usa fluxo determinístico próprio, com mapeamento de produtos/filas anterior ao aceite v1.1, e pode gerar destinos diferentes do Gestão Phoenix. PR #78 acrescenta `handoff.product`, `handoff.intent`, destinos e 21 códigos (20 específicos + `outro`). Não ativar até Junior implementar tradução, precedência e teste do aceite.

**A04 — Ausência de plano de fallback operacional para Bridge (não modificar automaticamente).** `resolvePilotMode` chama o Bridge antes de responder. Falha resulta em `503`; o comportamento é *fail-closed*, porque não se pode ignorar o estado de transferência humana. Evitar fallback inseguro que reacione agente quando ticket já foi assumido. Em incidente, utilizar modo antigo/desligamento coordenado com Junior; obter logs anônimos de erro antes de qualquer mudança.

**A05 — Divergência GitHub × Supabase do Bridge (bloqueio de publicação).** O Bridge implantado (v16) não é idêntico ao `supabase/functions/phoenix-one-bridge/index.ts` no GitHub. A maior diferença contém V4; embora V4 dependa de flag, publicar o `main` cegamente poderia liberar código sem homologação. Exigir análise de diferença, testes V1.2/V4 e aprovação antes de atualizar o Bridge.

### P2 — Integridade e observabilidade

**A06 — `/api/health` exibia estado estático como se fosse monitoramento real (corrigido na branch).** Agora só confirma vivacidade do próprio processo, com dependências explicitamente marcadas como `not_checked`; não inventa versões dos agentes, número de tabelas nem sucesso da gestão Junior.

**A07 — RAG de migração sem trilha de revisão (sinalizado na interface na branch).** Sete documentos de 05/11 não possuem `reviewed_at` apesar do estado `published`. A tela agora informa a ausência, sem bloquear recuperação de conhecimento nem falsificar data de revisão. Exige conferência humana e revisão documentada.

**A08 — Conhecimento sem embeddings (não alterar).** O sistema é text-only FTS com indexação GIN e ACL correta; criar vetores agora aumentaria custo/complexidade sem resolver o roteamento dos tickets. Esta é uma escolha de arquitetura, não um incidente.

**A09 — Transcrição possui rotas antigas e novas (monitorar).** `/api/phoenix-transcribe` mantém o legado de 4 MB, enquanto o Hub usa `/api/phoenix-transcribe-hub` de 24 MB e um fluxo experimental em navegador. Não remover a rota antiga sem verificar consumidores. A fila de 500 MB ainda não tem worker contínuo e não deve ser confundida com recurso homologado.

**A10 — Fontes de verdade dos prompts (documentar).** `prompts/originais/` e `server/agent-prompts.js` são referências históricas. Os prompts operacionais são as versões ativas do Supabase; a API passa por instruções críticas de segurança. Não atualizar um arquivo histórico esperando alteração do agente ao vivo.

## Plano de homologação obrigatório

1. Validar em preview a alteração do prompt/editor e os testes unitários de política e interface.
2. Com Junior, executar PR #78 no laboratório (21 produtos, intent operacional não criar lead, aceite antes de lead, assistência e urgências).
3. Executar os **14 cenários v1.1**, sem dados reais, com evidência de protocolo, resposta/intent/produto/fila/lead/estado do agente. Junior precisa aplicar seu próprio patch antes disso.
4. Conferir os 7 RAGs de migração: conteúdo, agente vinculado, relevância vigente e registro formal de aprovação. Não publicar revisões automáticas nem sobrescrever documentos.
5. Validar paridade do Bridge implantado com o commit-alvo *antes* de qualquer deploy; rodar conjunto V1.2, verificação documental e recursos V4 com flag desligada.
6. Implantar ajustes coordenadamente com rollback: versão Vercel anterior e sinal de orquestração (`PHX_ORCHESTRATION_PILOT_ENABLED=false`, se necessário e acordado), sem apagar estado do protocolo.
7. Observar logs de respostas, tickets, eventos `ticket.assigned.v1`, lead criado após aceite, erros `503` e duplicações.

## Critérios de conclusão

- Nenhuma nova duplicação/atribuição incorreta de lead nos 14 cenários.
- Clareza: `clara_only` e `clara_murilo` seguem rotas contratadas sem misturar responsabilidades.
- Políticas de prompt preservadas entre edições; nenhuma alteração automática nos prompts reais.
- Recuperação de RAG respeita audiência/publicação/sensibilidade.
- Implantação do Bridge só após verificar divergência de versão.
- **Nenhuma atualização em produção executada durante esta auditoria.**

## PRs vinculadas

- **#78:** implementação em laboratório do contrato Junior de `product` / `intent`, não mesclada em produção.
- **PR da auditoria:** proteção do editor de prompts, preservação de políticas, avisos de origem da RAG e health check honesto. Não mesclar sem revisão do impacto do `phoenix-one-core`.
