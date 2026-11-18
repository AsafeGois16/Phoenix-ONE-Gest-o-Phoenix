# Orquestração de agentes — Fase 1 (prévia)

## Escopo
- Seletor no Phoenix ONE: `clara_murilo` (padrão) ou `clara_only`.
- Configuração de ensaio em armazenamento local com chave exclusiva; protocolo fictício captura o modo ao iniciar. Nenhum dado do cliente é persistido.
- Simulador determinístico: identificar produto, distinguir relacionamento/urgência, pedir aceite, propor encaminhamento comercial humano sem qualificar pelo Murilo no modo somente Clara.
- Somente Clara + Murilo demonstra o caminho Clara → aceite → Murilo. Os estágios de qualificação completos continuam no fluxo original, não são reproduzidos pelo simulador.
- Destinos lógicos: `auto_re`, `health`, `life`, `other`. São rótulos de homologação, nunca códigos de filas reais do Junior.

## Isolamento
Nenhum novo endpoint operacional, alteração de prompt/RAG, migration aplicada, chamada à IA, ticket, WhatsApp ou escrita no banco. O seletor não é consumido pela API de produção. A implementação de preview deve permanecer em branch separada, com PR draft, sem merge/promoção.

## Etapa posterior — contrato a validar separadamente
Somente após aprovação:
1. Definir persistência central isolada e versionada do modo (preferência Phoenix ONE, atualização apenas por owner/admin autorizado, registro de revisão, padrão `clara_murilo`).
2. Fixar a revisão do modo no início de cada protocolo real. Protocolos existentes mantêm seu modo. Não confundir mudanças de preferência com transferência humana, retorno, encerramento ou reinício de atendimento.
3. Integrar decisão ao handler de conversas preservando os guards atuais de urgência, identidade, movimentações, financeiro, consentimento, memória de protocolo e bloqueio de tickets atribuídos a humano.
4. Verificar mapa de filas comerciais no Junior para cada produto. Não reutilizar automaticamente a fila operacional Backoffice como Comercial Saúde/Benefícios, nem assumir que uma fila especializada existe.
5. Homologar ponta a ponta em ambiente de teste; não publicar nem ativar sem autorização.

## Testes
Executar `node --test tests/orchestration-preview.test.js` e `npm run build`. Verificar visualmente modo inicial, recarga da página, alternância, novo protocolo, produto indefinido, aceite, recusa, retorno a assunto operacional e tentativa de continuar protocolo fictício encerrado.
