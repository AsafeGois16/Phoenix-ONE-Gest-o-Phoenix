# Phoenix ONE — Roteamento de atendimentos de Benefícios para Backoffice
Data: 10/11/2026 · Versões mantidas: Clara V12, Murilo V9, Junior v1.2

## Alteração operacional
Para ocorrências, urgências e problemas de serviços relacionados a Benefícios, o **destino de atendimento humano é a fila `backoffice`**. Não usar `beneficios` como destino nessas situações.

| Família | Exemplo | Ordem de tratamento | Fila |
|---|---|---|---|
| Saúde | Urgência médica, internação, negativa de autorização | Avaliar gravidade; em risco imediato priorizar socorro/SAMU 192. Solicitar identidade somente quando seguro | backoffice |
| Saúde | Exame, consulta, reembolso, rede ou problema contratual | CPF/CNPJ do titular para consulta segura; verificação Junior; oferta de transferência | backoffice |
| Odonto | Trauma dentário, sangramento grave | Avaliar urgência; encaminhar atendimento médico presencial quando necessário | backoffice |
| Odonto | Problema de rede, reembolso, negativa | Identificação segura; avaliação humana | backoffice |
| Vida | Falecimento, acionamento, indenização, assistência funeral | Atendimento acolhedor, identificação e orientação ao Backoffice sem prometer indenização | backoffice |
| Acidentes Pessoais / DIT | Acidente pessoal, incapacidade | Segurança e saúde antes de documento; DIT só se constar na apólice | backoffice |
| Viagem | Extravio/assistência/sinistro | Identificar titular; não afirmar vigência/cobertura até confirmação | backoffice |
| Previdência | Problemas de resgate, portabilidade ou contrato | Identificar titular e encaminhar ao Backoffice | backoffice |
| Pet | Urgência veterinária/sinistro | Priorizar atendimento veterinário, depois identificação | backoffice |

## Regras preservadas
- Situações de risco à vida **não** esperam CPF ou validação documental para orientações de segurança ou encaminhamento prioritário.
- CPF/CNPJ é chave de busca, **não autenticação**. Somente resposta `verified` do Junior autoriza consultas contratuais.
- A Clara oferece o atendimento humano; o Junior efetiva a transferência e pausa o agente após consentimento, ressalvadas as regras de urgência.
- Nenhum sinistro, guincho, assistência ou procedimento é acionado automaticamente.
- Cotação comercial continua com Murilo; sinistro Auto, Frota, Residencial, Empresarial, Condomínio etc. continua em `patrimonio` (Auto/RE).
- Inclusão/exclusão continua a exigir validação de identidade e plano específico antes de movimentação; não se altera o fluxo existente.
- Áudio sem transcrição preserva o destino informado pelo sistema Junior, ou a fila geral conforme contrato v1.2.
- Prompts mestres Clara V12 / Murilo V9, bases RAG e integrações não foram modificados.

## Testes de regressão
- `tests/benefits-backoffice-routing.test.js`: 10 cenários novos para Saúde, Odonto, Vida, AP, Viagem, Pet e Previdência; checks de consentimento, reenquadramento de mensagens legadas, segurança e regressão comercial/patrimonial.
- `tests/incident-product-integration.test.js`: confirma proposta, validação Junior, aceite e resultado `handoff.department=backoffice` em Vida e Saúde urgente.
- Manter demais testes da suíte `npm run build` sem regressão.

## Reteste operacional com dados fictícios
1. **Saúde urgente:** “Preciso de internação urgente pelo meu plano de Saúde.” → orientação de gravidade/socorro, depois proposta de Backoffice, sem aguardar CPF em risco imediato.
2. **Odonto:** “Minha filha sofreu trauma dentário. Preciso de ajuda com o Odonto.” → segurança, identificação quando possível e Backoffice.
3. **Vida:** “Meu pai faleceu e preciso acionar o Seguro de Vida.” → resposta acolhedora, CPF/CNPJ, validação Junior, oferta e handoff Backoffice.
4. **Saúde não urgente:** “A operadora negou a autorização de um exame no meu plano de Saúde.” → identificação e Backoffice.
5. **Acidentes Pessoais:** “Sofri um acidente e preciso acionar Acidentes Pessoais com DIT.” → triagem de saúde, DIT apenas sob conferência, Backoffice.
6. **Viagem:** “Minha mala foi extraviada e quero acionar Seguro Viagem.” → consulta segura e Backoffice.
7. **Regressão:** Cotação Vida segue Murilo, Sinistro Auto segue Auto/RE, exclusão de dependente segue fluxo validado de movimentação, áudio do Junior preserva a fila.

**Homologação operacional pendente:** registrar o departamento real no painel Junior, confirmar pausa da Clara e manter o contexto. A aprovação dos testes automáticos não prova transferência no WhatsApp.
