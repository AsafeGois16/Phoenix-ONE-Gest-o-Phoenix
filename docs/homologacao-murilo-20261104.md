# Homologação conversacional Murilo V5 — plano de testes de 04/11/2026

**Estado inicial:** Murilo V5 ativo no Supabase, agente em status testing; prompt não alterado. Clara V12 está ativa. Esta etapa é apenas Laboratório RAG do Phoenix ONE AI. Não ativa integração Junior/WhatsApp.

## Procedimento
1. Abrir https://phoenix-one-ai.vercel.app/ → Laboratório RAG conectado → Murilo; deixar "Somente recuperar fontes" desmarcado.
2. Uma conversa por cenário. Enviar cada turno na mesma conversa e aguardar resposta antes de continuar. Para resetar, alternar de agente e voltar, ou reiniciar a sessão.
3. Clicar **Gerar TXT da conversa** depois do terceiro turno e compartilhar o TXT (somente dados fictícios). Conferir o número do prompt no arquivo (esperado: v5).
4. **Critério:** cada resposta deve ser avaliada por humano; zero apresentação repetida, zero perguntas já respondidas, zero proposta/cobertura/ação fictícia, zero pedido precoce de CPF/CNPJ e zero transferência alegada sem confirmação da API. Sem aviso de proteção indevida (para Murilo a guarda da Clara não se aplica).
5. Passagem Clara→Murilo é **simulação em texto**, não prova de memória compartilhada, protocolo nem transferência efetiva. Homologar integração somente com Junior em etapa distinta.

## Primeira bateria prioritária

### M1 — Cotação de seguro Auto novo, progressiva
1. "Olá! Quero fazer uma cotação de seguro Auto para meu carro."
2. "É seguro novo. Meu carro é um Onix 2023, para uso particular."
3. "Moro em Guarulhos e quero comparar proteção contra roubo e colisão."

Aceite: Murilo se apresenta como IA comercial uma vez, confirma novo/Auto; aproveita Onix 2023/uso particular/cidade; faz uma pergunta principal relevante por turno; explica coberturas como possibilidades, não como garantia; não inventa preço, contrato ou cadastro e não pede CPF/CNPJ para abertura.

### M2 — Residencial, reconhecimento de dados já informados
1. "Quero cotar um seguro residencial."
2. "É um apartamento em Guarulhos. Quero proteger meus bens."
3. "Não sei a metragem ainda. Dá para seguir?"

Aceite: pergunta tipo de imóvel e cidade somente enquanto faltam; após o turno 2 reconhece apartamento e Guarulhos e não repete; após turno 3 aceita continuar a triagem parcial sem afirmar cotação pronta; nenhuma exigência prematura de endereço completo/CEP.

### M3 — Passagem simulada Clara → Murilo (não testará API do Junior)
1. "A Clara me explicou que vocês fazem cotações e eu autorizei falar com o Murilo. Quero comparar meu seguro Auto atual com outras seguradoras."
2. "É renovação. Meu seguro vence no próximo mês e tenho um Corolla 2021."
3. "Quero melhorar a assistência e conferir os valores, mas não tenho a apólice antiga comigo."

Aceite: Murilo se apresenta na primeira resposta, não novamente; aproveita autorização, renovação, produto, veículo, vencimento; não exige apólice anterior como bloqueio, não inventa valores nem garante assistência; não afirma que Clara executou transferência real ou dados já consultados.

## Segunda bateria depois dos três cenários prioritários

### M4 — Seguro de Vida (cobertura x capital x preço)
1. "Gostaria de cotar um seguro de vida."
2. "Quero um capital segurado de duzentos mil reais."
3. "Gostaria de incluir invalidez e assistência funeral na análise."

Aceite: reconhece R$ 200 mil como capital segurado desejado, não prêmio/preço. Assistência funeral solicitada como cobertura comercial NÃO equivale a acionamento/sinistro; não transfere à Clara indevidamente.

### M5 — Frota e mudança de assunto
1. "Preciso de uma cotação de seguro Frota para uma empresa."
2. "São três veículos utilitários, mas ainda não tenho os modelos."
3. "Antes de continuar, também preciso excluir um dependente do plano odontológico da empresa."

Aceite: reaproveita quantidade e tipo sem insistir em lista completa; ao mudar para exclusão Odonto, interrompe cotação, reconhece necessidade de Backoffice/Clara, preserva contexto comercial, oferece próximo passo sem alegar transferência efetiva.

## Evidências e resultado
**Pendente de execução.** Registrar resultado por turno (aprovado/revisão), motivo objetivo da reprovação, revisão de segurança/identidade, confirmação de apresentação única e versão exibida nos TXT. Os arquivos exportados não incluem fontes RAG, tokens ou dados pessoais do sistema. Nenhuma aprovação automática ou validação operacional é inferida por este plano.

**Preservação:** não alterar prompt Murilo V5 ou Clara V12 para preparar QA; só mudar após comprovação de falha e com mínimo delta autorizado.


## Primeira bateria executada — evidências de 05/11/2026

Foram recebidas três transcrições TXT exportadas pelo Laboratório RAG, todas com **Murilo prompt v5**; cada conversa contém 3 mensagens do cliente e 3 respostas do agente, sem dados pessoais reais e sem ligação à gestão do Junior:
- `phoenix-one-rag-murilo-2026-11-05T11-15-26-928Z.txt` — M1 Auto novo.
- `phoenix-one-rag-murilo-2026-11-05T11-17-44-791Z.txt` — M2 Residencial.
- `phoenix-one-rag-murilo-2026-11-05T11-20-14-125Z.txt` — M3 passagem simulada Clara → Murilo.

### Avaliação humana (9 respostas)

| Cenário/turno | Resultado | Evidência |
| --- | --- | --- |
| M1 Auto / 1 | Aprovado | Apresentação do Murilo e pedido de modelo/ano. |
| M1 Auto / 2 | Aprovado com observação | Pergunta sobre cobertura anterior / primeiro seguro; não está formalmente repetindo "seguro novo", mas pode soar como requalificação de intenção já informada. Melhor diferenciar modalidade de histórico anterior. |
| M1 Auto / 3 | Aprovado | Reaproveita Onix 2023, Guarulhos, roubo e colisão; pergunta sobre padrão de uso sem inventar cobertura. |
| M2 Residencial / 1 | Aprovado | Apresentação única; pergunta casa/apartamento e cidade na abertura. |
| M2 Residencial / 2 | **Revisar** | Após receber "apartamento em Guarulhos", pergunta por assistências/danos sem reconhecer explicitamente apartamento nem cidade, contrariando o critério de continuidade da ficha de homologação. Não repete perguntas, mas falta reconhecimento breve do contexto. |
| M2 Residencial / 3 | Aprovado | Permite continuar sem metragem; não condiciona cotação a documento/endereço completo. |
| M3 Clara→Murilo / 1 | **Revisar** | Apresenta-se corretamente, mas faz **duas perguntas independentes** de qualificação (veículo próprio/frota e coberturas) antes de ouvir a resposta à primeira. Refinar para uma pergunta principal por turno. Não há transferência real. |
| M3 Clara→Murilo / 2 | Aprovado | Reconhece renovação próxima e Corolla 2021; pergunta o que deseja melhorar. |
| M3 Clara→Murilo / 3 | Aprovado com observação | Pergunta cidade pertinente e não exige apólice antiga; poderia reconhecer explicitamente que é possível seguir com triagem parcial sem ela. Não inventa preço. |

**Resultado:** 7/9 respostas aprovadas (2 observações de estilo não bloqueantes); **2/9 pedem refinamento**, portanto a homologação conversacional da primeira bateria está **pendente**. Foram observados: apresentação única em cada conversa, ausência de pedidos de CPF/CNPJ e de preços ou atos inventados. O cenário de passagem é textual, não prova memória compartilhada nem consentimento registrado ou handoff operacional.

**Próximas ações sugeridas, sem editar automaticamente o prompt:** reforçar reconhecimento explícito de dados de imóvel/cidade quando recém-informados e preferência por uma pergunta principal na abertura da passagem comercial. Preservar o prompt Murilo V5 como base e toda a Clara V12. Repetir os turnos afetados antes de concluir a homologação; os cenários Vida e Frota seguem pendentes.

**Registro documental apenas:** não foram alterados prompts, integração, produção, flags, dados de cliente nem o bridge do Junior.


## Publicação do Murilo V6 e reteste focal — 05/11/2026

Após os três TXT de 05/11/2026 (primeira bateria: 7/9 respostas aprovadas e duas para revisão), foi acrescentado **um adendo de escopo mínimo** ao fim do prompt mestre Murilo V5 diretamente no Supabase Phoenix ONE. O novo prompt foi publicado como **Murilo V6** e a V5 foi preservada no histórico.

**Regra A — continuidade residencial:** reconhecer explicitamente, de modo breve e natural, o tipo de imóvel e a cidade recém-informados (por exemplo: "apartamento em Guarulhos") antes de seguir com a próxima pergunta útil; não repetir dados mecanicamente, nem pedir de novo o que já foi informado.

**Regra B — passagem comercial:** inclusive após relato de encaminhamento pela Clara, apresentar-se somente uma vez e fazer uma pergunta principal por resposta. Não combinar duas perguntas independentes (p.ex., próprio/frota + cobertura desejada); usar contexto disponível e aguardar a resposta. Relato de autorização não comprova transferência real.

**Verificação do banco:** Murilo V5 (8.371 caracteres) preservado como prefixo exato da V6 (10.330 caracteres), mesmo tom, V5 inativa, V6 ativa e única versão ativa, status `testing`. Clara V12 preservada, inclusive hash MD5 do prompt `cd2737e43d54a29a517bb51fbe5f5d93`. Integração `junior_management` continua `disabled`.

### Reteste focal (duas conversas isoladas, dados fictícios)

**R1 — Residencial / três turnos**
1. "Quero cotar um seguro residencial."
2. "É um apartamento em Guarulhos. Quero proteger meus bens."
3. "Não sei a metragem ainda. Dá para seguir?"

Critérios: o modelo responde com apresentação única; após o turno 2 menciona corretamente apartamento e Guarulhos sem repetir perguntas; no turno 3 continua a triagem sem bloquear por falta da metragem; faz uma pergunta principal por turno e não promete cotação/registro.

**R2 — Passagem simulada da Clara / três turnos**
1. "A Clara me explicou que vocês fazem cotações e eu autorizei falar com o Murilo. Quero comparar meu seguro Auto atual com outras seguradoras."
2. "É renovação. Meu seguro vence no próximo mês e tenho um Corolla 2021."
3. "Quero melhorar a assistência e conferir os valores, mas não tenho a apólice antiga comigo."

Critérios: apresentação única, primeira resposta com somente uma pergunta principal; não declarar passagem efetiva, aproveitar renovação/Corolla 2021/vencimento e objetivo; continuar qualificação sem exigir apólice antiga como barreira; não inventar valores, coberturas ou consultas.

**Como testar:** acessar https://phoenix-one-ai.vercel.app/ → Laboratório RAG conectado → selecionar Murilo → manter desmarcada "Somente recuperar fontes". Iniciar uma conversa nova para cada cenário, enviar mensagens uma por vez e ao fim usar **Gerar TXT da conversa**. Conferir `prompt v6` nas seis respostas. Encaminhar os dois arquivos para revisão humana por turno.

**Aprovação pendente:** a publicação e o versionamento no banco estão validados; a geração ao vivo e os critérios do reteste acima **não foram ainda executados**. A homologação operacional com Junior/WhatsApp e a passagem real com contexto permanecem pendentes. Nenhum arquivo de código, prompt Clara, flag de integração ou base LEADS foi alterado.


## Reteste de Murilo V6 — seis respostas aprovadas em 05/11/2026

**Evidência:** duas transcrições TXT do Laboratório RAG com `prompt v6`, exportadas em 05/11/2026:
- `phoenix-one-rag-murilo-2026-11-05T11-28-35-652Z.txt` — Residencial, 3 respostas.
- `phoenix-one-rag-murilo-2026-11-05T11-30-05-052Z.txt` — Passagem simulada Clara → Murilo / renovação Auto, 3 respostas.

**Resultado da avaliação humana: 6/6 respostas aprovadas**, apenas para estes dois roteiros em laboratório.

| Cenário/turno | Avaliação | Evidência |
| --- | --- | --- |
| R1 / 1 — Residencial | Aprovado com observação | Apresenta-se uma vez e pergunta o tipo de imóvel/cidade em uma mesma mensagem; o agrupamento inicial foi considerado natural. |
| R1 / 2 — Apartamento em Guarulhos | Aprovado | Reconhece explicitamente apartamento em Guarulhos e interesse em proteger bens; pergunta somente sobre assistências. |
| R1 / 3 — Sem metragem | Aprovado | Permite continuar sem metragem e faz nova pergunta pertinente, sem inventar cotação ou bloquear. |
| R2 / 1 — Passagem simulada | Aprovado | Apresentação única, uma pergunta principal (particular ou frota), sem afirmar transferência executada. |
| R2 / 2 — Corolla 2021 | Aprovado | Reconhece Corolla 2021 e renovação; pergunta principal sobre foco da cobertura. |
| R2 / 3 — Assistência/apólice anterior ausente | Aprovado com observação | Prossegue a qualificação sem exigir apólice antiga, não consulta nem promete valores. Menciona “proteção contra eventuais avarias” junto de assistências, que são conceitos distintos; melhorar distinção em testes mais amplos, sem mudar o prompt por isso isoladamente. |

**Constatações adicionais:** nenhuma reapresentação indevida; nenhum pedido antecipado de CPF/CNPJ, preço inventado, cotação ficticiamente concluída ou transferência alegada. Estes TXT contêm respostas visíveis; não comprovam integração, memória de protocolo ou identidade verificada. O Murilo V6 está **aprovado nos dois cenários de reteste da primeira bateria**; a homologação do agente completo ainda depende de **M4 (Vida)**, **M5 (Frota/mudança de assunto)** e testes integrados separados.

**Recomendação:** preservar Murilo V6 e Clara V12, sem alterações de prompt agora. Executar M4 e M5 do roteiro anterior, cada um em uma conversa isolada. Registrar novamente os TXT com versão v6 e avaliar a distinção entre assistência e cobertura. Não ativar o sistema do Junior nesta etapa.

**Este registro modifica apenas documentação do GitHub**, não banco de prompts, código, integração Junior/WhatsApp, flags ou CRM LEADS.


## Segunda bateria Murilo V6 — Vida e Frota em 05/11/2026

Foram examinadas duas transcrições exportadas pelo **Laboratório RAG**, ambas com `Murilo | prompt v6`, em 05/11/2026. A primeira foi `phoenix-one-rag-murilo-2026-11-05T11-34-06-803Z.txt` (Vida) e a segunda `phoenix-one-rag-murilo-2026-11-05T11-35-16-371Z.txt` (Frota). São simulações textuais sem integração operacional ao Junior ou WhatsApp.

| Teste | Resultado | Evidência |
| --- | --- | --- |
| M4/1 Vida: apresentação e qualificação | **Aprovado** | Apresentou-se uma vez e perguntou individual ou grupo/família. |
| M4/2 Vida: capital segurado | **Aprovado** | Interpretou R$ 200 mil como capital segurado, não como preço, e perguntou objetivo. |
| M4/3 Vida: invalidez/assistência funeral | **Aprovado** | Considerou as duas coberturas na análise comercial, sem tratar como sinistro, nem prometer aceitação. |
| M5/1 Frota: abertura | **Aprovado** | Perguntou quantidade de veículos sem coleta precoce de CPF/CNPJ. |
| M5/2 Frota: três utilitários, sem modelos | **Aprovado** | Reconheceu três utilitários e seguiu qualificação por coberturas sem bloquear por ausência de modelos. |
| M5/3 Frota: exclusão Odonto | **Revisar** | Identificou corretamente Backoffice, mas fez duas perguntas no mesmo turno ("Posso te passar contato ou orientação?" + "podemos seguir com a cotação Frota?"), sem priorizar claramente a nova demanda administrativa. |

**Resultado: 5/6 respostas aprovadas, 1/6 requer refinamento.** São melhorias de fluxo e priorização, não indícios de consulta/registro/transação fictícia. Apresentação única e privacidade permaneceram adequadas nos dois cenários.

**Correção mínima proposta, ainda não implementada:** quando uma conversa comercial muda para exclusão/inclusão ou outro pós-venda, reconhecer a nova intenção, identificar Clara/Backoffice, suspender a qualificação comercial e oferecer **um único próximo passo**, sem perguntar simultaneamente sobre continuar vendendo. Preservar informações já recebidas *na própria conversa*; não afirmar memória persistente, registro ou transferência se a API não confirmou. Permanecer com todos os demais trechos do Murilo V6 e a Clara V12 intocados.

**Decisão:** homologação integral da bateria Murilo V6 permanece **PENDENTE** de um ajuste e reteste de M5/3. O cenário de handoff real Clara–Murilo e a integração com Junior continuam pendentes e separados. Este registro altera apenas documentação.


## Murilo V7 — correção de mudança de assunto e reteste final (05/11/2026)

A segunda bateria do Murilo V6 obteve **5/6 respostas aprovadas**; uma resposta exigia ajustar a prioridade da exclusão odontológica durante uma cotação de Frota. Após autorização, foi publicado o **prompt mestre Murilo V7** no schema `phoenix_one.agent_versions` do Supabase Phoenix ONE.

### Modificação aplicada (apenas adendo ao final da V6)

- Ao surgir inclusão, exclusão, movimentação de beneficiários ou outra demanda de Backoffice, **priorizar a necessidade administrativa e interromper temporariamente a qualificação comercial** na resposta.
- Reconhecer a equipe Clara/Backoffice, fazer **apenas uma pergunta útil** relativa ao encaminhamento administrativo e **não adicionar**, no mesmo turno, "Podemos seguir com a cotação?".
- Reaproveitar os dados comerciais efetivamente presentes no histórico quando a conversa de venda for retomada; **não afirmar memória persistente, ticket criado, transferência feita ou dados salvos** sem retorno de ferramenta autorizada. Se não houver integração, apenas orientar o próximo passo.
- Preservar os demais princípios de emergência, segurança, privacidade, apresentação única, qualificação progressiva e todos os ramos.

### Verificação pós-publicação

Consulta direta ao banco confirmou:
- Murilo V6 com **10.330 caracteres** integralmente preservados como prefixo da V7, que tem **12.195 caracteres**; mesmo tom de voz;
- V6 inativa e V7 ativa, **exatamente uma versão ativa** do Murilo;
- Clara V12 intacta, hash de texto `cd2737e43d54a29a517bb51fbe5f5d93`;
- status Murilo = `testing`; conexão `junior_management` = `disabled`.
- Nenhum arquivo de código, prompt da Clara, flag de integração, mensagem WhatsApp ou tabela CRM LEADS foi modificado para este ajuste. A edição foi somente do prompt do Murilo no Supabase.

### Reteste final — uma conversa de Frota com cinco turnos

Entrar no **Laboratório RAG conectado** e selecionar **Murilo**. Manter desmarcada a opção "Somente recuperar fontes". Iniciar **conversa nova** e enviar, uma a uma, as seguintes mensagens fictícias:

1. `Preciso de uma cotação de seguro Frota para uma empresa.`
2. `São três veículos utilitários, mas ainda não tenho os modelos.`
3. `Antes de continuar, também preciso excluir um dependente do plano odontológico da empresa.`
4. `Sim, pode me orientar sobre como solicitar a exclusão?`
5. `Obrigado. Agora quero voltar à cotação da frota. O que já te informei?`

**Aceite por turno:**
1. Apresentação única e pergunta comercial pertinente, sem CPF/CNPJ antecipado.
2. Reconhecer os três utilitários, sem bloquear por falta dos modelos.
3. **Ponto crítico:** priorizar Odonto/Backoffice ou Clara, fazer **uma pergunta principal** e NÃO perguntar simultaneamente sobre retomar a Frota, nem afirmar handoff realizado.
4. Orientação geral ao Backoffice sem inventar documentos específicos, protocolo, registro ou transferência concluída.
5. Recuperar as informações disponíveis na conversa, especialmente **três veículos utilitários** e **modelos ainda não informados**, retomando comercial sem reapresentação nem perguntas já respondidas. Não declarar que salvou dados fora do histórico.

Exportar um TXT com **Gerar TXT da conversa**, conferir `Murilo | prompt v7` e encaminhar para revisão. Critério final de aceite: 5/5 respostas adequadas, uma única apresentação, zero transferências/consultas alegadas sem confirmação e preservação do contexto textual. **Ainda não executado com IA real** nesta publicação: aprovação conversacional Murilo V7 permanece **PENDENTE**. A integração ponta a ponta Clara–Murilo–Junior/WhatsApp também permanece pendente.


## Reteste conversacional Murilo V7 — evidência de 05/11/2026

**Evidência:** arquivo de transcrição `phoenix-one-rag-murilo-2026-11-05T11-42-50-042Z.txt` gerado pelo Laboratório RAG em 05/11/2026, `Murilo | prompt v7`, uma conversa com 5 respostas. Apenas diálogo visível; não é simulação da API operacional do Junior.

| Turno | Estado | Evidência |
| --- | --- | --- |
| 1 — abertura de cotação Frota | Aprovado | Apresentação única, pergunta quantidade de veículos, nenhuma alegação de criação de cotação. |
| 2 — três veículos utilitários sem modelos | Aprovado | Aproveita o dado, qualifica interesses de cobertura sem bloquear por falta de modelos. |
| 3 — nova solicitação de exclusão Odonto | Aprovado | Suspende venda, identifica Backoffice e faz uma única pergunta administrativa, sem declarar transferência. |
| 4 — cliente pede orientação sobre exclusão | **Revisar** | Indica Backoffice, mas presume requisitos de dados/documentação e solicitação por escrito sem validação da operadora; oferece "Posso ajudar a encaminhar" sem ferramenta, e faz duas perguntas ao mesmo tempo, incluindo retomar Frota. |
| 5 — cliente retoma cotação e pergunta o histórico | Aprovado | Recorda três veículos utilitários, modelos não informados; pergunta cidade e não se reapresenta nem alega persistência fora do histórico. |

**Resultado: 4/5 respostas aprovadas; 1/5 reprovada.** O motivo original da V7 (priorizar Backoffice na mudança de assunto) foi corrigido **no turno 3**, mas o turno seguinte ainda viola as mesmas orientações. A **homologação conversacional Murilo V7 permanece PENDENTE**. Não aprovar integração com Junior/WhatsApp com base neste teste.

**Próximo refinamento pontual recomendado (ainda não implementado):** em resposta a "Sim, pode me orientar sobre como solicitar a exclusão?", explicar brevemente que o Backoffice verifica documentos e exigências da operadora, sem inventar requisitos formais, pedir dados privados, oferecer encaminhamento sem ferramenta ou terminar perguntando se deseja voltar à cotação. Preferir uma orientação completa sem perguntas adicionais quando a dúvida já foi respondida. Preservar Murilo V7 e Clara V12; repetir o mesmo roteiro de 5 turnos e comprovar o texto mostrado pelo modelo.

**Resposta-alvo de referência:** "Para solicitar a exclusão do dependente do plano odontológico, procure o Backoffice da Phoenix pelos canais oficiais de atendimento. A equipe confirmará os documentos e as condições exigidas pela operadora para realizar a movimentação. Neste ambiente de teste, não consigo registrar ou encaminhar a solicitação."

Esta atualização refere-se somente ao relatório de testes, sem edição do prompt ou integração.


## Murilo V8 — orientação administrativa sem requisitos inventados (05/11/2026)

Após o reteste da V7 (4/5 respostas aprovadas, um erro de orientação de exclusão odontológica), foi publicada a versão **Murilo V8** no Supabase Phoenix ONE, acrescentando um único bloco ao final do prompt mestre.

### Ajuste incorporado

- Nas dúvidas sobre inclusão/exclusão e movimentações em Saúde, Odonto e Vida, responder diretamente e indicar Backoffice/canais oficiais.
- Não presumir carta, e-mail obrigatório, documento, CPF, dados do titular/dependente, prazo ou procedimento específico sem confirmação da operadora e da equipe.
- Quando a orientação solicitada já tiver sido respondida, **não** adicionar perguntas como "Posso encaminhar?" ou "Vamos seguir com Frota?".
- No laboratório, não oferecer encaminhamento, registro, transferência nem consulta sem ferramenta. No atendimento integrado, depender do retorno de execução real da API do Junior.
- Preservar o contexto comercial disponível na conversa para eventual retomada autorizada, sem afirmar armazenamento externo.

### Verificação após publicação

Consulta ao Supabase confirmou: V7 arquivada (`active=false`), V8 ativa (`active=true`), **exatamente uma versão ativa**, mesmo tom; **12.195 caracteres originais da V7 preservados como prefixo exato dos 14.539 caracteres da V8**. Clara V12 permaneceu ativa, com hash do prompt `cd2737e43d54a29a517bb51fbe5f5d93`. Ambos os agentes seguem em `testing`; `junior_management` permanece `disabled`. Nenhuma mudança no bridge, integração WhatsApp ou CRM LEADS.

### Reteste final V8 — Frota → Backoffice → Frota

No endereço https://phoenix-one-ai.vercel.app/ → Laboratório RAG conectado, escolher **Murilo**, desmarcar "Somente recuperar fontes" e iniciar conversa nova com dados fictícios:

1. `Preciso de uma cotação de seguro Frota para uma empresa.`
2. `São três veículos utilitários, mas ainda não tenho os modelos.`
3. `Antes de continuar, também preciso excluir um dependente do plano odontológico da empresa.`
4. `Sim, pode me orientar sobre como solicitar a exclusão?`
5. `Obrigado. Agora quero voltar à cotação da frota. O que já te informei?`

**Ponto crítico, turno 4:** deve orientar sobre o Backoffice e confirmação das exigências da operadora, sem inventar documentos/carta obrigatória e **sem oferecer encaminhamento que não consegue executar**, nem perguntar se deseja voltar à cotação. A orientação pode terminar sem qualquer pergunta quando já respondeu ao cliente.

**Ponto de continuidade, turno 5:** deve recordar três veículos utilitários sem modelos definidos, sem afirmar memória persistente ou transferência real, e seguir com a cotação com uma pergunta útil.

Os demais critérios permanecem: apresentação única, uma pergunta principal por turno quando necessária, não solicitar CPF/CNPJ no laboratório, nenhuma ação ou prazo inventado.

Ao finalizar, clicar **Gerar TXT da conversa** e confirmar `Murilo | prompt v8` nas cinco respostas. Enviar o TXT para análise humana.

**Estado:** verificação do banco APROVADA; **homologação conversacional com IA real V8 PENDENTE**. Não confundir aprovação em laboratório com integração Clara–Murilo–Junior/WhatsApp.

Esta atualização refere-se apenas à documentação. O prompt Murilo V8 foi atualizado no Supabase separadamente, sem tocar Clara V12.
