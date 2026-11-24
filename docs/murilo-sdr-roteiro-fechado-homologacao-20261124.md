# Murilo SDR — roteiro fechado por produto e homologação
Data: 24/11/2026. Fonte primária: documento Perguntas SDR, fornecido pela Phoenix (385 linhas).

## Escopo e decisão
Os 20 produtos (12 Auto/RE e 8 Benefícios) utilizam SOMENTE as perguntas aprovadas no arquivo da Phoenix, organizadas em server/murilo-approved-questions.js. O motor de progressão server/murilo-sdr-flow.js escolhe uma pergunta por resposta, ignora itens repetidos e restringe as ramificações por PF/PJ, novo/renovação, previdência existente/não existente e outra pessoa. Há limite inicial de sete perguntas de qualificação por histórico recebido, com antecipação de encaminhamento ao consultor quando suficiente. Enviar dados incompletos ao especialista é aceitável; não insistir.

O menu de perguntas não substitui prioridade de segurança, identificação e verificação de identidade, atendimento operacional, consentimento humano, nem as regras da gestão do Junior. Em conversas com solicitações operacionais, a Clara assume. No modo Somente Clara, Murilo não é acionado.

## Análise das RAGs e prompts
RAG Murilo 03 (SPIN/BANT), RAG Murilo 05 (qualificação e gestão de leads), RAG Murilo 07 (antirrepetição) e o pacote grande Murilo Prompt e 7 bases possuem exemplos adicionais de perguntas além da lista recebida. Essas perguntas são REFERÊNCIAS HISTÓRICAS e não podem expandir o roteiro fechado. O código servidor decide a próxima pergunta com base no catálogo e evita perguntas inventadas pelo modelo.

Criei no Supabase um novo conhecimento chamado Murilo 09 — Roteiro aprovado de perguntas por produto (24-11-2026), vinculado a Murilo, com oito trechos e estado REVIEW. Não está disponível para recuperação no atendimento real até aprovação. Documentos e prompts ativos antigos não foram sobrescritos.

A instrução crítica atual da API proíbe coleta desnecessária de CPF pessoal, dados clínicos sensíveis e foto de documento no primeiro atendimento. Os campos de doença grave/preexistente, CPF e endereço residencial detalhado presentes na lista da Phoenix permanecem como campos a serem tratados pelo consultor em canal seguro, não exigências do chatbot para prosseguir.

## Fotos e anexos: dependência do Junior
Hoje, a integração da conversa não envia bytes de imagens ao Phoenix ONE. Para que o Murilo confirme o recebimento e avance sem analisar foto/apólice/nota fiscal, o Junior deverá enviar uma mensagem autenticada na mesma conversa contendo:
- direction = inbound, author = contact, type = texto, text = vazio ou legenda opcional;
- media_received = true apenas após recebimento real;
- media_kind = image, photo, document ou pdf.

Não enviar base64, URL privada, OCR ou detalhes do arquivo à IA. O Murilo não faz reconhecimento nem extrai dados; responde brevemente que o anexo foi recebido pelo sistema e segue à próxima pergunta pendente. Sem confirmação técnica, ele NÃO declara recebimento. Isso é um ADITIVO opcional e retrocompatível, que precisa de aceite do Junior.

## Compatibilidade, flag e controle
A implementação está isolada e opt-in com PHX_MURILO_CLOSED_QUESTIONS=true. Sem a flag, o sistema atual permanece igual. Quando ligada, só afeta Murilo no modo Clara + Murilo. O modo Somente Clara e todos os encaminhamentos humanos continuam nas camadas existentes.

A API recebe no máximo 20 mensagens. O motor evita perguntas repetidas quando consegue identificar a pergunta no histórico fornecido; em protocolos muito longos, a garantia de não repetição exigirá que o Junior envie estado persistido das perguntas já feitas. Essa extensão será definida separadamente.

## Testes de aceite
1. Saúde PF: perguntas de vidas, modalidade, idades, cidade, prioridade e hospital, sem duplicações.
2. Saúde PJ: número de vidas e CNPJ já informados não são solicitados novamente.
3. Vida individual e em grupo: somente trilhas aplicáveis, nenhum pedido de histórico médico detalhado no chat.
4. Auto, Frota, Residencial, Fiança, Bike, Empresarial, Cyber e Crédito: distinguir renovação e contratação nova.
5. Previdência: separar plano existente, inexistente ou de terceiros, sem extrapolar sete perguntas.
6. Fotos/documentos: somente afirmar recebimento após metadado do Junior e não fazer OCR ou inferir conteúdo.
7. Emergência, sinistro, boleto, reembolso e movimentação: interromper comercial e seguir Clara.
8. Atendimento humano: pedir aceite, não criar lead antes da autorização e respeitar pausa de IA.
9. As duas estratégias e os 14 testes do contrato Junior continuam obrigatórios.

Publicação condicionada ao aceite conjunto, revisão do material RAG e habilitação controlada da flag, com possibilidade de desativação imediata e sem alterações nos prompts ativos.
