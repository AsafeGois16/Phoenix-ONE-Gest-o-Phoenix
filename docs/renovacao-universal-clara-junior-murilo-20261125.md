# Homologação — renovação universal Clara → Junior → Murilo (25/11/2026)

**Estado:** implementação opt-in na branch de homologação; nenhuma flag de produção alterada.

## Comportamento

1. Cliente pede renovar seguro e informa o ramo. A Clara cumprimenta e coleta nome de tratamento (sem pedir identidade logo ao abrir qualquer conversa).
2. Antes da passagem ao Murilo, Clara **oferece** consultar a existência de seguro da categoria pedida. Não consulta sem aceite. Uma recusa segue imediatamente para o convite normal ao Murilo.
3. Havendo aceite, aproveita `verification_ref` autenticado do **mesmo conversation_id/protocolo** se fornecido server-to-server pelo Junior. Se ainda não houver, pede CPF/CNPJ do titular **uma vez**, somente como chave de busca (não prova de identidade); a Bridge pode exigir nascimento/CEP para confirmação.
4. Chama `identity_context` com `v4=true`, `purpose=quote` e `productCode` permitido. Só considera existência quando a resposta for `verified`, dentro de validade, autorizar `policies.read` **e** contiver `coverage_check` válido, com `product_code` correspondente, `result` = `found` ou `not_found` e `count` coerente. **Uma lista `policies=[]` sem `coverage_check` não prova ausência de seguro.**
5. Consulta apenas o ramo solicitado e responde “existe seguro cadastrado” ou “não localizei nesta consulta”; **nunca assume ausência** quando o escopo, validação ou a API falham. Não revela modelo de veículo, placa, contrato, saldo, beneficiários ou informações clínicas.
6. Ao aceitar a passagem ao Murilo, este refaz a consulta autorizada no protocolo. Com uma única apólice correspondente, evita perguntar seguradora e vencimento que o Junior confirmou. Com múltiplas apólices, não seleciona a primeira; pergunta apenas o necessário para identificar a renovação. Dúvidas pendentes seguem a triagem comercial já aprovada.
7. Handoff humano permanece após aceite, nas filas reais por produto. O retorno deve conter **`handoff.intent = "renovacao"` e `handoff.product`** quando for renovação, para o Junior classificar o protocolo corretamente e **não criar novo lead**, inclusive quando o cliente opta por não autenticar a cotação preliminar. Sinistros, urgências, movimentos e consultas operacionais preservam prioridade.

## Produtos com consulta de categoria V4 prevista

Auto (grupo Auto/Moto/Frota), Frota, Residencial, Fiança, Viagem, Bike, Empresarial, Vida, Vida em Grupo, Saúde (incluindo Saúde Empresarial), Odonto (incluindo Empresarial), Pet, Previdência, Responsabilidade Civil e Garantia.

**Não afirmar cobertura universal sem contrato:** Equipamentos, Cyber, Crédito e eventuais categorias fora do V4 atual continuam na triagem normal; não tentar `product_code=outros` para inferir uma apólice específica. A habilitação de cada produto depende do filtro realmente suportado pelo Junior no ambiente alvo.

## Flags de ambiente para laboratório

- `PHX_UNIVERSAL_RENEWAL_LOOKUP=true`
- `PHOENIX_ONE_V4_VERIFIED_CONTEXT=true`
- Bridge server-to-server e permissão `policies.read` para `purpose=quote`; `verification_ref` válido e revinculado ao protocolo nos turnos seguintes.
- O questionário aprovado do Murilo é acionado determinísticamente **somente** após resumo verificado. Nenhum prompt/RAG foi alterado.

A consulta antiga exclusiva de Auto (`PHX_AUTO_RE_VERIFIED_LOOKUP` e `PHX_AUTO_RE_DOCUMENT_INTAKE`) é bypassada quando o novo fluxo universal está ligado; não executá-las em paralelo. Para rollback, desligar `PHX_UNIVERSAL_RENEWAL_LOOKUP`.

## Plano de homologação com Junior

1. Verificar cliente de Saúde com apólice autorizada e CPF validado, e depois envio de `verification_ref` autenticado até o Murilo.
2. Confirmar existência de Auto sem ligar o resultado a modelo/placa específicos; sim à oferta para Murilo **não** abre ticket humano.
3. Cliente não cadastrado: `verified` + `policies.read` + `coverage_check.result = not_found` e `count = 0` gera “não localizei nesta consulta”. Resposta sem `coverage_check` é inconclusiva, ainda que `policies=[]`.
4. Falha de autenticação, múltiplos vínculos, `verification_expired` ou falta de escopo: não afirmar cadastro e permitir seguir cotação.
5. Recusa da verificação: não insistir no CPF, não consultar Bridge, continuar a cotação.
6. Múltiplas apólices no grupo consultado (`coverage_check.count > 1`): Murilo pergunta qual contrato deseja renovar; não deduz qual risco nem pula seguradora/vencimento. Só reaproveita dados quando existe exatamente uma apólice do **ramo exato** com dados autorizados.
7. Troca de assunto para cotação nova: não reaproveitar a verificação de uma renovação anterior como gatilho.
8. Verificar documentos/provas não presentes em prompts, resumos, RAGs, logs ou mensagens de CRM.
9. No sistema do Junior, cadastrar os mesmos números de teste em **Configurações › Integração › Agentes › Números de teste (laboratório)** e no secret `PHOENIX_ONE_TESTE_TELEFONES`; definir `PHOENIX_ONE_TESTE_URL`/`PHOENIX_ONE_TESTE_TOKEN` e modo `sugestao`. O recurso de resumo verificado pode ser ligado somente nesses telefones enquanto a chave geral permanece OFF.
10. Verificar que a Edge Function `phoenix-one-bridge` propaga `coverage_check` da rota `identity/resolve` para o backend do Phoenix ONE sem remover os campos `result`, `count` e `product_code`.
11. Testar manualmente a autenticação real da Bridge do Junior em telefones de laboratório e **com dados próprios autorizados**; testes simulados de API não substituem essa verificação.

**Não publicar/ativar em produção antes de build verde e autorização de acesso do Junior por produto.** A transferência Clara → Murilo não cria lead; já a passagem ao humano com intenção `renovacao` não cria lead, mesmo com agente Murilo. A validação por documento e `verification_ref` continua exclusiva do Junior e vale no mesmo protocolo (30 minutos após última consulta, com renovação por uso; encerra/reabre invalida).
