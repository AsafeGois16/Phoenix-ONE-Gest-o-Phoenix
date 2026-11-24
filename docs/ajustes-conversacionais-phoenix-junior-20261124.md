# Phoenix ONE × Gestão Phoenix — correções de consistência pós-homologação (24/11/2026)

## Fonte e escopo
Verificação baseada nos prints de 24/11/2026 de cotação Saúde (incluindo 12 vidas com 4 idades; 4 vidas com 5 idades), renovação Onix 2023, preferência por rede hospitalar e painel do Gestão Phoenix.
O Phoenix ONE não controla a emissão ou a associação de protocolos no WhatsApp/CRM do Junior. Esta revisão corrige somente as regras que estão sob controle do Phoenix ONE e descreve as dependências do Junior.

## Phoenix ONE — mudanças no servidor
1. **Idades e número de vidas:** uma checagem determinística compara quantidade declarada com a lista respondida à pergunta específica de idades, sem misturar CPF/CNPJ, datas ou valores. Se divergirem, o Murilo formula UMA pergunta de confirmação. Se cliente corrigir ou não souber, não insiste. Havendo pendência, acrescenta nota objetiva ao resumo do handoff autorizado (sem copiar as idades individualmente).
2. **Informações antecipadas:** se o cliente já informou que deseja rede credenciada maior ou melhor custo-benefício, não pedir novamente. Ampliar expressões para plano atual (temos Amil/estamos na Amil/etc).
3. **Cidade e região:** conferir apenas respostas comprovadamente incompletas/contraditórias à pergunta de cidade: "Zona Norte" sem município ou "Zona Norte em Vila Mariana". Perguntar uma vez, sem inventar outra região. O mapa do contrato não é uma fonte de verdade sobre todo o Brasil.
4. **Renovação Auto:** "quero renovar" / "renovação de seguro" vira intenção comercial, mesmo que a mensagem mencione uma apólice e sua data de vencimento. Consulta privada real, boleto, sinistro, cancelamento ou alteração continuam operacionais. Cotação não exige validação documental antes do primeiro contato.
5. **Entrada Clara + Murilo:** novo protocolo ainda sem apresentações no Bridge deve passar primeiro pelo acolhimento da Clara, com nome/aceite onde necessário. O código preserva o fluxo existente e os testes evitam que a renovação seja desviada para a consulta de CPF.

## Junior — dependências necessárias para resolver TODOS os problemas vistos
**J01 — protocolo duplo 20261124-0001 / 20261124-0003 no mesmo chat:**
- verificar na gestão qual registro originou a mensagem automática "Este atendimento faz parte do seu protocolo...";
- garantir que o número do atendimento automático e aquele anexado à mensagem do agente sejam o MESMO protocolo corrente;
- garantir que nova conversa/ticket abra estado novo, e que as requisições `/api/v1/conversations/respond`, eventos de atribuição, títulos do chat, histórico e CRM usem exatamente a mesma chave `conversation_id` + `protocolo`;
- não reutilizar mensagens da conversa anterior como se pertencessem ao protocolo novo; enviá-las apenas como histórico contextual explicitamente atribuído, se autorizado;
- repetir teste de novo atendimento, encerramento e reabertura com evidências antes/depois.

**J02 — apresentação inconsistente Clara/Murilo:**
- para protocolo novo, reenviar histórico e flags `clara_apresentada` e `murilo_apresentado` do PRÓPRIO protocolo;
- não reaproveitar flags de outra sessão apenas pelo telefone do contato;
- registrar as trocas entre agentes por protocolo, diferenciando troca de agente (sem pausa) de handoff humano (pausa);
- testar primeiro atendimento, cliente já identificado, retorno do Murilo e protocolo reaberto.

**J03 — destino e fila dos leads:**
- garantir `department=beneficios` para Saúde/Odonto/Vida/Pet/Previdência e `department=patrimonio` para Auto/RE;
- criar lead somente com `intent=nova_cotacao` e handoff humano autorizado; `intent=operacional/duvida` nunca cria lead;
- tela deve usar a fila real, e nunca "Comercial" como fila inexistente; revisar atribuição e número sem fila no CRM;
- não reabrir leads criados em testes anteriores nem mudar o histórico sem trilha de auditoria.

**J04 — rastreabilidade do roteiro Murilo:**
- o backend hoje recebe no máximo 20 mensagens. Para eliminar repetição após janelas longas é necessário um resumo autenticado das perguntas já feitas e respostas confirmadas no protocolo;
- não enviar CPF, dados clínicos ou texto de fotos à IA; apenas sinal de recebimento de mídia autenticado.

## Critérios de aceite conjunto
- Novo protocolo de Saúde com quatro vidas e cinco idades gera exatamente uma conferência, depois segue.
- Doze vidas com quatro idades: confirmação única; ao informar que faltam oito idades, o handoff registra pendência e não insiste.
- Rede maior informada espontaneamente não gera segunda pergunta.
- Zona Norte e Vila Mariana: pedir só uma desambiguação.
- Renovação do Onix 2023: Clara recebe a cotação e não pede CPF apenas por mencionar vencimento da apólice.
- Novo atendimento apresenta Clara; troca autorizada para Murilo não repete apresentação.
- Protocolo exibido no chat, resposta e CRM é sempre o mesmo.
- Benefícios recebe fila Benefícios com lead após aceite, não "Comercial" ou "Sem fila".
- Humano assume -> IA pausa; sem duplicação de lead ou movimentação.
- Rotas de boleto, sinistro e urgência não são prejudicadas por nenhuma correção.

## Publicação e reversão
Esta correção deve passar por build/preview Vercel e testes regressivos antes de publicar. Não alterar prompts ativos, RAGs publicadas, MegaBrain, Bridge ou estratégia global. As mudanças no Gestão Phoenix só são consideradas concluídas após o Junior confirmar e mostrar evidência no ambiente dele.
