# MegaBrain V4 — primeira etapa: perfil verificado + comprovante + risco Auto

**Fonte técnica:** resposta do Sistema de Gestão Phoenix de 03/11/2026, `resposta-resumo-verificado.pdf`, v1.0 (9 páginas). A resposta informa implementação aditiva **DESLIGADA** no sistema do Junior. Esta adaptação do Phoenix ONE também está **DESLIGADA por padrão**.

## Escopo implementado no Phoenix ONE

1. **`verified_profile`**: utiliza apenas `nome_tratamento` liberado pela API verificada, quando `field_scopes` explicitamente autoriza o perfil e `relacao_com_contrato=titular`. O nome não é inferido de telefone, nome do WhatsApp ou mensagens.
2. **`verification_ref`**: o Phoenix ONE aceita referência opaca de 48 caracteres enviada em `POST /api/v1/conversations/respond` pelo servidor **autenticado** do Junior, e pode encaminhá-la a `/identity/resolve` em lugar de documento, somente após ligar a feature flag. O backend do Junior deve confirmar novamente `status=verified`, o **mesmo `conversation_id` e `protocolo`**, e `expires_at` futuro. Comprovante inválido ou vencido não libera dados.
3. **`purpose` e `product_code`**: para cotação do mesmo Auto, solicita `purpose=quote` e `product_code=auto`; a resposta é filtrada novamente no bridge para não vazar outros produtos, sem parcelas. As consultas legadas continuam enviando `policies_and_installments` quando a flag está desligada.
4. **`risk_summary.vehicle`**: reconhece `marca`, `modelo`, `marca_modelo`, `versao`, `ano_fabricacao`, `ano_modelo`, `zero_km`; jamais copia `placa`, `chassi`, `renavam` ou condutores. Murilo não pergunta novamente modelo/ano quando os dados verificados estão presentes. Diversos Autos continuam exigindo escolha do veículo.
5. **`field_scopes`, `verified_at`, `expires_at`**: campos de segurança validados, e o `data_freshness` só aceita grupos previamente conhecidos. Não se grava nenhum desses dados no MegaBrain, logs, RAG ou banco do Phoenix ONE.
6. **Regressão**: preserva caminhos legados de identidade, Backoffice, Clara V8, Murilo V4, consentimento antes das transferências, MegaBrain V3 e respostas atuais quando V4 desligado.

## Flags para homologação, não ativar prematuramente

| Ambiente | Variável | Default |
| --- | --- | --- |
| Vercel (Phoenix ONE) | `PHOENIX_ONE_V4_VERIFIED_CONTEXT` | ausente/desligada |
| Supabase Edge (`phoenix-one-bridge`) | `PHOENIX_ONE_V4_VERIFIED_CONTEXT` | ausente/desligada |
 
**Somente o valor exato `true` habilita.** Sem ligar ambos, recursos novos não são utilizados. Não criar variáveis em produção antes de homologação conjunta.

## Ponto pendente do contrato — IMPORTANTE

O PDF informa que `verification_ref` é retornado por `/identity/resolve`, mas **não especifica como essa referência chega em TODAS as chamadas seguintes do Phoenix ONE**, que usa funções serverless sem sessão local persistente. O código optou por **não armazenar a referência em banco ou no MegaBrain**. Para reutilizá-la sem pedir documento:
- a gestão do Junior deverá incluir opcionalmente a referência válida no **corpo server-to-server autenticado** de `POST /api/v1/conversations/respond`, sob a propriedade `verification_ref`, apenas no mesmo protocolo e conversa; **nunca em `messages` ou no WhatsApp**; **OU**
- acordaremos, em etapa separada, um cofre temporário criptografado e auditável de referências, com revogação imediata por fechamento/reabertura.

Precisamos confirmar a **forma exata de `field_scopes`**, o esquema de `policies[].risk_summary.vehicle`, o escopo de documentos em `quote` e o comportamento de token expirado lendo o arquivo `contrato-fase2.openapi.yaml` do Junior. Os campos usados nos testes são **fixtures fictícios**, não a prova de compatibilidade com o JSON real.

## Critérios de aceite conjuntos

- Chave desligada: **sem alteração de comportamento** em todos os testes existentes.
- Cliente sem validação: nenhum `nome_tratamento`, veículo, risco ou apólice privada.
- Perfil confirmado: nome de tratamento do titular, nunca telefone como prova.
- Clara pergunta se pode transferir para Murilo; com consentimento e `verification_ref` válido, Murilo continua sem pedir CPF/CNPJ ou prova novamente.
- Ref vencido, alterado, de outra conversa, protocolo reaberto ou encerrado: não liberar dados e orientar nova verificação.
- Cotação Auto: apenas Auto; múltiplos veículos pedem seleção; sem `risk_summary`, Murilo pergunta o dado faltante, sem inventar.
- Dados ausentes = **não cadastrado/desconhecido**, nunca prova de ausência de cobertura.
- Revisão das rotas antigas GET /policies, /installments, /conversations/{id}/context que ainda expõem apólices por telefone, antes de ativar em produção.
- Auditoria sem documentos/ref/sensíveis; supervisão LGPD e autorização formal bilateral.

## Planejamento

PR de código atrás de duas flags OFF. **Nenhuma alteração de schema necessária** nesta fase. Só ativar depois de receber o YAML oficial e completar os cenários de homologação com o Junior. Para desligar imediatamente, retirar/desligar qualquer uma das duas flags.
