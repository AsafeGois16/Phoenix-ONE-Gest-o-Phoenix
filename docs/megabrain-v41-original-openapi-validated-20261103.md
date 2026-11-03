# MegaBrain V4.1 — validação com os arquivos originais do Junior

**Data:** 03/11/2026
**Arquivos recebidos diretamente:** `contrato-fase2.openapi.yaml` e `exemplos-resumo-verificado.json`. Os arquivos foram carregados no ambiente de análise (YAML OpenAPI 3.1.0, info.version `2.0.0-proposta`, 9 paths; JSON com 6 cenários) e comparados com a implementação V4.1.

## Diferenças identificadas e adaptadas

| Categoria | Chave EXATA documentada | Chave interna normalizada que os agentes já utilizam |
| --- | --- | --- |
| Frota | `risk_summary.fleet.quantidade` | `quantidade_itens_ativos` |
| Frota | `risk_summary.fleet.itens[]` | `items[]` |
| Frota | `risk_summary.fleet.itens[].item` | `numero_item` |
| Frota | `item_ref`, `marca_modelo`, `ano_modelo` | Mesmos nomes (até 50 itens) |
| Residencial | `risk_summary.property.atividade` | `atividade_risco` (somente no escopo liberado) |
| Saúde/Odonto | `risk_summary.benefits.vidas` | `quantidade_vidas` (agregadas, nunca nomes) |
| Saúde/Odonto | `risk_summary.benefits.plano` | `plano_titular` |
| Vida/AP | `risk_summary.insured_person.faixa_etaria` | Só liberada em `quote` com `profile.age_band`; nunca DOB |
| Auto/Moto | `risk_summary.vehicle` com marca, modelo, versão, ano, zero_km | Campos originais permitidos |

Por compatibilidade, os adaptadores também aceitam os nomes normalizados anteriores. Essa tolerância é estritamente *interna*: permissões, identidade e filtro de produto continuam obrigatórios.

## Divergência real entre texto e exemplo de cotação Auto

O texto YAML especifica que `purpose=quote` consulta apenas o produto filtrado. Porém, o exemplo JSON `2_murilo_cotacao_auto_com_verification_ref` solicita `product_code=auto` e **inclui uma apólice `product_code=frota`**, além da apólice Auto.

Resolução conservadora aplicada no Phoenix ONE:
- A resposta de Auto pode incluir itens de Frota **somente quando** `field_scopes` contém também `risk.frota.read`; demais produtos continuam bloqueados.
- Tanto Supabase quanto Vercel reaplicam essa restrição antes de repassar dados aos agentes.
- Havendo vários seguros/veículos, Murilo pergunta qual deseja usar, sem escolher automaticamente.
- Confirmar explicitamente com Junior se essa associação Auto↔Frota é regra oficial ou uma particularidade dos exemplos. Não presumir acesso a uma carteira inteira.

## Outros limites identificados no contrato original

- `/identity/resolve` só é fonte de informações **depois de `verified`** no mesmo protocolo/conversa.
- `verification_ref` tem 48 caracteres hex e é temporário; `verification_expired` obriga nova confirmação. O YAML indica que `expires_at=null` pode representar confirmação humana até o encerramento do protocolo. **O Phoenix ONE ainda rejeita `null` por segurança** até homologarmos o formato e o ciclo de vida dessa exceção.
- `verified_profile` só contém dados do titular e escopos permitidos. Nome confirmado com `profile.basic`, cidade/UF apenas para `quote/assistance` com `profile.location`, faixa etária só para produtos pessoais em cotação e com `profile.age_band`.
- `GET /requirements` está marcado **`x-status: proposto`**, não deve ser invocado pelos agentes.
- API é de consulta. Transferência humana ao departamento continua sujeita à confirmação do cliente e é executada pela gestão do Junior.
- O contrato não define `risk.empresa.read`, `risk.previdencia.read` nem outro escopo para dados completos dos produtos Empresarial, Vida Grupo, Previdência, Viagem, Pet etc. Eles continuam com apólices básicas apenas, até permissão documentada.
- Profissão, tipo da construção e coparticipação não estão cadastrados nos resumos documentados: não inferir esses valores.

## Testes e ativação
- Fixtures sintéticas com a estrutura **original** dos seis exemplos do Junior estão em `tests/megabrain-v41-original-junior-contract.test.js`. São verificadas as chaves, permissões, ocultação de dados sensíveis, referência vencida e Auto+Frota.
- **Feature flag ausente/desligada na produção**: `PHOENIX_ONE_V4_VERIFIED_CONTEXT`.
- `phoenix-one-bridge-v4-homolog`: ambiente isolado de teste. Não modificar `phoenix-one-bridge` live até aceite do Junior.
- Sem migrations nem alterações nos prompts mestres de Clara/Murilo.

## Pendências externas
1. Junior confirmar transporte seguro de `verification_ref` no `POST /api/v1/conversations/respond` a cada mensagem de continuidade.
2. Junior confirmar a combinação Auto+Frota retornada para `product_code=auto`.
3. Homologar presença ou ausência de `expires_at=null` com confirmação humana.
4. Definir futuramente os escopos específicos para Empresarial, Vida Grupo e Previdência e a remoção das consultas antigas baseadas em telefone.
