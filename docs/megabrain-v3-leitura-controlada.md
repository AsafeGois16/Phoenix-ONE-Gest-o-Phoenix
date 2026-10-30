# MegaBrain V3 — leitura contextual controlada entre Clara e Murilo

## Contrato de segurança
- Continua sendo uma memória **categórica inferida**, jamais dados pessoais, fatos verificados ou cópia das conversas.
- O V3 permite compartilhar somente tema, produto e subassunto (enums estritos), com aviso explícito de que são hipóteses.
- Não interfere em escolha de agente, autenticação, API do Junior, cotação, transferência, documentos ou qualquer rota determinística.
- Se a memória estiver ausente, expirada ou indisponível, o atendimento prossegue sem ela.

## Autorização independente
- A observação V2 e a leitura V3 têm consentimentos administrativos **separados**.
- Nova coluna em `megabrain_protocol_grants`: `agent_read_enabled boolean not null default false`.
- Permissão de leitura só pode ser concedida mediante confirmação manual `AUTORIZAR_LEITURA_IA`, após a captura de contexto recente (menos de 20 min) no mesmo protocolo e UUID.
- O protocolo deve estar `with_agent`; autorização de observação ativa, prazo ainda válido, não revogada.
- A leitura expira automaticamente com o grant da observação e pode ser revogada separadamente. Desativar a observação também desativa a leitura.
- Consulta via token interno do bridge, sem URLs ou dados do cliente expostos ao frontend.
- Não armazenar texto integral ou informações pessoais no MegaBrain.

## Integração com a resposta
`readMegaBrainHint` roda somente no ramo geral do modelo, em modo automático, sob `PHOENIX_MEGABRAIN_V3_READ=true`.
O endpoint retorna unicamente categorias autorizadas, com falha silenciosa e timeout de 500 ms. A pista categórica é anexada como informação não instrutiva ao contexto enviado ao modelo, nunca às regras de roteamento ou autenticação.
A mensagem recente do cliente é prioritária. Uma classificação antiga não deve decidir qual seguro, contrato, cobertura ou pessoa está verificada.

## Sequência de publicação
1. Branch isolada + testes automatizados e preview.
2. Migration aditiva com `agent_read_enabled=false`.
3. Publicação da Edge Function (validando token/UUID/grant).
4. Deploy da interface e helper.
5. Liberação controlada do transporte `PHOENIX_MEGABRAIN_V3_READ` somente após homologar as proteções; não ativa automaticamente nenhum protocolo.
6. Teste com protocolo fictício: observação ativa, leitura separadamente autorizada, nova mensagem; conferir continuidade e ausência de dados sensíveis.

## Limites
V3 não implementa fatos personalizados, resumos livres ou memórias entre protocolos. Para reter informações como idade, profissão e etapas concluídas será necessário um novo desenho de minimização e consentimento, e nunca reutilizar prova de identidade.
