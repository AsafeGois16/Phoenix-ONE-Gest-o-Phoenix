# Phoenix ONE × Gestão Phoenix — cotação Auto/RE com consulta simples à existência de Seguro Auto

**Data:** 24/11/2026 | **Status:** implementado em preview; NÃO ativar consulta real até homologação conjunta com Junior.

## Regra aprovada pela Phoenix

Em uma RENOVAÇÃO de Seguro Auto, NÃO localizar ou selecionar automaticamente o veículo. Após identificação e confirmação do vínculo de acesso no Gestão Phoenix, consultar somente a categoria **Seguro Auto**:

1. Cliente inicia cotação/renovação; Clara acolhe, coleta nome e solicita aceite para trocar para Murilo.
2. Murilo aproveita informações já informadas, identifica CPF ou CNPJ e pede **opcionalmente o número do documento do titular**. É uma chave de busca, NÃO autenticação. Se cliente não quiser informar, seguir a triagem normal; não repetir a solicitação.
3. O Gestão Phoenix confirma a identidade/vínculo para o **mesmo conversation_id + protocolo**, usando sua rota autenticada de identity/resolve (purpose=quote, product_code=auto). Nenhuma política de acesso é decidida por telefone, nome, CPF/CNPJ isoladamente ou LLM.
4. Apenas se retornar status=verified, validade atual, escopo policies.read e pelo menos uma policy com product_code=auto, Murilo pergunta:

   > Encontrei um Seguro Auto cadastrado após a confirmação de identidade. Posso encaminhar sua renovação diretamente à equipe Auto/RE?

   Não dizer marca/modelo, placa, vigência, seguradora, número de apólice ou quantos veículos encontrou.
5. Se o cliente responder **SIM**, revalidar o contexto verificado no Junior neste turno e enviar a fila real de **Auto/RE**: humanHandoff=true, handoff.department=patrimonio, intent=nova_cotacao, product=auto. O consultor humano identifica o veículo aplicável, sem seleção automática pela IA.
6. Se responder **NÃO**, voltar ao roteiro aprovado do Murilo, aproveitando os dados anteriores; nenhuma transferência e nenhum lead criado pelo aceite negado.
7. Sem Seguro Auto, sem autorização, erro de consulta, documento inválido, verificação expirada ou mais de um vínculo possível: não alegar cadastro confirmado; prosseguir com triagem (ou validação/humano se a companhia exigir), nunca retornar informações privadas de contrato.

## Demais produtos Auto/RE

O pedido **opcional e único** do número CPF/CNPJ do titular foi preparado para todos os 12 códigos: auto, frota, residencial, fianca, viagem, bike, empresarial, equipamentos, rc, cyber, garantia e credito. A verificação rápida de existência de Seguro Auto só é aplicável ao produto auto com intenção de renovação; **não simular lookup** dos outros produtos se a rota específica não existir.

## Contrato técnico já existente e pendências Junior

Phoenix ONE usa authenticated POST à Supabase Bridge, action=identity_context, v4=true, purpose=quote, productCode=auto, e verificação de protocolo/conversation_id. A Bridge pede ao serviço Junior identity/resolve com purpose quote, product_code auto e documento ou verification_ref vinculada.

Para ativação:
- Junior confirma que identity/resolve suporta esse filtro e que retornos verified declaram somente policies autorizadas (field_scopes inclui policies.read), sem depender de telefone ou CPF sozinho.
- O verification_ref do Junior deve ser válido para o mesmo protocolo e persistir no próximo turno para que o SIM continue verificado. O Phoenix ONE consulta novamente antes de gerar handoff.
- Junior confirma no CRM que department=patrimonio é a fila **Auto/RE**, não Comercial; lead nasce somente depois do aceite, com atribuição humana.
- Se o cliente não tiver Seguro Auto cadastrado, o Junior deve retornar verificado com lista de apólices Auto vazia, sem escolher risco aleatoriamente.
- Implementar comunicação operacional sobre verificação pendente/recusada conforme política de identidade do Junior; não registrar CPF/CNPJ ou prova no prompt, RAG, MegaBrain ou logs.
- No backend atual, habilitar primeiro em ambiente controlado. Três flags são necessárias: PHX_AUTO_RE_DOCUMENT_INTAKE=true, PHX_AUTO_RE_VERIFIED_LOOKUP=true e PHOENIX_ONE_V4_VERIFIED_CONTEXT=true, além da autorização de escopos no Supabase/Junior. O estado atual de produção NÃO foi alterado nesta PR.

## Segurança de rollback

As novas rotas ficam atrás de flags server-side, por padrão OFF. Caso a verificação de produção ainda não esteja disponível, continuar o roteiro de triagem já existente. Desabilitar a flag de lookup para interromper consultas novas; não fazer migrations, reescrever prompts/RAGs, nem alterar configurações do Junior antes de homologação.

## Testes de aceitação

- AUTO já cadastrado, verificação válida: pergunta somente existência, sem citar veículo.
- SIM e contexto ainda verificado: fila Auto/RE, intenção e produto corretos, IA pausada.
- NÃO: segue a triagem; não cria lead, não reoferece consulta.
- Auto não encontrado: não inventa cadastro, segue perguntas do Murilo.
- Consulta expirada/indisponível: não permite handoff via resposta SIM anterior.
- Documento não informado ou recusado: continuar sem loops.
- Para os 12 produtos Auto/RE, número CPF/CNPJ solicitado só uma vez e não tratado como prova de identidade.
- Segurança para outros seguros, operacional/Backoffice, emergências e sem vazamento de dados pessoais.
- Bateria automatizada: 686 testes, 0 falhas, prévia Vercel READY no último commit de código testado.
