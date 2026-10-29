# Recuperação de conhecimento em português — validação de 29/10/2026
O laboratório e o bridge operam sobre `phoenix_one.knowledge_chunks` com filtros rigorosos por `document_agents`, status publicado, sensibilidade internal/public e validade.
## Problema
A consulta `websearch_to_tsquery('portuguese', pergunta_longa)` unia os termos e frequentemente retornava **zero trechos**. As três perguntas sobre exclusão, inclusão e acompanhamento não recuperavam o documento "Sistema Junior — Procedimentos de Backoffice", embora publicado e autorizado para Clara.
## Correção
O buscador mantém a busca exata original. Apenas quando não houver fontes faz uma segunda consulta usando OR dos lexemas normalizados por `plainto_tsquery`, com leve prioridade editorial para o documento de Backoffice quando o assunto contém inclusão, exclusão ou movimentação. Todas as restrições por agente, publicação, sensibilidade e validade permanecem iguais. Máximo 6 fontes.
## Verificação
Uma consulta SQL de pré-validação, com as três perguntas completas, confirmou que o fallback recupera a base do Junior entre os primeiros resultados em todos os casos. O laboratório pode ser testado em "Somente recuperar fontes", sem gerar respostas da OpenAI.
## Limites
RAG é informativo, não autorização. O laboratório não tem permissão para criar tickets, consultar movimentações nem enviar mensagens. O modo WhatsApp usa regras de transferência pelo contrato do Junior e mantém validação de documentos/escopos. Embeddings ainda não estão indexados para este documento; a recuperação atual é lexical.
