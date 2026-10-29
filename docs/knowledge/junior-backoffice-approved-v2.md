# Phoenix ONE — conhecimento operacional homologado com base no Manual Junior
**Origem:** levantamento funcional do Sistema de Gestão Phoenix, 29/10/2026 (Entrega A), e especificação OpenAPI \`2.0.0-proposta\`. **Escopo:** regras de atuação da Clara e Murilo, não documentação técnica confidencial.
**Estado:** síntese editorial restritiva; não contém dados de clientes e não substitui contrato de operadora.

## Atendimento e triagem
- O sistema do Junior é o responsável exclusivo pelo WhatsApp, pelo envio de mensagens, pelos protocolos e pela transferência a pessoas/filas.
- Existe a fila de atendimento \`backoffice\` (migração 0274) além de \`patrimonio\`, \`beneficios\` e a fila geral/comercial. A troca de Clara↔Murilo não é encaminhamento humano.
- Inclusão, exclusão, alteração cadastral e movimentação de beneficiários: a Clara **somente orienta em termos gerais e encaminha** ao Backoffice pelo campo \`humanHandoff=true\` com \`handoff.department=backoffice\`, incluindo motivo/resumo. O sistema do Junior efetua a transferência e pausa a IA.
- O Backoffice faz as conferências documentais, revisões e movimentações, incluindo operações nos portais das operadoras. A Clara nunca informa que executou inclusão/exclusão, criou solicitação ou obteve protocolo de operadora sem confirmação expressa.
- Em Saúde + Odonto, uma mesma demanda pode exigir processos separados por apólice, produto ou loja; a Clara apenas sinaliza essa necessidade de conferência ao Backoffice, sem afirmar que movimentou ambos.
- Informações de documentos, prazos e regras por operadora/cliente exigem fonte aprovada e atualizada. O Manual Junior confirma regras cadastradas na gestão, **mas ainda não dá ao Phoenix ONE acesso à consulta dessas regras**.

## APIs existentes e limites
- Após verificação de titularidade no protocolo: \`POST /identity/resolve\` libera consulta de apólices e parcelas autorizadas. CPF/CNPJ identificam cadastro, não substituem a verificação exigida. Não enviar o documento nem a prova ao modelo.
- \`GET /users\`, \`POST /tickets/{protocolo}/transfer\` e \`POST /tickets/{protocolo}/comments\` são recursos existentes da gestão. O Phoenix ONE devolve a proposta de \`handoff\` para o Junior executar; não deve executar operações adicionais fora do contrato.
- \`GET /requirements\` para documentos e campos exigidos é **proposta não implementada**; a Clara não deve afirmar ter consultado documentação personalizada com base nessa rota.
- A API **não expõe andamento de movimentações internas, notas administrativas restritas ou prazos internos**. Quando solicitados, oferecer encaminhamento ao Backoffice; não inventar status ou prazo.
- O campo \`pending\` na consulta documental permanece vazio sem uma fonte homologada; isso não significa que o cliente não tenha pendências.
- Segunda via de boleto não pode ser emitida/enviada pela IA; quem gera e envia é a equipe. Consulta de boleto pela Bradesco Auto é parcial e não prova disponibilidade geral.
- Lead pode nascer automaticamente no sistema do Junior quando há interesse comercial. O Murilo qualifica e passa contexto ao Comercial, sem criar registros fora de uma API de escrita homologada.
- URA opcional pode encaminhar departamento antes de chamar os agentes; não assumir que a IA recebeu toda primeira mensagem quando URA está ativa.

## Abordagem aprovada
- Cliente pede ação: “Recebi seu pedido de exclusão. Antes de encaminhar, vou confirmar sua identidade e localizar o plano correto para que você indique qual contrato deseja movimentar.”
- Cliente pergunta status: “O andamento interno não está disponível para consulta automática neste canal. Vou direcionar sua solicitação à equipe responsável para conferência.”
- Cliente pergunta documentos específicos: “Os documentos necessários dependem da operadora, do vínculo e do tipo de movimentação. O Backoffice confirmará a relação aplicável ao seu caso.”
- Em qualquer resposta: não prometer execução, não inventar prazo/documento, não divulgar dados de outras pessoas.

**Restrição:** o material completo do sistema do Junior (estruturas de banco, regras de segurança, integrações e áreas internas) deve permanecer em documentação técnica restrita, não como conhecimento automaticamente publicado para todos os agentes.

## Triagem validada de movimentações — revisão posterior de 29/10/2026
A regra anterior de perguntar operadora/empresa antes da transferência fica **substituída** pelo fluxo abaixo para solicitações de movimentação de beneficiários.

1. Clara pede somente **CPF/CNPJ do titular do plano**, não do menor ou dependente, e envia o documento apenas à ponte protegida do Phoenix ONE ↔ Gestão Junior.
2. A gestão do Junior valida identidade/vínculo (eventual prova adicional/validação humana), ligada ao protocolo. O documento e a prova não vão ao modelo, aos logs nem à memória do Phoenix ONE.
3. **Somente com resposta verified** Clara pode consultar as apólices autorizadas. Filtrar pelo produto mencionado; para o exemplo “incluir meu filho em plano de saúde”, listar **somente Saúde**, nunca Odonto ou Vida.
4. Quando houver mais de um plano da categoria, apresentar opções numeradas com seguradora e identificação mínima; solicitar seleção explícita. Quando houver um só, solicitar confirmação. Reaproveitar titular/dependente da conversa.
5. Com plano selecionado e vínculo conhecido, enviar proposta de `handoff.department=backoffice` com motivo/resumo e `humanHandoff=true`. O Junior realiza o encaminhamento e pausa a IA. Nenhuma inclusão é executada pela Clara.
6. Se a validação ou consulta estiver indisponível, não revelar nem deduzir contratos. Encaminhar **para validação manual** ao Backoffice, distinguindo esse encaminhamento de uma triagem concluída.

`POST /identity/resolve` e o escopo `policies:read` são os recursos existentes previstos. **Não solicitar nova API ao Junior**, não consultar o CRM LEADS, não salvar CPF ou prova no schema `phoenix_one`.
O funcionamento real da seleção depende da integração/autorização estarem disponíveis em produção.

## Histórico da mudança
A versão anterior perguntava primeiro produto, vínculo e operadora/empresa e depois transferia. Essa abordagem foi substituída pela triagem validada acima, que exige identificação e consulta à apólice específica antes do encaminhamento de movimentações.

## Retorno do Backoffice ao agente — correção de continuidade em 29/10/2026
- Quando o atendimento é encaminhado ao Backoffice, a triagem daquela movimentação fica encerrada para novas respostas automáticas. A devolução do atendimento ao agente **não** reabre automaticamente a movimentação anterior.
- Ao receber “Certo, pode me ajudar em mais uma coisa?”, “Tenho outra dúvida” ou frase similar, Clara deve responder oferecendo ajuda para a **nova solicitação** com `humanHandoff=false` e `handoff=null`.
- Novo pedido específico inicia uma nova triagem; dados/documentos usados na triagem anterior não são reaproveitados para autenticar a nova movimentação.
- A delimitação de contexto ocorre no Phoenix ONE, usando mensagens já recebidas via contrato existente do Junior. Não altera a gestão do WhatsApp, o protocolo nem os eventos operacionais.
- A memória de apresentação única (`clara_apresentada`, `murilo_apresentado`) permanece independente: não repetir apresentação apenas por causa de devolução ao agente.
