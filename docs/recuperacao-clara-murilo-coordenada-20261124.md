# Plano de retorno controlado — Clara + Murilo

**Data:** 24/11/2026  
**Status:** preparação em laboratório; **não executar troca global de modo sem coordenação com Gestão Phoenix (Junior)**.

## 1. Decisão

A versão do backend atualmente em produção mantém o ramo original `clara_murilo` no `respondValidated`. O roteador `server/orchestration-operational.js` responde `delegate/legacy_unchanged` para esse modo. **Trocar a estratégia não exige necessariamente rollback integral de código, RAG ou prompts.**

O seletor atual, porém, é **global e lê o modo a cada requisição**. Trocar para `clara_murilo` **afeta inclusive protocolos em andamento**, com potencial de repetições ou transições não desejadas. A estratégia também depende da resposta do Bridge; falhas permanecem fail-closed.

## 2. Pontos de controle iniciais (confirmados na auditoria recente)

- Produção Vercel em commit `970e7b36a50633f5d62195987cb20eb5e4985731` no instante da verificação (confirmar novamente antes do procedimento).
- Estratégia global no Supabase: `clara_only`, revisão `6` no instante da verificação (reler antes de cada alteração).
- Agentes ativos em Supabase: Clara V12, Murilo V9 e Grazy Copy V4 (confirmar que não foram editados).
- Pull requests #78 (metadados product/intent para Junior) e #79 (integridade de agentes/RAG) permaneciam **draft** e **sem merge**. **Não mesclar para o retorno à estratégia original**.
- O Bridge de produção Supabase tem implementação diferente do arquivo `main` em partes V4 não homologadas. **Não publicar o Bridge a partir do GitHub como parte de simples troca de modo**.

## 3. O que Phoenix ONE consegue fazer agora sem Junior

1. Congelar merges e alterações nos prompts e nos RAGs durante a preparação; manter backups e SHA da produção.
2. Executar os testes automatizados `tests/recovery-clara-murilo-baseline.test.js` e regressões já existentes da orquestração.
3. Validar o ramo `clara_murilo` no código e em preview, sem alegar que preview equivale ao teste real com o Junior. O piloto real só roda no backend quando `VERCEL_ENV === 'production'`.
4. Preparar a matriz de evidências e o alerta ao Junior, combinando uma janela de troca de modo sem clientes ativos recebendo respostas.
5. NÃO editar diretamente `phoenix_one.orchestration_pilot_settings`, NÃO mexer nas Edge Functions e NÃO ativar `PHX_ORCHESTRATION_PILOT_ENABLED=false` sem um plano conjunto.

## 4. O que confirmar com Junior ANTES da troca em produção

- [ ] Quais protocolos estão com a Clara, com o Murilo e já atribuídos a pessoas no momento da troca?
- [ ] É possível pausar temporariamente novas respostas automáticas durante a janela de mudança?
- [ ] Qual comportamento do CRM/filas será usado quando o agente `murilo` assumir a cotação e quando a Clara encaminhar demandas operacionais?
- [ ] Quem observa o painel do Gestão Phoenix, novos leads e acionamentos durante os testes?
- [ ] Qual número de teste e quais protocolos fictícios ambos usarão?
- [ ] Quem pode pausar/resolver a janela se houver duplicidade, criação antecipada de lead ou reativação de protocolo humano?

## 5. Procedimento conjunto de alteração

1. **T-0**: ambas equipes confirmam versões, ambiente, acesso ao painel e responsável pela reversão; capturam `mode`/`revision` atuais e implantação Vercel.
2. **T-1**: Junior identifica e protege protocolos humanos e conversas ainda em andamento; prevenir respostas no meio da transição.
3. **T-2**: administração autorizada acessa Phoenix ONE → Integrações → Orquestração de agentes → seleciona **Clara + Murilo** (ação oficial `orchestration_pilot_set`, protegida por `revision`). **Não fazer SQL direto**.
4. **T-3**: conferir o modo e a nova revisão. Se a revisão mudou por outra pessoa, interromper; ler a configuração novamente.
5. **T-4**: no número de teste, executar cotação Auto, cotação Saúde, movimento Backoffice, segunda via boleto, sinistro com vítima, recusa de transferência, saudação única, passagem ao Murilo e bloqueio após atendimento humano.
6. **T-5**: Junior confirma filas/CRM/lead e atualiza as evidências de cada protocolo; registrar o que aconteceu no Phoenix ONE e Gestão Phoenix.
7. **T-6**: liberar atendimento em ondas somente após validação conjunta, monitorando por um período acordado.

## 6. Indicadores mínimos de aceite

- Cotação: Clara faz triagem; após autorização para SDR, Murilo assume e prossegue sem repetir coleta/saudação.
- Demandas operacionais: seguem Clara → setor correto, sem virarem lead comercial.
- Sinistros com vítima: instrução de segurança antes de comercial ou burocracia.
- Mensagens após atribuição humana: agentes não retomam o atendimento.
- Estado e protocolo: nenhum lead duplicado ou fila fantasma.
- Respostas do Bridge: nenhum `503` persistente e estratégia informativa correta `clara_murilo`.

## 7. Reversão

- Se a mudança de modo for a causa imediata de falha: interromper respostas, proteger protocolos humanos e avaliar retorno do seletor ao `clara_only` na revisão vigente; **retornar ao modo anterior não garante funcionamento saudável** porque esse foi o modo suspeito inicial.
- Se a falha for do Bridge ou integração, **não** substituir Edge Function V16 pelo arquivo divergente do GitHub nem reativar agentes sem contexto do Junior.
- Vercel: manter a implantação anterior como candidata de rollback **apenas se foi realizado deploy de código**.
- Após qualquer reversão, confirmar `mode`, `revision`, comportamento dos protocolos e CRM no número de teste.

## 8. Evolução posterior

Manter Somente Clara isolado nas PRs #78/#79 até a homologação conjunta dos 14 casos. Reavaliar com Junior uma melhoria de **fixação da estratégia por protocolo**: hoje isso NÃO é o comportamento atual e exigirá alteração de contrato, base e testes antes de entrar em produção.

## Mensagem de aviso sugerida ao Junior

"Junior, iniciamos a preparação do retorno ao fluxo original Clara + Murilo, preservando prompts, RAGs, MegaBrain e integrações. Os testes estão isolados no GitHub, sem alteração da produção. Antes de trocar a estratégia global, precisamos combinar uma janela curta, validar protocolos em andamento e testar o fluxo pelo seu CRM. Consegue confirmar quem poderá acompanhar as filas, leads e o estado de cada protocolo? Não faremos a mudança em produção sem seu alinhamento."
