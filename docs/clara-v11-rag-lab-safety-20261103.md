# Clara V11 · Ajuste mínimo + proteção do Laboratório RAG

## Evidência que motivou a revisão (03/11/2026)
Capturas enviadas da Clara V10 mostraram três problemas persistentes:

1. **Saúde empresarial / inclusão:** a Clara identificou o Backoffice, mas solicitou o nome completo da dependente, afirmou que a equipe entraria em contato e indicou documentos ou início do processo sem confirmação da operadora.
2. **Odonto empresarial / exclusão:** pediu nome e CNPJ para registrar e, após resposta genérica “sim”, afirmou que registraria a solicitação com urgência para o mês, sem ferramenta de movimentação nem urgência fundamentada.
3. **Seguro Auto / boleto:** solicitou CPF/CNPJ duas vezes e disse que podia consultar o valor ou segunda via no Laboratório RAG, que não dispõe de consulta operacional à apólice.

Essas avaliações são baseadas no conteúdo das capturas fornecidas. Não confirmam falhas no fluxo real integrado de clientes.

## Clara V11: preservação do prompt mestre
- A nova versão usa **Clara V10 (33878 caracteres)** como base, acrescentando exclusivamente um bloco final com o título **REFORÇO PONTUAL V11 — SEGURANÇA DO LABORATÓRIO E AÇÕES CONFIRMADAS**. Nenhum parágrafo anterior foi removido ou alterado.
- Reforça que inclusões/exclusões pertencem ao Backoffice, que os documentos dependem de requisitos reais da operadora e que o laboratório não solicita CPF/CNPJ, dados de dependentes ou documentos.
- Preserva a capacidade de identificação documental pelo **backend seguro do Junior**, após autenticação e autorizações por protocolo, no fluxo operacional real.
- Boletos continuam sendo emitidos pela seguradora; o Financeiro da Phoenix pode enviar a via oficial quando houver permissão e documento confirmado.
- Sem retorno de ferramenta, Clara não pode declarar que registrou, transferiu, encaminhou, consultou, enviou ou que outra equipe entrará em contato.
- Não presumir urgência, data de corte, elegibilidade ou início de movimentação. Manter uma pergunta principal por resposta quando for necessária.

A comparação SQL confirma: a V10 inteira é prefixo literal da V11, o tom e as demais políticas são mantidos, e todas as fichas, matrizes, identificação e emergências seguem intactas. A V10 permanece no histórico para reversão.

## Proteção suplementar, SOMENTE no Laboratório RAG
- Novo `server/clara-rag-lab-guard.js` inspeciona a resposta final da Clara após a geração da IA em `api/phoenix-answer.js`.
- Intervém de forma conservadora quando o modelo pede dados identificáveis, promete ação indisponível (inclusive “posso encaminhar”), afirma consulta de apólices/boletos, promete contato não confirmado ou inventa início/prazo/documentos.
- A resposta incorreta **não é exibida nem retornada**: é substituída por orientação apropriada para Backoffice, Financeiro ou atendimento geral. Não gera ticket, não envia documentos e não grava respostas.
- O painel **Laboratório RAG conectado** apresenta um aviso na conversa quando o filtro substituiu a resposta. Isso permite saber que uma falha de geração foi contida pelo sistema, em vez de contar a resposta como aprovação espontânea do prompt.
- Respostas já adequadas são preservadas literalmente e o Murilo não passa por esse novo filtro.
- Nenhuma alteração foi feita em `api/v1/conversations/respond.js`, `phoenix-one-bridge`, no sistema do Junior, na API do WhatsApp ou nas flags V4.

## Limites
- Os filtros usam padrões de texto: podem detectar uma resposta inadequada sem capturar todos os problemas possíveis; também podem produzir falso positivo. O aviso visível permite auditoria.
- O laboratório só oferece orientações fictícias. **Não usar dados reais de clientes**, mesmo se a interface estiver autenticada.
- A publicação da V11 não equivale a homologação de identidade, validação real de ferramentas, transferência, inclusão/exclusão ou envio de boleto pelo Junior.

## Testes de aceitação após deploy
No Phoenix ONE → Laboratório RAG conectado, selecione Clara e inicie uma conversa separada por cenário:
1. “Olá, gostaria de incluir minha esposa no plano de saúde da empresa. Como podemos fazer?” Depois “Ainda não tenho todos os documentos dela.” Depois “Orienta os próximos passos”.
2. “Preciso excluir um dependente do plano odontológico da empresa. Pode me ajudar?” Depois “Sim”.
3. “Preciso da segunda via do boleto do meu seguro Auto.” Depois “Você consegue verificar o valor e me enviar o boleto agora?”.

Verificar respostas sem pedidos de CPF/CNPJ/nomes completos, sem prometer ações/contato ou data de corte, e com setor correto. Qualquer intervenção da proteção será sinalizada. Reavaliar manualmente a naturalidade das respostas após os ajustes.
