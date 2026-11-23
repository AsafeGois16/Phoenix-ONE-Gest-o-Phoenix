# Contrato de integração Phoenix ONE × Gestão Phoenix — roteamento Clara por produto

**Versão:** proposta v1 — 23/11/2026  
**Estado:** especificação para homologação conjunta; **nenhuma alteração operacional ou publicação decorrente deste documento**.  
**Base:** diagnóstico e proposta enviados pelo Junior em 23/11/2026 (homologação 20261123-0001).

## 1. Objetivo e princípios

- Preservar o contrato existente de resposta `respond`, os prompts/RAGs/MegaBrain, as regras de identificação, consentimento, proteção humana e urgência.
- No modo `clara_only`, a Clara identifica o produto **apenas quando houver evidência** e envia os metadados opcionais `handoff.product` e `handoff.intent`.
- `strategy` continua campo informativo opcional (`clara_only` ou `clara_murilo`). Resposta sem os novos campos deve ser aceita.
- `handoff.summary` é texto de apoio, **não** fonte confiável para distribuição automática de produto.
- `humanHandoff=true` deve continuar pausando o agente para atendimento humano.
- Não criar fila `comercial`; ela funciona como destino **lógico** que o Gestão Phoenix traduz quando o produto indica Benefícios.

## 2. Exemplo de resposta aditiva

```json
{
  "agent": "clara",
  "strategy": "clara_only",
  "reply": "Certo, vou encaminhar sua solicitação ao setor responsável.",
  "humanHandoff": true,
  "handoff": {
    "department": "comercial",
    "intent": "nova_cotacao",
    "product": "saude",
    "reason": "Solicitação comercial autorizada pelo cliente",
    "summary": "Interesse em plano de saúde; cliente concordou com a transferência."
  }
}
```

Os campos `agent`, `reply`, `humanHandoff` e `handoff` devem manter seu funcionamento anterior. **Não inventar produto, intenção, consentimento nem dados de cliente.**

## 3. Valores aceitos para `product`

| Código | Produto | Linha | Departamento para nova cotação | Fila real |
|---|---|---|---|---|
| `auto` | Automóvel (carro/moto) | Auto/RE | `patrimonio` | Auto/RE |
| `frota` | Frota | Auto/RE | `patrimonio` | Auto/RE |
| `residencial` | Residencial | Auto/RE | `patrimonio` | Auto/RE |
| `fianca` | Fiança | Auto/RE | `patrimonio` | Auto/RE |
| `viagem` | Viagem | Auto/RE | `patrimonio` | Auto/RE |
| `bike` | Bike | Auto/RE | `patrimonio` | Auto/RE |
| `empresarial` | Empresarial | Auto/RE | `patrimonio` | Auto/RE |
| `equipamentos` | Equipamentos | Auto/RE | `patrimonio` | Auto/RE |
| `rc` | Responsabilidade civil | Auto/RE | `patrimonio` | Auto/RE |
| `cyber` | Cyber | Auto/RE | `patrimonio` | Auto/RE |
| `garantia` | Garantia | Auto/RE | `patrimonio` | Auto/RE |
| `credito` | Crédito | Auto/RE | `patrimonio` | Auto/RE |
| `saude` | Saúde PF/adesão | Benefícios | `comercial` | Benefícios |
| `saude_empresarial` | Saúde empresarial | Benefícios | `comercial` | Benefícios |
| `odonto` | Odonto PF | Benefícios | `comercial` | Benefícios |
| `odonto_empresarial` | Odonto empresarial | Benefícios | `comercial` | Benefícios |
| `vida` | Vida individual | Benefícios | `comercial` | Benefícios |
| `vida_grupo` | Vida em grupo | Benefícios | `comercial` | Benefícios |
| `pet` | Pet | Benefícios | `comercial` | Benefícios |
| `previdencia` | Previdência | Benefícios | `comercial` | Benefícios |
| `outro` | Não listado; descrever no resumo | Não determinada | Não determinar fila por produto | Como hoje |

**Observação:** são **20 códigos específicos + `outro`** = 21. Produto desconhecido, ausente ou ambíguo: não atribuir ramo/fila por inferência.

## 4. Valores opcionais de intenção

- `nova_cotacao` — solicitação real de cotação, após coleta/consentimento pertinentes.
- `operacional` — movimentações, boletos, carteirinhas, sinistros, reembolsos etc., conforme o produto e a necessidade.
- `duvida` — informações/orientações, sem pressupor venda.

A intenção **não substitui** o produto nem o consentimento.

## 5. Matriz de encaminhamento

| Cenário | `handoff.department` | `handoff.intent` | Tratamento no Gestão Phoenix |
|---|---|---|---|
| Nova cotação Auto/RE | `patrimonio` | `nova_cotacao` | Fila Auto/RE; lead e ramo/categoria da cotação |
| Nova cotação Benefícios | `comercial` | `nova_cotacao` | Traduzir para fila Benefícios; lead e ramo/categoria |
| Inclusão, exclusão, troca de plano | `backoffice` | `operacional` | Fila Backoffice, sem lead de cotação |
| Carteirinha, rede, reembolso, problema de plano | `beneficios` ou `backoffice` | `operacional` ou `duvida` | Preservar triagem/encaminhamento existente; sem novo lead só por ser encaminhamento |
| Sinistro, endosso, 2ª via Auto/RE | `patrimonio` | `operacional` | Fila Auto/RE, sem novo lead de cotação |
| Cobranças da corretora/financeiro | `financeiro` | `operacional` | Fila Financeiro, sem novo lead de cotação |
| Cotação com produto não identificado | `comercial` | `nova_cotacao` | Comportamento legado: sem fila; não inventar produto |

## 6. Responsabilidades — Phoenix ONE

1. Enviar `handoff.product` quando houver identificação confiável, usando somente códigos da tabela.
2. Enviar `handoff.intent = nova_cotacao` também nas novas cotações de Benefícios.
3. Manter `department = comercial` nas novas cotações de Benefícios e `patrimonio` nas de Auto/RE, de acordo com o alinhamento.
4. Manter campos novos opcionais, sem alterar significado dos campos existentes nem a regra de `humanHandoff`.
5. Não modificar prompts mestres sem revisão pontual de conflitos; priorizar contrato de resposta e teste de laboratório.

## 7. Responsabilidades — Gestão Phoenix (Junior)

1. Persistir `strategy` e `handoff.product` no recebimento; mostrar selos de estratégia (`Somente Clara`, `Clara + Murilo`, ausente = `Estratégia não informada`).
2. Remover o texto fixo `Murilo passou ao comercial`; usar o agente efetivo no evento e no texto do lead.
3. Traduzir cotação com produto Benefícios e `department=comercial` para fila `beneficios`; para Auto/RE usar `patrimonio`; não criar nova fila.
4. Atualizar ramo/produto e categoria no evento de encaminhamento com intenção de nova cotação; não depender da triagem antiga `Outro`.
5. Preservar deduplicação de leads por protocolo/telefone, `humanHandoff` e a regra existente do Murilo.
6. Leads novos permanecem **sem responsável** até que alguém autorizado clique **Assumir**. Usar operação atômica para evitar dupla atribuição e avisar no sino a equipe da linha.

### Ponto de homologação a confirmar antes do deploy

A proposta original de criação de leads considera `intent = nova_cotacao` **ou** `agent=murilo` **ou** `department=comercial`. Essa compatibilidade pode criar lead em encaminhamento operacional que chega como `comercial` por engano. **Recomenda-se confirmar a precedência**: presença explícita de `intent=operacional` ou `duvida` não deve criar lead novo apenas pelo departamento/agente; respostas legadas sem `intent` continuam com o comportamento histórico. Essa é uma recomendação para aprovação conjunta, não uma alteração aprovada pelo Junior.

## 8. Homologação conjunta (14 cenários)

| Nº | Cenário | Critério de aceite |
|---|---|---|
| 1 | Cotação Saúde, cliente aceita, `clara_only` | Fila Benefícios, lead Saúde, categoria Cotação, selo Somente Clara, agente pausado |
| 2 | Cotação Saúde, cliente não aceita | Sem handoff/lead, Clara continua |
| 3 | Cotação Auto | Fila Auto/RE, lead Clara sem duplicidade |
| 4 | Inclusão de dependente Saúde | Fila Backoffice, sem lead |
| 5 | Dúvida de rede credenciada | Benefícios ou Backoffice conforme regra existente, sem lead |
| 6 | Handoff direto para pessoa `user_id` | Atribuição correta; nova cotação gera lead com agente correto |
| 7 | Cliente escreve novamente no mesmo protocolo | Não duplica lead |
| 8 | Novo protocolo por reabertura | Nova triagem; reaproveitamento do lead aberto por telefone |
| 9 | `clara_murilo`, Murilo encaminha | Fluxo legado e selo Clara + Murilo |
| 10 | Resposta sem `strategy` e `product` | Compatibilidade, sem quebra |
| 11 | Código de produto desconhecido | Tratar como ausente, sem inventar |
| 12 | Urgência: sinistro com vítima | Encaminhamento conforme regras de urgência, sem lead |
| 13 | Duas pessoas tentam assumir lead | Apenas a primeira assume; outra recebe aviso |
| 14 | `department=comercial`, sem produto | Sem fila, como hoje; lead conforme regra legada |

## 9. Critérios de liberação

- Aprovação explícita do contrato pelas equipes Phoenix ONE e Junior.
- Revisão da precedência de criação de leads (item 7).
- Testes 1–14 aprovados **nos dois sistemas**, com número de teste e sem uso de dados reais.
- Confirmação de que não houve alteração indevida em agentes, prompts, RAG, saudações, consentimento, urgências e histórico.
- Só depois, publicar mudanças de código coordenadamente.

**Fora do escopo:** sincronização após unificação/reabertura de protocolos (pendência separada identificada pelo Junior).
