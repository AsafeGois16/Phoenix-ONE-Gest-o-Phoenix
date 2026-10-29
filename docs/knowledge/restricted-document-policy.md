# Knowledge Hub — documentos técnicos restritos

O manual integral do sistema do Junior deve ser cadastrado como **restricted**, sem vínculos de agentes, e permanece em revisão até ato explícito de um administrador. A documentação pode ser lida no painel apenas por `owner/admin` (validação no servidor). O bootstrap não revela metadados de restricted a outros papéis e o RAG só indexa para resposta documentos published + internal/public vinculados ao agente.

A base de integração comercial deve ser cadastrada em `internal`, vinculada **somente ao Murilo**, em `review`. A publicação fica a cargo de uma conta `documents:review`; não afirmar que já foi publicada nem que a API de criação de oportunidades existe. Preservar as bases comerciais existentes e os prompts mestres.
