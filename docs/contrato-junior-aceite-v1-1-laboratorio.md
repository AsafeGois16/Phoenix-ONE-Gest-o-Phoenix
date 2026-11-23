# ACEITE DO CONTRATO V1.1 — PHOENIX ONE × GESTÃO PHOENIX
**Data:** 23/11/2026  
**Status:** regras de negócio aceitas para implementação em laboratório; **não homologadas em produção**.  
**Base:** resposta de Junior ao alinhamento consolidado v1.0 (23/11/2026), com complemento de precedência de leads.

## Alinhamentos formalmente aceitos

1. **Sem nova fila Comercial:** nova cotação de Auto/RE -> departamento `patrimonio`, fila Auto/RE; nova cotação de Benefícios -> departamento lógico `comercial`, que o Gestão Phoenix traduz para fila `beneficios`.
2. **Responsável do lead:** começa sem responsável; somente quem tem edição do CRM poderá clicar em **Assumir**; operação atômica (primeira pessoa assume, segunda recebe “Já assumido por…”); somente gestor poderá reatribuir lead já assumido.
3. **Notificações:** sino somente para a equipe da fila da linha (Auto/RE ou Benefícios).
4. **Produto:** catálogo de 20 códigos específicos e `outro` (21 códigos); `outro`, código desconhecido e ambiguidade **equivalem a produto ausente**, sem atribuição artificial de ramo/fila.
5. **Deduplicação:** preservar as regras por protocolo e telefone, inclusive na reabertura.
6. **Campos opcionais na resposta:** `handoff.product`, `handoff.intent`; `strategy` continua informativo. Respostas antigas sem esses campos continuam válidas.

### Precedência determinística para nascimento do lead — aceite confirmado
- `intent=operacional` ou `intent=duvida` -> **NUNCA cria lead**, ainda que `agent=murilo` ou `department=comercial`.
- `intent=nova_cotacao` -> cria lead **somente no encaminhamento autorizado**, sem duplicar o protocolo ou telefone.
- Ausência de `intent` -> preservar a lógica legada (compatibilidade).
- Com **Phoenix ONE ligado**, a triagem automática do Gestão Phoenix classifica categoria/ramo, mas **não cria lead antes do aceite**. O lead nasce apenas do `humanHandoff` autorizado pela Clara ou pelo Murilo.
- Com **Phoenix ONE desligado**, a triagem e abertura de lead permanecem **como hoje**.

## Matriz de produtos e destinos

| Linha | Código `product` | Produto |
|---|---|---|
| Auto/RE | `auto` | Automóvel (carro/moto) |
| Auto/RE | `frota` | Frota |
| Auto/RE | `residencial` | Residencial |
| Auto/RE | `fianca` | Fiança |
| Auto/RE | `viagem` | Viagem |
| Auto/RE | `bike` | Bike |
| Auto/RE | `empresarial` | Empresarial |
| Auto/RE | `equipamentos` | Equipamentos |
| Auto/RE | `rc` | Responsabilidade Civil |
| Auto/RE | `cyber` | Cyber |
| Auto/RE | `garantia` | Garantia |
| Auto/RE | `credito` | Crédito |
| Benefícios | `saude` | Saúde PF/adesão |
| Benefícios | `saude_empresarial` | Saúde empresarial |
| Benefícios | `odonto` | Odonto PF |
| Benefícios | `odonto_empresarial` | Odonto empresarial |
| Benefícios | `vida` | Vida individual |
| Benefícios | `vida_grupo` | Vida em grupo |
| Benefícios | `pet` | Pet |
| Benefícios | `previdencia` | Previdência |
| Não determinada | `outro` | Não identificado; **não usar para determinar fila/ramo** |

## Exemplo de resposta aditiva após aceite real

```json
{
  "agent":"clara",
  "strategy":"clara_only",
  "reply":"Vou solicitar o encaminhamento à equipe responsável.",
  "humanHandoff":true,
  "handoff":{
    "department":"comercial",
    "intent":"nova_cotacao",
    "product":"saude_empresarial",
    "reason":"Solicitação comercial autorizada pelo cliente",
    "summary":"Cliente solicita cotação de plano de saúde empresarial."
  }
}
```

Não introduzir novos campos antes de `humanHandoff=true` autorizado. A saída do modelo permanece com contrato interno atual; um enriquecimento validado de servidor pode acrescentar campos opcionais somente quando apropriado. Não inferir produto de `summary` ou do nome do agente.

## Responsabilidades

**Phoenix ONE (Asafe):**
- Implementar e testar em branch de laboratório `handoff.product` e `handoff.intent`, sem publicar.
- Preservar estrutura antiga, validação de identidade, consentimento, pausa humana, urgências e a estratégia `clara_murilo`.
- Não reescrever prompts, RAGs, MegaBrain nem outros serviços.

**Gestão Phoenix (Junior):**
- Implementar sem publicar o armazenamento de `strategy` e `handoff.product`, o texto correto do agente, a matriz de filas e classificação no encaminhamento.
- Aplicar a precedência para criação de leads e eliminar a criação antecipada na triagem **apenas quando Phoenix ONE estiver ligado**.
- Implementar selo “Sem responsável · Assumir”, operação atômica, controles de gestor e sino por equipe.
- Preservar histórico de contatos, deduplicação por protocolo/telefone e `humanHandoff`.

## 14 testes conjuntos (número fictício, sem dados reais)

| Nº | Cenário | Resultado esperado |
|---|---|---|
| 01 | Saúde aceita, `clara_only` | Benefícios; lead Saúde; categoria Cotação; selo Somente Clara; Clara pausada |
| 02 | Saúde recusada | Sem handoff e sem lead; Clara continua; triagem só classifica |
| 03 | Auto aceito | Auto/RE; lead com agente Clara; sem duplicidade |
| 04 | Inclusão de dependente Saúde | Backoffice; sem lead |
| 05 | Dúvida sobre rede credenciada | Benefícios/Backoffice; sem lead |
| 06 | Encaminhamento direto ao `user_id` | Pessoa correta; lead somente se nova cotação autorizada |
| 07 | Nova mensagem no mesmo protocolo | Sem novo lead |
| 08 | Protocolo encerrado/reaberto | Triagem nova, preservar deduplicação por telefone |
| 09 | `clara_murilo` | Fluxo antigo, Murilo correto, selo Clara + Murilo |
| 10 | Payload antigo sem `strategy/product/intent` | Comportamento anterior, sem quebra |
| 11 | Produto desconhecido/ambíguo | Sem inventar ramo, fila ou produto |
| 12 | Emergência real com vítima | Atendimento de urgência preservado; sem lead |
| 13 | Duas pessoas clicam Assumir | Apenas a primeira assume; a outra vê responsável |
| 14 | `department=comercial` sem produto | Sem fila, compatibilidade legada; sem ramo inventado |

**Cenários complementares para o laboratório Phoenix ONE:** nova cotação de Saúde empresarial, Odonto empresarial, Vida em grupo, Viagem, Fiança e Crédito; atendimento operacional com `department=comercial` deve devolver `intent=operacional`; não assumir produto em “carro e vida”.

## Critério de publicação e reversão

1. Testes unitários locais/CI e build de *preview* aprovados no Phoenix ONE.
2. Testes de integração Junior em ambiente de laboratório; registrar `protocolo`, resultado esperado, observado, fila, lead e evidência **sem PII**.
3. Todos os 14 cenários aprovados conjuntamente.
4. Publicar backend e frontend coordenadamente; monitorar; manter reversão (voltar à versão anterior e/ou à estratégia `clara_murilo` se aprovado com Junior).
5. Sem aprovação conjunta, **não fazer merge na main nem alterar estratégia global**.

**Estado em 23/11:** esta branch é somente laboratório. O Junior ainda é responsável pelos ajustes do Gestão Phoenix; não temos confirmação de que foram implantados ou testados.
