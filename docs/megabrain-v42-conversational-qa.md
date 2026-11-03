# MegaBrain V4.2 · Laboratório Conversacional (IA real, ambiente isolado)

## Objetivo
Testar **respostas realmente geradas pelos prompts publicados** de Clara e Murilo em **conversas fictícias de múltiplos turnos**, aproveitando a API autenticada **já existente** no Phoenix ONE: POST /api/phoenix-answer. Não recriar um provedor de IA ou reutilizar o antigo endpoint /api/lab-chat, que retorna 410.

O laboratório é **experimental e manual**: não gera automaticamente múltiplas chamadas, não altera prompts ativos, não atualiza CRM, não aciona WhatsApp, não consulta identidade do Junior, não habilita V4.1 nem grava resultados na base.

## Onde acessar
Phoenix ONE → MegaBrain → Abrir laboratório de QA → **Conversacional V4.2 · IA real**.

As outras abas continuam:
- **Universal V4.1 · QA**: testes locais determinísticos, sem chamada a IA;
- **Classificador V2 · legado**: classificação local original.

## Como usar
1. Entre na área administrativa Phoenix ONE e abra a aba Conversacional V4.2.
2. Escolha um cenário fictício (Clara Saúde, boletos, guincho, privacidade; Murilo residencial, Vida, Frota; passagem simulada ou recusa).
3. Confira a mensagem preparada e clique **Gerar resposta do próximo turno**. **Cada clique é uma chamada separada** à API OpenAI, podendo gerar custo e latência.
4. Leia a resposta do modelo e o critério de avaliação. Os alertas heurísticos NÃO significam erro confirmado; ausência de alerta NÃO significa aprovação.
5. Clique **Aprovar resposta** ou **Precisa revisão** em cada turno. Ao escolher **Precisa revisão**, selecione obrigatoriamente o **motivo principal** (apresentação, consentimento, transferência, pergunta repetida, orientação incompleta, informação inventada, privacidade, assunto, tom ou outro). Opcionalmente, escreva observação objetiva de até 220 caracteres **sem dados de clientes**.
6. Clique **Baixar avaliação TXT** para registrar os status, motivos de reprovação, observações curtas e alertas. Não é possível exportar enquanto uma resposta reprovada estiver sem motivo. O relatório **não inclui o conteúdo integral das respostas nem trechos de documentos**.

## Quais cenários
Nove conversas, cada uma com três turnos, com **dados estritamente fictícios**:
- Clara: Saúde/inclusão, segunda via de boleto, guincho/assistência, dados privados sem verificação, recusa de transferência.
- Murilo: Residencial, Vida, Frota.
- Continuidade: Clara → Murilo (passagem simulada).

## Modelo e fontes utilizados
A API **/api/phoenix-answer**:
- autentica sessão Supabase do Phoenix ONE (JWT) e exige origem oficial;
- recupera prompts mestres ativos do banco via phoenix-one-core;
- realiza pesquisa textual nas bases autorizadas (RAG textual);
- chama OpenAI via chave **somente no servidor**, com store=false;
- exige histórico máximo de 9 mensagens e 5.500 caracteres;
- nunca consulta a API de gestão de dados de clientes do Junior.

**Limitações importantes:**
- É a **IA real de laboratório com os prompts publicados**, não a rotina de pós-processamento de /api/v1/conversations/respond (gestão do Junior).
- A troca Clara→Murilo **inicia sessão de IA separada** e usa um texto fictício que declara a autorização. Isso **não testa** a transferência real, nem compartilhamento de verification_ref.
- A sessão só reutiliza respostas de um mesmo agente para que o outro não as confunda como próprias.
- Não há acesso a dados reais. **Não inserir CPF/CNPJ, endereço, número real de apólice ou dados de pacientes** em roteiro algum.
- Não há aprovação automática. Os indicadores são: respostas geradas, revisadas, aprovadas pelo usuário, marcadas para revisão e alertas textuais automáticos.
- Heurísticas sinalizam possíveis reapresentações, falsa execução de tickets/boletos, afirmação de consulta de contratos, pedidos de dados pessoais, cobertura de guincho indevidamente garantida, endereço prematuro e insistência após recusa.
- Revisor humano precisa avaliar clareza, tom, roteiro, cobertura e segurança de cada resposta. Não basta uma pontuação de 100% dos testes determinísticos anteriores.

## Segurança e ativação
- Nenhuma migration Supabase; nenhuma alteração na live Edge phoenix-one-bridge nem na Edge de homologação.
- Nenhuma mudança em /api/v1/conversations/respond ou /api/phoenix-answer.
- Nenhuma alteração de agent_versions; sem enviar mensagens a clientes reais.
- Não alterar PHOENIX_ONE_V4_VERIFIED_CONTEXT: continua OFF.
- Controle de acesso usa o token da sessão existente; o token não é gravado em arquivo, state persistente nem relatório.
- Verificações de conteúdo são executadas no navegador; dados do teste só ficam na memória do React durante a sessão.
- O relatório local não exporta respostas geradas, fontes RAG, tokens, documentos ou mensagens. Exporta a categoria e a observação do revisor somente quando a resposta for marcada para revisão; URLs, e-mails e sequências numéricas longas são reduzidos/omitidos, mas revisão humana permanece necessária para evitar dados sensíveis na observação.
- A conferência real dos agentes via WhatsApp/Junior, persistência de contexto e proteção de dados autenticados deve acontecer **somente em homologação conjunta**.

## Arquivos
- server/megabrain-conversation-qa.js: cenários e heurísticas exportáveis + geração de relatório seguro.
- src/MegaBrainConversationalLab.jsx + CSS: UI autenticada com execução a pedido e revisão por turno.
- src/MegaBrainSandbox.jsx e src/MegaBrain.jsx: integração não destrutiva.
- tests/megabrain-conversational-qa.test.js: cenários, seguranças e testes de não persistência.

## Análise da primeira execução de teste (03/11/2026)
- Clara · dados sem identidade: 3 respostas aprovadas pela pessoa.
- Murilo · cotação residencial: 2 aprovadas e 1 marcada para revisão (turno 3).
- Clara → Murilo · passagem simulada: 0 aprovadas e 3 marcadas para revisão (todos os turnos).
- **4 reprovações humanas sem alertas heurísticos.** Os TXT anteriores só exibiam status, não motivo ou conteúdo. Esta alteração permite registrar as justificativas, sem modificar prompts de produção. Os relatórios antigos não permitem inferir o conteúdo incorreto e não devem ser considerados diagnósticos específicos.

## Regressões a partir da segunda avaliação humana — 03/11/2026

Foram recebidos dois TXT revisados, com **6 respostas avaliadas**:

- **Clara → Murilo (3 respostas):** primeira Clara reprovada porque entrou na qualificação comercial sem perguntar se podia passar ao Murilo; segunda Clara reprovada porque pediu dados em vez de reconhecer o aceite e solicitar a passagem; terceira Murilo aprovada. Nenhum alerta heurístico apareceu nos relatórios antigos.
- **Murilo residencial (3 respostas):** primeiro e terceiro turnos aprovados; segundo reprovado porque não reconheceu explicitamente a informação previamente fornecida: apartamento em Guarulhos. Nenhum alerta heurístico antigo foi disparado.

### Ajustes experimentais, restritos ao laboratório

1. Um complemento de instruções gerado em `server/lab-conversation-coaching.js` é acrescentado ao prompt **somente** quando a UI do V4.2 envia `qaMode='v42'` ao endpoint autenticado `api/phoenix-answer.js`. O endpoint padrão do laboratório RAG, os prompts publicados e o endpoint de clientes `api/v1/conversations/respond.js` **não são alterados por esse complemento**.
2. Na cotação explícita, Clara recebe orientação para oferecer passagem ao Murilo, sem iniciar perguntas de marca, modelo, placa e ano. Depois de autorização explícita ao Murilo, Clara deve reconhecer o aceite e dizer que **solicitará** a passagem — não afirmar execução operacional.
3. Murilo recebe orientação para aproveitar dados já fornecidos em mensagem fictícia de cotação residencial (tipo de imóvel + cidade); na simulação recebida, apartamento e Guarulhos. Não repetir perguntas nem afirmar que consultou cadastro.
4. `assessConversationQaAnswer` agora **alerta** caso a Clara não peça autorização, peça dados de cotação indevidamente depois do aceite, deixe de reconhecer a passagem ou caso Murilo ignore apartamento/Guarulhos no segundo turno. Um alerta é sinal, **não correção automática**, e ainda exige avaliação humana.
5. Arquivo `tests/megabrain-v42-feedback-regressions.test.js` reproduz os casos reprovados, testa respostas esperadas e comprova que nenhuma chamada real à gestão ou WhatsApp foi acrescentada.

**Importante:** os TXT contêm motivos resumidos, não transcrições completas das respostas. O ajuste é baseado nessas avaliações humanas e precisa ser retestado com respostas geradas pelo modelo. O comportamento de **transferência real Clara → Murilo** continua dependente do Junior e não é simulado como ação concluída.
