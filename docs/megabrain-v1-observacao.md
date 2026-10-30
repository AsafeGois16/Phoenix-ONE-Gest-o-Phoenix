# Phoenix MegaBrain V1 — observação segura

## Escopo
A primeira versão do MegaBrain é um painel independente e **somente leitura**. Exibe metadados de protocolos que o próprio Phoenix ONE já armazena, sem copiar mensagens ou criar memória adicional. Não é um terceiro agente, não executa transferências e não modifica o atendimento atual.

## Componentes novos
- src/MegaBrain.jsx e src/megabrain.css: painel responsivo.
- supabase/functions/phoenix-one-megabrain/index.ts: Edge Function isolada que consulta somente phoenix_one.protocol_agent_state e valida autenticação, além de papel owner/admin.
- Navegação MegaBrain no menu principal, dentro do login existente.

## Informações exibidas
Protocolo, agente, intenção, etapa, apresentações observadas, data do último evento, data de atualização e expiração. Até 60 protocolos não expirados, com filtros locais. Nenhum conteúdo de conversa, CPF, nome ou telefone.

## Segurança e compatibilidade
- Novo endpoint isolado: não alterar phoenix-one-core, phoenix-one-bridge ou API /api/v1/conversations/respond.
- Apenas SELECT. Sem migrations, alterações de schema, triggers, alterações de prompts, tabelas ou integração com Junior.
- Somente administradores autenticados recebem o snapshot; os demais recebem 403.
- Não guardar tokens ou protocolos no navegador.
- API com no-store, origem restrita e erros genéricos.

## Próximos passos, fora do V1
A memória contextual compartilhada entre Clara e Murilo depende de desenho de dados, isolamento por protocolo, minimização, ciclo de vida, detecção de conflitos e rollout gradual. Não está habilitada neste painel.

## Homologação
1. Novo menu acessível somente após login.
2. Listagem e filtro de dados reais sem acessar o CRM LEADS.
3. Acesso de papel não administrador negado.
4. Confirmar que WhatsApp e ambos os agentes continuam sem mudança de comportamento.
5. Suíte automatizada e Vercel READY antes da publicação.
