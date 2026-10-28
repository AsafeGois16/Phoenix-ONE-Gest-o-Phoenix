# Phoenix ONE — RAG, identidade e memória supervisionada

## Fontes distintas de informação

- **Prompt/identidade**: versão aprovada das instruções, do tom e do escopo de cada agente.
- **Conhecimento versionado**: documentos, procedimentos, manuais, regras válidas, com ACL explícita por agente.
- **Dados transacionais**: dados ao vivo do sistema de gestão, acessíveis via API, não incorporados à base geral.
- **Memória operacional**: resolução humana aprovada e transformada em procedimento geral, com trilha do ticket de origem.
- **Contexto de conversa**: histórico atual do contato, com retenção e políticas de privacidade próprias.

## Pipeline de documentos em produção (a implementar)

1. Upload com limite de tamanho e verificação de tipo, malware e permissões de usuário.
2. Extração de PDF/DOCX/TXT e normalização de texto com metadados (origem, página, seção).
3. Segmentação em trechos recuperáveis, preservando rastreabilidade ao documento original.
4. Embeddings via `text-embedding-3-small` (1536 dimensões, modelo configurável).
5. Armazenamento em tabela privada PostgreSQL + pgvector, indexação vetorial e filtragem de versões publicadas.
6. Recuperação híbrida vetorial + texto, com filtros obrigatórios por agente, tenant e classificação de sensibilidade.
7. Reranking e checagem de validade, geração com citações e resposta segura quando não houver evidência.
8. Avaliação com perguntas de referência e auditoria sem expor PII.

A demonstração web oferece apenas **busca lexical local**, para permitir testar categorização, permissões por agente e edição de conteúdo sem credenciais. Ela NÃO é um RAG vetorial em produção nem chama modelos de IA.

## Tickets e memória

1. Ticket concluído por humano chega via webhook do sistema de gestão.
2. Realizar triagem de conteúdo e remoção de dados pessoais/sensíveis.
3. Sugerir procedimento generalizável e marcar exceções e divergências.
4. Encaminhar ao revisor (Backoffice, Comercial ou Gestão) com referência à origem.
5. Aprovar/rejeitar/editar; seleção de acesso Clara, Murilo ou ambos.
6. Apenas conteúdo aprovado entra na base consultável e no índice vetorial.
7. Versionar e permitir revogação, reindexação e expiração do procedimento.
8. Nunca alterar automaticamente os pesos do modelo ou incluir dados privados no conhecimento compartilhado.

## Autorização e boas práticas

Toda seleção de chunks deverá ser autorizada no servidor. A checagem de limites por cliente, agente e tipo de dado vem ANTES de chamar a IA. A resposta e as ações de ferramenta também devem ser validadas. Dados de saúde merecem proteção adicional e jamais devem ser usados para memória geral ou prospecção.
