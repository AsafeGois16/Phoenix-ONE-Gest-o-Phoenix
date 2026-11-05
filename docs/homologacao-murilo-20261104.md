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
