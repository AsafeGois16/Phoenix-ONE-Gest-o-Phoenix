# Laboratório Universal de Homologação · MegaBrain V4.1

## Objetivo
Criar uma área operacional de testes **isolada** do atendimento Phoenix ONE para avaliar, com dados fictícios, as regras determinísticas de classificação, continuidade, privacidade e confirmação de transferência entre Clara e Murilo.

Este laboratório **não executa o modelo de IA**, não consulta a gestão do Junior, não grava no Supabase, não envia WhatsApp, não cria protocolos reais nem modifica os prompts ativos. Os roteiros de conversa exibidos são exemplos predefinidos, não respostas reais da IA. A nota final mede as verificações de código, não a qualidade geral dos agentes.

## Acesso
Phoenix ONE → **MegaBrain** → **Abrir laboratório de QA** → aba **Universal V4.1 · QA**.

O classificador preexistente MegaBrain V2 é preservado em outra aba, **Classificador V2 · legado**, sem alteração de funcionamento.

## O que pode ser testado
O módulo `server/megabrain-universal-qa.js` contém **17 cenários**, todos com registros e diálogos fictícios:

| Família | Casos cobertos |
| --- | --- |
| Contexto verificado | Auto, Frota, Residencial, Vida, Saúde, Odonto |
| Segurança | Risco empresarial sem escopo, ausência de validação, referência expirada, nome/localização/faixa etária por escopo |
| Continuidade | Clara pede autorização para passar ao Murilo; aceite; recusa; introdução única; mudança de produto |
| Consentimento | Transferência humana somente após aceite; recusa explícita |

Cada cenário utiliza as **funções determinísticas reais** do Phoenix ONE, como `sanitizeV41Risk`, `v4VerifiedSummary`, `decideMuriloSwitch`, `enforceHumanHandoffConsent`, `dedupeClaraIntroductions` e `detectV41QuoteProduct`. Os cenários nunca chamam `/api/v1/conversations/respond`.

## Funcionalidades
- Seleção de cenários e filtro por família;
- Visualização do roteiro fictício;
- Execução de um caso ou de toda a suíte;
- Relatório de verificações aprovadas/falhas, com contagem e percentual;
- Exportação TXT local de um caso ou da suíte completa (sem dados pessoais);
- Nenhum armazenamento de resultados: recarregar a página limpa a execução.

## Regras de privacidade e isolamento
- Todos os registros são estáticos e fictícios, sem CPF/CNPJ, apólices reais, identidade de clientes, endereços completos, diagnósticos ou dados médicos.
- Nunca há requisições à OpenAI, ao Junior, ao Supabase ou aos agentes em execução.
- O frontend é exibido na área existente do MegaBrain; acesso administrativo permanece sujeito às regras normais do Phoenix ONE.
- Não há migrações, secrets, alteração de flags, webhook, troca de rota de produção nem atualização de `agent_versions`.
- A feature flag `PHOENIX_ONE_V4_VERIFIED_CONTEXT` permanece desligada, preservando os atendimentos atuais.

## Limitações importantes
- A nota **100%** é pontuação de cenários predefinidos e suas condições determinísticas; não garante que respostas geradas livremente pela Clara e pelo Murilo estejam certas.
- O roteiro mostra o **comportamento esperado**, não um diálogo produzido realmente por um LLM.
- Não verifica o retorno real da API do Junior, integração WhatsApp, tempo de resposta, autenticação de usuários reais ou manutenção de contexto em protocolos reais.
- Um próximo passo, após o Junior definir o transporte de `verification_ref`, será adicionar testes end-to-end de integração em ambiente controlado, com dados fictícios e validação humana.

## Como homologar
1. Abrir o MegaBrain e clicar **Abrir laboratório de QA**.
2. Em **Universal V4.1 · QA**, executar todos os cenários.
3. Conferir a quantidade de cenários e verificações aprovadas/falhas e inspecionar pelo menos Auto, Frota, Vida, Residencial e um caso de consentimento.
4. Baixar o relatório TXT para o controle interno; nenhuma informação de cliente é incluída.
5. Manter a integração V4.1 desligada até os testes reais com o Junior.

## Versionamento
- Nova biblioteca: `server/megabrain-universal-qa.js`.
- Novo painel: `src/MegaBrainUniversalLab.jsx`.
- Estilos: `src/megabrain-universal-lab.css`.
- Integração não destrutiva: `src/MegaBrainSandbox.jsx` e `src/MegaBrain.jsx`.
- Cobertura: `tests/megabrain-universal-qa.test.js`.
