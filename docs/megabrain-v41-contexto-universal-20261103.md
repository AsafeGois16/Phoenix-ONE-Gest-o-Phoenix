# MegaBrain V4.1 — Contexto Universal de Seguros

## Estado e segurança
Implementação **preparada, sem ativação para clientes**. O V4 continua dependendo de duas flags que devem estar explicitamente `true` tanto no Vercel quanto na Supabase Edge `phoenix-one-bridge`. Até a homologação conjunta com Junior, não criar essas flags. O endpoint de respostas existente segue o comportamento atual. Nenhuma tabela ou prompt dos agentes foi alterado.

A fonte de dados é exclusivamente a API do Junior após `status=verified`, com `verification_ref` válido e vinculado à mesma conversa e protocolo, finalidade declarada e escopos autorizados. O Phoenix ONE não obtém identidade pelo WhatsApp e não lê detalhes de coberturas das observações inferidas do MegaBrain V3.

### Matriz de liberação do resumo de risco

| Produto | Permissão exigida pelo Junior | Grupo de `risk_summary` | Campos que o Phoenix ONE permite |
| --- | --- | --- | --- |
| Auto/Moto | `risk.auto.read` | `vehicle` | marca, modelo, marca_modelo, versão, ano fabricação/modelo, zero km |
| Frota | `risk.frota.read` | `fleet` | quantidade de itens ativos e até 50 itens com item_ref lógico, numero_item, marca_modelo e ano_modelo |
| Residencial | `risk.residencial.read` | `property` | tipo_ocupacao; atividade_risco se cadastrada; cidade_uf e cep_prefixo somente em `quote/assistance` com `profile.location` |
| Vida/AP | `risk.vida.read` | `insured_person` | capital_segurado numérico; faixa_etaria apenas quando `profile.age_band`, `quote` e produto elegível |
| Saúde/Odonto | `risk.saude.read` | `benefits` | operadora, modalidade, mes_reajuste, quantidade_vidas agregada, plano_titular |
| Empresarial, Vida em Grupo, Previdência, Viagem, Pet, Bike, Fiança, Garantia, RC e outros | **Sem escopo de risco específico homologado** | *Não libera risk_summary* | Apenas metadados das apólices, quando `policies.read` estiver autorizado |

**Importante:** a documentação do Junior mostra dados de risco para Empresarial, Vida em Grupo e Previdência, mas não especifica um escopo dedicado para esses grupos na lista disponível. Não deduzimos um escopo por semelhança. Essa extensão poderá ser conectada quando a gestão confirmar a permissão exata. Também não presumimos tipo de construção, profissão, coparticipação ou dados de viagem, Pet e Fiança, porque são informados como não cadastrados.

### Perfil básico
- `nome_tratamento`: apenas `profile.basic` e vínculo confirmado de titular.
- `cidade_uf`: apenas `profile.location` e finalidade `quote/assistance`.
- `faixa_etaria`: apenas `profile.age_band`, finalidade `quote`, produtos Vida, AP, Saúde e Odonto; nunca data de nascimento nem idade exata.
- Nenhuma profissão, documento, endereço residencial completo, beneficiário, condutor, CID, diagnóstico ou prontuário é disponibilizado.

### Continuidade comercial Clara ↔ Murilo
1. Cliente consulta ou solicita atendimento: Clara continua seguindo regras de identidade, triagem, produto e consentimento para troca.
2. Cliente solicita uma nova cotação: Murilo só consulta o produto expresso em uma mensagem de cotação e em contexto autenticado.
3. A consulta ao Junior usa `purpose=quote` e `product_code` específico, nunca carteira inteira; não inclui parcelas.
4. O bridge aplica o filtro novamente antes de liberar apólices e o servidor reaplica whitelist de risco e perfil.
5. Se houver várias apólices ou itens de Frota, não escolhe a primeira: pergunta ao titular.
6. Se houver ausência de cadastro ou falta de escopo, não inventa características, capital ou cobertura; pergunta o dado faltante.

### Validações já disponíveis
- Módulos puramente determinísticos: `server/v4-universal-risk.js` e `server/v4-verified-context.js`.
- Validação e filtragem na Bridge `supabase/functions/phoenix-one-bridge/index.ts` e defesa adicional em `server/junior-v1.js`.
- Continuidade de Murilo no endpoint de resposta, somente atrás de `PHOENIX_ONE_V4_VERIFIED_CONTEXT=true`.
- Testes para segregação de produtos, escopos ausentes, ocultação de campos sensíveis, múltiplas apólices/Frota, localização e faixa etária, expiração e fallback legado.

## Pendências antes de ativar
1. Junior encaminhar **YAML OpenAPI e JSON de exemplos originais**, não apenas prints em PDF, para conferência automática de caminhos/chaves.
2. Junior confirmar transporte server-to-server opcional de `verification_ref` nas chamadas posteriores a `/api/v1/conversations/respond`.
3. Confirmar quais escopos permitem `property` em Empresarial, `benefits` em Vida Grupo, `pension` em Previdência e eventual `risk.saude.read` para Odonto.
4. Homologar com Junior em ambiente de teste usando dados fictícios: Auto, dois itens de Frota, Residencial, Vida/AP, Saúde/Odonto, protocolos fechados/reabertos e faltas de escopo.
5. Revisar e restringir as rotas antigas de consulta de apólices por telefone antes da liberação geral.

**Não modificar o sistema do Junior, não criar migrations e não ativar as flags durante esta preparação.**
