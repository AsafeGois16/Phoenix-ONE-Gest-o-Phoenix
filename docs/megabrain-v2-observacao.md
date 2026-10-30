# MegaBrain V2 — contexto categórico em observação (shadow)

## Regra central
Nenhuma mudança na tomada de decisões da Clara, do Murilo, no Junior ou no WhatsApp. O V1 segue independente. O V2 não é memória consumida pela IA: observa e classifica informações não sensíveis até que a qualidade seja homologada.

## Novos componentes
- `server/megabrain-observation.js`: classificação determinística de assuntos, produtos e próximas etapas; retorna APENAS enums, jamais mensagens.
- `supabase/migrations/20261030_megabrain_context_observations.sql`: tabela separada `phoenix_one.megabrain_context_observations`, sem alterações na `protocol_agent_state`.
- `supabase/functions/phoenix-one-megabrain-context/index.ts`: `observe` autenticado pelo token interno do bridge + verificação de UUID/protocolo; `snapshot` exclusivo para admin/owner com JWT.
- `src/MegaBrainContext.jsx`: bloco de contexto categórico na ficha do protocolo, sempre identificado como inferido e não confirmado.

## Captura / ativação
O modo shadow está **DESLIGADO por padrão**. Só ocorre no endpoint existente de resposta se `PHOENIX_MEGABRAIN_SHADOW=true` no ambiente Vercel. Não ativar antes dos testes de comportamento e latência. Com a flag ausente ou diferente de `true`, a função não faz qualquer requisição nem escrita. Mesmo ativada, a captura tem limite de 650ms, ignora erros e não modifica o objeto enviado ao Junior. Captura apenas em modo automático, com última mensagem de cliente.

## Privacidade e consistência
- Nunca copiar texto livre, CPF/CNPJ, nome, telefone, endereço, comprovantes ou anexos.
- Colunas de assunto, produto, pendência e próxima etapa são enums; fatos são somente marcadores não pessoais, sempre inferidos.
- Somente protocolo + UUID existente e não encerrado podem produzir registro; nunca misturar conversas.
- Dados fora da validade são omitidos. Expiração máxima de sete dias, limitada à memória operacional existente.
- Consulta de administrador fica separada da rota do agente, não disponível ao Murilo ou à Clara.
- Não consultar, alterar ou replicar o CRM LEADS.
- Em falhas da função observadora, as respostas atuais prosseguem normalmente.

## Limitações conscientes
Ainda não existe resumo semântico livre, identificação de fatos pessoais, gravação de solicitações concluídas, histórico completo de múltiplos assuntos ou memória reutilizável pelos agentes. Esses pontos dependem de privacidade, testes e homologação específicos.

## Testes
`node --test tests/*.test.js` em preview + verificar separação do endpoint e o modo desligado. Para homologar a captura real, ativar a flag somente em ambiente controlado e usar protocolo fictício de teste, conferir categoria e expiração, medir latência, depois considerar ativação gradual.
