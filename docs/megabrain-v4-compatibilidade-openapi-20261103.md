# MegaBrain V4 — conferência dos documentos do Junior (03/11/2026)

## Documentos examinados
- `cONTRATO fASE 2.pdf` — 8 páginas, impressão de `contrato-fase2.openapi.yaml`.
- `eXEMPLOS-rESULMO.pdf` — 8 páginas, impressão de `exemplos-resumo-verificado.json`.

Os PDFs contêm imagens das fontes, não os arquivos YAML/JSON originais. São suficientes para revisão visual e criação de fixtures, mas **não** para validação automatizada completa do schema OpenAPI. Solicitar os arquivos originais ao Junior antes da ativação.

## Campos e permissões (somente Fase 2)

| Campo | Documentado | Tratamento Phoenix ONE |
|---|---|---|
| `status` | `verified`, `verification_required`, `verification_expired` e outros | Apenas `verified` libera os dados protegidos |
| `verification_ref` | Comprovante hex de 48 caracteres; válido por 30 min sem consulta e até fechar/reabrir protocolo | Apenas server-to-server; deve coincidir com protocolo/conversa verificados; rejeita referência inválida |
| `verified_at`, `expires_at` | ISO timestamp com offset e fração de segundos (5 casas no exemplo) | V4 reconhece até 9 casas; exige expiração futura |
| `field_scopes` | `profile.basic`, `policies.read`, `risk.auto.read`, `risk.frota.read`, `risk.residencial.read`, `risk.vida.read`, `risk.saude.read`, `installments.read`, `profile.location`, `profile.age_band` | Perfil só se `profile.basic`; dados Auto só se `risk.auto.read`; apólices e parcelas só se escopos específicos estiverem presentes |
| `verified_profile` | `nome_tratamento`, `tipo_pessoa`, `relacao_com_contrato=titular`, `perfil_atualizado_em`; campos extras conforme finalidade | A primeira fase usa apenas nome de tratamento do titular após validação |
| `data_freshness` | `profile: {source: cadastro_gestao, updated_at: ...}`, equivalente para `policies` | Preserva objeto com fonte/data, somente chaves permitidas; não aceita texto arbitrário |
| `policies[].risk_summary.vehicle` | `marca`, `modelo`, `versao`, `ano_fabricacao`, `ano_modelo`, `zero_km`, `marca_modelo` | Apenas na cotação Auto com escopo `risk.auto.read`; não copia placa/chassi/renavam |
| `purpose` | `policies_and_installments`, `service`, `quote`, `assistance` | `quote` exige produto ou número e omite parcelas |
| `product_code` | Auto/Moto/Frota/Residencial/Empresarial/Vida/Vida Grupo/AP/Saúde/Odonto/Previdência/Viagem/Pet/Bike/Fiança/Garantia/RC/`outros` | Enum atualizado com `outros` |

## Limites expressos no documento do Junior
- API Fase 2 somente de **consulta**; nenhuma criação/alteração/exclusão ou consulta de andamento de processo.
- `/requirements` está **proposto**, não homologado como disponível.
- Documento e prova ficam na conversa e são repassados diretamente ao sistema de gestão; **nunca são enviados à OpenAI**.
- Sem dados de condutor, dependente, beneficiário, prontuário, placa, chassi, Renavam, endereço residencial completo ou documento no resumo disponibilizado a agentes.
- Troca de Clara para Murilo **não é transferência humana**; exige consentimento já definido nas regras Phoenix ONE.
- Na falta de campo, tratar como **não cadastrado/desconhecido**, nunca como ausência de cobertura ou produto.

## Cenários incluídos nos PDFs
1. Clara consulta Auto após CPF/prova (`purpose=service`).
2. Murilo usa `verification_ref` e `product_code=auto` para cotação.
3. Murilo consulta Residencial (resumo de ocupação/localização parcial).
4. Murilo consulta Vida (faixa etária e capital segurado).
5. Clara consulta Saúde Empresarial por CNPJ/prova (vidas agregadas, sem dados de dependentes).
6. Referência vencida: `verification_expired`, nova validação documental necessária.

## O que foi corrigido nesta branch
- Permissões reais `profile.basic`, `risk.auto.read`, `policies.read`, `installments.read`.
- `data_freshness` com fonte e data, timestamps ISO com precisão do Junior, `outros` em produtos.
- Rejeição de `verification_ref` não hexadecimal.
- Limitação explícita do risco ao produto Auto, sem permitir que escopos de outros ramos liberem risco Auto.
- Fixtures de teste com a estrutura real dos PDFs, além dos testes anteriores de apresentação, consentimento, identidade e MegaBrain.

## Pendência técnica que exige Junior
**Como o servidor do Junior envia `verification_ref` ao Phoenix ONE a cada mensagem seguinte?**

O OpenAPI descreve como o comprovante é retornado e reutilizado em `POST /identity/resolve`, **mas não descreve** o transporte até o endpoint serverless `POST /api/v1/conversations/respond` do Phoenix ONE.

**Sugestão contratual:** incluir opcionalmente `verification_ref` no corpo server-to-server autenticado desse endpoint, junto de `conversation_id` e `protocolo`. Nunca injetar referência nas mensagens WhatsApp, na conversa integral, no MegaBrain ou em logs. Confirmar opção com Junior e complementar os arquivos YAML/JSON originais.

## Estado de implantação
- Adaptador V4 da aplicação permanece atrás de flag Vercel `PHOENIX_ONE_V4_VERIFIED_CONTEXT` (ausente/desligada em produção).
- Edge Supabase com V4 está isolada em `phoenix-one-bridge-v4-homolog`; a Edge `phoenix-one-bridge` dos atendimentos reais não deve ser substituída até homologação.
- Sem migração de banco, sem ativar dados pessoais para o MegaBrain V3, sem alteração dos prompts Clara V8/Murilo V4.
