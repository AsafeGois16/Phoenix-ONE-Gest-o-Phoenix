# Phoenix ONE — Correção Clara e MegaBrain V2.2

## Escopo
Melhorias pontuais com preservação da operação atual.

### Clara
- O servidor remove a segunda autoapresentação quando uma **única resposta** contém apresentações repetidas da Clara. Mantém a primeira e a pergunta útil.
- Essa correção se aplica ao `reply` entregue ao Junior; se outro sistema anexar uma saudação por conta própria, é necessário identificar essa camada em homologação.
- Consultas explícitas sobre coberturas de Auto limitam o resumo ao produto solicitado, sem repetir apólices de Vida. Pedidos gerais de todos os seguros continuam mostrando a carteira completa.
- Quando a apólice apresenta um número oculto, o cliente não vê o marcador técnico `[IDENTIFICADOR]`.
- Informações sobre assistência e quilometragem **não** garantem sozinhas o direito ao guincho. Condições e acionamento precisam de confirmação com a seguradora/equipe.
- Não há alteração nos prompts V8/V4, na validação da identidade, no encaminhamento nem no sistema do Junior.

### MegaBrain
- Novos assuntos estruturados: `consulta_apolices`, `coberturas` e `assistencia`.
- Subassunto não sensível: `guincho` ou `nao_identificado`.
- Os dados são marcadores fixos, jamais transcrição de mensagens.
- O botão Atualizar do contexto V2 atualiza também o snapshot do protocolo V1.
- Laboratório seguro passa a testar coberturas e guincho.
- A persistência continua condicionada ao grant administrativo por protocolo, expiração em 30 minutos, etapa `with_agent` e identidade de conversa exata. Nenhum novo grant criado.
- Observações existentes são preservadas; categorias anteriores não são automaticamente reinterpretadas.

### Publicação/rollback
1. Testes automatizados e preview Vercel.
2. Migration aditiva restrita à tabela `megabrain_context_observations`.
3. Função de contexto publicada, mantendo o bloqueio por grant.
4. Merge via PR e deployment de produção confirmado.
5. Se necessário, reverter PR para retornar aos componentes de UI/rotas anteriores. A migration aditiva pode ficar sem prejudicar as versões antigas; evitar rollback destrutivo da tabela.

### Homologação
1. Enviar "Oi" em **novo protocolo de teste**: esperar **uma** apresentação da Clara.
2. Pedir carteira completa: esperar apólices verificadas autorizadas, sem limitar por assunto antigo.
3. Pedir coberturas de Auto: não incluir apólice de Vida no mesmo resumo.
4. Perguntar "Tenho direito a guincho?": explicar assistência cadastrada sem garantir acionamento.
5. Habilitar observação apenas no protocolo de homologação e atualizar MegaBrain para ver `assistencia`, `auto`, `guincho`.
6. Revogar a autorização ao final.

Observação: para diagnóstico de eventual saudação acrescentada pelo sistema do Junior, comparar a propriedade `reply` da resposta do Phoenix ONE com a mensagem final efetivamente entregue pelo WhatsApp, sem compartilhar documento pessoal ou conversa integral.
