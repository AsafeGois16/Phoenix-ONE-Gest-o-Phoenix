# Phoenix ONE — Segunda via, Financeiro e CPF no mesmo protocolo

**Data:** 06/11/2026  
**Escopo:** correção no backend da integração Junior ↔ Clara, sem modificar os prompts mestres Clara V12/Murilo V9 ou bases RAG.

## Falha observada

Durante homologação pelo WhatsApp, a Clara respondeu à pergunta sobre segunda via de boletos do plano de Saúde oferecendo verificar se conseguiria enviar o documento e, diante da confirmação do cliente, voltou a pedir CPF apesar da identificação anterior no mesmo protocolo. O sistema ainda não encaminhou ao Financeiro.

**Ações proibidas à IA:** emissão, envio, reenvio, registro, consulta de segunda via ou promessa de envio sem ferramenta operacional confirmada. A funcionalidade `second_copy` consta como `pending_junior`.

## Correção aplicada

1. Resposta específica para *solicitação de segunda via* (diferente de consulta de valor/vencimento): a operadora emite o documento; o Financeiro pode orientar o canal oficial. A Clara não garante emissão/envio.
2. A confirmação `Sim` dada a uma antiga oferta de “verificar se consigo enviar” não pode ser interpretada como transferência autorizada; deve orientar corretamente.
3. Se uma nova consulta financeira ocorrer no **mesmo protocolo**, o backend pode procurar a chave CPF/CNPJ **já digitada no histórico integral fornecido pelo Junior**. O documento vai exclusivamente à API segura `identity/resolve` do Junior, que deve devolver **status `verified`** para liberar parcelas e valores. A chave não é prova de identidade; o documento e a prova não vão à OpenAI, banco da IA, logs ou resumo. Se a janela de mensagens do Junior não contiver o documento e não houver `verification_ref` autorizado, a Clara poderá precisar solicitá-lo novamente.
4. A proposta de transferência ao `financeiro` está implementada **com autorização explícita e proteção por feature flag**, mas fica **desativada** até a gestão do Junior confirmar esse novo destino. Não confundir `financeiro` com `beneficios`, `comercial` ou `backoffice`.

## Ação necessária do Junior para encaminhamento efetivo

O contrato operacional atual em `POST /api/v1/conversations/respond` aceita quatro departamentos: `patrimonio`, `beneficios`, `comercial` e `backoffice`. O Junior deve:

- Criar/confirmar a fila **Financeiro**, expor um identificador de departamento estável para o contrato e mapear o valor `handoff.department="financeiro"` ao departamento certo no WhatsApp.
- Aplicar o handoff só após `humanHandoff=true`, retornar estado real da transferência, pausar Clara e emitir evento `ticket.assigned.v1`.
- Garantir que o histórico/estado validado por protocolo continue disponível após devolução de atendimento humano, sem mover CPF/CNPJ à camada de IA.
- Executar apenas ações de faturamento autorizadas; a Clara não emite e não envia boleto.

**Após a implementação do Junior**, habilitar no Vercel a variável protegida `PHOENIX_ONE_JUNIOR_FINANCEIRO_ENABLED=true` e gerar novo deployment. Não habilitar antes da confirmação do contrato. Até lá, a Clara orienta o canal oficial do Financeiro, **sem alegar transferência**.

## Critérios de aceite

- “Como funciona segunda via de boleto?” → orientação correta, sem promessa ou pedido repetido de CPF.
- “Sim” após oferta de boleto não executada → sem alegar envio e sem tentar emissão.
- “Qual valor de minha parcela?” com documento anterior no mesmo protocolo → usa exclusivamente consulta autenticada ao Junior; só revela valor se o Junior responder `verified`.
- Após destino habilitado, “Pode encaminhar ao Financeiro?” + “Sim” → `humanHandoff=true`, destino `financeiro` e resumo sem PII; Junior atribui à fila Financeiro, pausa agente e confirma `ticket.assigned.v1`.
- Se Junior não reconhecer o destino, não atribuir outra fila automaticamente e não anunciar sucesso.

## Segurança

Não alteramos Clara V12, Murilo V9, RAGs, estrutura de Supabase, acesso ao CRM, 4Zapy ou configurações do Junior. A habilitação da fila Financeiro depende de concordância e validação operacional.
