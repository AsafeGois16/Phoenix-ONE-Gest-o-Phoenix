# MegaBrain V2.1 — autorização por protocolo (homologação)

## Escopo operacional
Somente administradores `owner/admin` do Phoenix ONE podem ativar ou desativar a observação em um protocolo específico **já registrado, não expirado e na etapa `with_agent`**.

- A autorização dura até 30 minutos, no máximo até o vencimento do estado do protocolo.
- Não é permitido ativar protocolo encerrado ou entregue a atendente humano.
- A autorização é vinculada ao par protocolo + UUID de conversa; o mesmo protocolo não permite cruzar informações de outra conversa.
- O administrador confirma conscientemente, em uma janela de confirmação, que se trata de teste de homologação.
- A desativação revoga a autorização imediatamente. Observações anteriores, se existirem, permanecem apenas até a expiração prevista e não são usadas por agentes.
- Captura exclusivamente marcadores categóricos já autorizados no V2: assunto, produto, próxima etapa, pendência e marcas não pessoais.
- O conteúdo integral das mensagens nunca é gravado no MegaBrain.

## Fluxo
1. Administrador abre MegaBrain e escolhe um protocolo **com agente ativo**.
2. Em Contexto compartilhado, clica em **Ativar observação deste protocolo por 30 minutos**.
3. Confirma a autorização para teste. A Edge Function valida JWT e papel administrativo; consulta o estado operacional e grava na tabela isolada `megabrain_protocol_grants`.
4. Envia-se uma nova mensagem no canal de teste do Junior; somente modo automático com contexto reconhecido poderá observar.
5. A Edge Function `phoenix-one-megabrain-context` exige token do bridge e autorização ativa **antes de gravar** a categoria. Se não houver permissão, devolve `accepted:false` e não grava nada.
6. O administrador clica **Atualizar** no bloco contextual para inspecionar a observação.
7. Ao terminar, clica em **Desativar observação deste protocolo**.

## Interruptor global e segurança
A captura do Vercel ainda depende de `PHOENIX_MEGABRAIN_SHADOW=true` em produção. O valor habilita somente a chamada ao endpoint para mensagens classificáveis; **não** concede autorização a nenhum protocolo. A tabela privada é o único mecanismo que permite a gravação.
O helper de captura tem timeout máximo de 650ms, não modifica a resposta e ignora falhas. O interruptor global pode ser removido/desativado se houver regressão.

## Implantação segura
1. Rodar a suíte de testes e confirmar preview READY.
2. Criar tabela `phoenix_one.megabrain_protocol_grants` por migration aditiva.
3. Publicar **primeiro** a nova Edge Function com bloqueio por autorização. Confirmar versão e código.
4. Habilitar o interruptor global no Vercel somente após a Edge protegida estar pronta.
5. Fazer merge do painel e validar build de produção; inicialmente não há protocolos autorizados.
6. Testar somente com protocolo de homologação; nunca inserir documentos ou dados pessoais no cenário.

## Regra de proteção
Clara, Murilo, Knowledge Hub, API do Junior, roteamento e memória V1 não são modificados. Nenhum protocolo é autorizado automaticamente.
