# Phoenix ONE — Regularização das sete RAGs de alta prioridade

**Data:** 05/11/2026  
**Escopo:** edição exclusiva de conhecimento no schema `phoenix_one` do Supabase.  
**Solicitação:** corrigir as sete bases de alta prioridade da auditoria, **sem modificar os prompts mestres**.

## Controle de integridade

- **Clara V12** permanece ativa com MD5 do prompt `cd2737e43d54a29a517bb51fbe5f5d93`, 38.195 caracteres.
- **Murilo V9** permanece ativo com MD5 do prompt `2525f67fae1ad46a698bc1e4639c9f86`, 15.801 caracteres.
- Foram geradas **sete novas versões V2**, mantendo as sete V1 integrais no banco como `archived`.
- Publicação realizada de modo transacional, com validação de versões, trechos e hashes; **sete eventos de auditoria** `knowledge_document_version_published`.
- Foram preservados os 23 documentos publicados e 156 trechos publicados: 14 documentos / 112 trechos de Clara e 9 documentos / 44 trechos de Murilo.
- Os 59 trechos dos documentos revisados incluem nota de compatibilidade V2; os trechos mais problemáticos foram reescritos diretamente. Os demais trechos foram preservados para manter conteúdo técnico e histórico aplicável.
- Não houve alteração de conexões, flags, prompts, Edge Functions, Vercel, integração Junior/4Zapy, WhatsApp nem CRM LEADS.
- As revisões derivadas de arquivos antigos em PDF foram armazenadas como conteúdo textual; o PDF de origem permanece referenciado na versão arquivada.
- `reviewer_id` e `reviewed_at` das V2 ficaram vazios; o trabalho foi publicado por solicitação do usuário, sem atribuir falsamente uma aprovação humana nominativa.

## Inventário e rastreabilidade

| Documento corrigido | Trechos | Documento original V1 | Documento publicado V2 | Situação |
|---|---:|---|---|---|
| Clara — Fluxo de Trabalho e Transferências 4.5 | 21 | `e637b191-fe8b-4785-a1a0-25a295888add` | `571fd8e0-6191-4750-ba4f-0677e121e266` | Arquivada V1 → publicada V2 |
| Clara 02 — Fichas de cotação por produto | 9 | `d0e68a90-a6bd-4809-ba88-d7464cd34fa6` | `e49899be-30f0-49dd-b7af-d1530c866f72` | Arquivada V1 → publicada V2 |
| Clara 07 — Clientes existentes | 5 | `4ae9ea9b-6156-4202-a72a-0e22576ccf44` | `16f5032f-94b3-4594-b4e1-6a1f20e20e42` | Arquivada V1 → publicada V2 |
| Clara 08 — Atendimento comercial consultivo | 5 | `0ded9c8a-84bf-4100-937e-a5f473bccdff` | `ec5a6f51-c916-477a-a711-3afc746f8d05` | Arquivada V1 → publicada V2 |
| Clara 09 — Linguagem humana e triagem adaptativa | 10 | `18c26f1c-d212-4285-9b1a-b9a7599188b0` | `0a4ac502-6e26-46e5-b2eb-2204811568af` | Arquivada V1 → publicada V2 |
| Murilo 08 — Integração comercial com o Sistema de Gestão Phoenix | 5 | `5ffa7fcf-ef7a-4673-9f34-c7f2ab820e66` | `2d1e21f7-f02a-4efc-a0e1-40eda80e7461` | Arquivada V1 → publicada V2 |
| Sistema Junior — Procedimentos de Backoffice | 4 | `25e7fbc3-380f-425a-8843-f5a4359341d0` | `382d555f-4ee1-4aa3-baae-67c8f35f260e` | Arquivada V1 → publicada V2 |

## Regras alinhadas

1. **Clara — Fluxo de Trabalho e Transferências:** atendimento inicial e classificação pela Clara; cotação/renovação só passa ao Murilo após consentimento. Registros e transferências condicionados ao sistema.
2. **Clara 02 — Fichas de cotação:** fichas preservadas como conhecimento para qualificação técnica do Murilo e consultores; nunca etapa obrigatória de coleta inicial da Clara; dados pessoais em etapa segura.
3. **Clara 07 — Clientes existentes:** inclusão e exclusão de dependentes referenciadas ao Backoffice, distinguindo de dúvidas/assistência de Benefícios; dados privados sujeitos a verificação.
4. **Clara 08 — Comercial consultivo:** substituir a condução de venda pela Clara por acolhimento e passagem autorizada ao Murilo.
5. **Clara 09 — Linguagem humana:** remover exemplos de pedido comercial precoce de nascimento/endereço e evitar falso registro; preservar apresentação única e linguagem natural.
6. **Sistema Junior — Backoffice:** orientar dúvida geral sem handoff automático; movimentação real requer identidade/vínculo verificados, apólice selecionada, consentimento e confirmação efetiva do Junior.
7. **Murilo 08 — Integração comercial:** uma pergunta principal, continuidade do contexto, sem prometer transferência, lead, agenda ou proposta não realizados. Tratar assunto administrativo sem tentar seguir a venda.

## Evidências da verificação

- `knowledge_documents`: para cada título há **uma V1 arquivada e uma V2 publicada**.
- `knowledge_chunks`: contagens idênticas antes e depois do versionamento; todos os 59 trechos V2 contêm prefixo de compatibilidade com o respectivo prompt mestre.
- Buscas SQL de verificação em termos como `quero cotar seguro auto`, `quero cotar seguro residencial` e `Você já enviou minha proposta?` recuperaram trechos V2 pertinentes. Os trechos V1 arquivados não foram retornados.
- Padrões obsoletos específicos foram conferidos com contagem zero nos sete documentos V2.
- Os documentos não corrigidos nesta fase incluem **seis com ajustes médios e dois com ajustes editoriais baixos**; alguns continuam sendo recuperáveis, portanto a regularização completa das RAGs ainda está pendente.
- Os embeddings seguem nulos, como antes; a busca permanece textual (português). Não foi executada nova vetorização.

## Homologação remanescente

A publicação técnica das sete bases está concluída. **Falta reteste conversacional** no Laboratório RAG e no número exclusivo de testes do Junior, em especial:

1. Clara recebe cotação Auto e, após aceite, Murilo assume sem repetir dados.
2. Clara atende pedido de exclusão odontológica e distingue orientação genérica de movimentação com validação de identidade.
3. Murilo abandona temporariamente a cotação quando surge uma demanda Backoffice; não inventa requisitos, registro nem transferência.
4. Consultas privadas nunca revelam apólice, boleto ou vínculo sem confirmação real de identidade e escopo.
5. Não há apresentações duplicadas, inclusive após troca de agente ou reabertura de histórico.

**Importante:** a publicação da RAG não comprova o comportamento fim a fim da integração e não implica aprovação para atendimento real sem supervisão.
