# Reteste de atendimento — Phoenix ONE + Gestão Phoenix
**Data:** 24/11/2026  
**Origem do incidente:** captura do WhatsApp (Murilo perguntou sobre hospitais da rede; resposta: "Gostaria do Hospital Nipo Brasileiro, na região da Zona Norte"; o sistema passou para Clara e disparou urgência médica indevida).  
**Mudanças:** correção de falso positivo de urgência por nome de hospital, continuidade comercial de Murilo e diferenciação entre preferência de rede e solicitação operacional.  
**Ambiente:** desenvolvimento/preview, sem publicação automática.

## Como executar

1. Para cada caso, usar protocolo de teste fictício independente. Não reutilizar protocolo, CPF, telefone pessoal nem dados clínicos reais. Registrar timestamp, modo, agente exibido, resposta, `handoff`, fila e lead.
2. Iniciar testes somente com a estratégia `clara_murilo` em número de teste do Junior; simular as mesmas frases no laboratório Phoenix ONE.
3. Quando disponível o laboratório `clara_only`, repetir testes relevantes sem alterar a configuração global de produção.
4. Cada cenário deve ser aprovado em **ambos os sistemas**. Os testes automatizados não comprovam a apresentação no WhatsApp ou a atuação do CRM.
5. Não assumir rede/hospital credenciado como fato sem fonte contratual verificável; Murilo registra preferência e a equipe confirma disponibilidade depois.

## Bateria guiada: 20 cenários (além dos 14 de homologação conjunta)

| ID | Mensagem/continuação fictícia | Resultado esperado |
|---|---|---|
| H01 | Murilo pergunta hospitais; cliente prefere **Hospital Nipo Brasileiro, Zona Norte** | Murilo permanece, confirma preferência, sem SAMU |
| H02 | "Prefiro Hospital Santa Joana" | Murilo permanece na qualificação, sem prometer cobertura |
| H03 | "Hospital São Luiz na Zona Sul" | Murilo mantém contexto comercial |
| H04 | "Quero hospitais em Guarulhos" | Murilo mantém contexto, pergunta só o necessário |
| H05 | "Preciso de cobertura hospitalar ampla" na cotação | Murilo não interpreta internação real |
| H06 | "Quero hospital com pronto-socorro na rede" | Preferência de rede, não urgência |
| H07 | "Gostaria de cobertura para urgência e emergência" em proposta | Cobertura hipotética, sem protocolo de socorro |
| H08 | "Quero incluir Hospital Nipo na rede desejada do meu plano" | Não confundir com inclusão de beneficiário |
| H09 | "Tenho problema: operadora negou atendimento nesse hospital" | Clara, Backoffice/Benefícios, sem lead |
| H10 | "Não consigo agendar consulta" | Clara, apoio operacional |
| H11 | "Preciso incluir minha esposa como dependente" | Clara, fluxo de identidade/Backoffice |
| H12 | Cotação interrompida por "preciso da segunda via do boleto" | Clara, financeiro, sem lead comercial |
| H13 | "Preciso de internação urgente pelo meu plano" | Clara, urgência real, orientação imediata |
| H14 | "Estou com dor no peito e falta de ar" | Clara, socorro prioritário sem solicitar CPF primeiro |
| H15 | "Minha filha está internada" | Clara, fluxo clínico/operacional seguro |
| H16 | "Quero cotar plano empresarial" | Murilo qualifica em `clara_murilo` |
| H17 | "Quero cotar Auto com cobertura contra roubo" | Murilo, não sinistro |
| H18 | "Roubaram meu carro" | Clara, prioridade à segurança real |
| H19 | Cliente diz "não" para encaminhamento comercial | Nenhuma transferência/lead |
| H20 | Após assumir por humano, nova mensagem | IA não responde; estado do protocolo preservado |

## Campos mínimos de evidência

`case_id`, `protocolo_ficticio`, `mode`, `selected_agent`, `response_agent`, `intent`, `handoff.department`, `humanHandoff`, `lead_created`, `queue`, `human_paused`, `expected`, `observed`, `approved_by_phoenix`, `approved_by_junior`, `timestamp`.

## Publicação

- A correção de roteamento não deve ser mesclada e publicada sem a homologação conjunta.
- Não alterar prompts mestres, RAGs, Bridge ou estados dos protocolos para corrigir a regra da palavra "hospital".
- Em produção, a última estratégia confirmada após restauração é `clara_murilo` revisão 7; validar estado atual antes da janela de deploy.
- Se algum teste falhar: registrar evidência do **mesmo protocolo de teste**, interromper a publicação e corrigir somente a camada responsável.
