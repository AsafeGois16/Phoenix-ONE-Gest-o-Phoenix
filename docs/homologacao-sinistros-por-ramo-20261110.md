# Homologação Phoenix ONE — Correções de Sinistros por Produto (10/11/2026)

**Escopo:** backend de triagem da Clara, sem alterar prompts mestres Clara V12 / Murilo V9, RAGs, esquema do banco, sistema do Junior nem contrato v1.2. O Junior é o executor das mudanças de fila e da validação de identidade.

## Base: devolutiva da bateria S01–S26, I01–I10

Aprovações já informadas: S01–S03, S12–S14, S17, S21–S26. Integração I01–I10 aprovada. O novo código altera apenas os casos abaixo e preserva os demais.

| Casos | Fluxo de triagem corrigido | Destino proposto |
|---|---|---|
| S04 — Roubo/Furto Auto | Segurança PESSOAL, Polícia Militar 190 se ameaça/crime em andamento; nunca perguntar se carro roubado está seguro | patrimonio / Auto/RE |
| S07 — Residencial | Evacuação, não retorno ao imóvel, Bombeiros 193 e segurança das pessoas antes do documento | patrimonio / Auto/RE |
| S08 — Empresarial | Funcionários em segurança, incêndio/fumaça/estrutura: evacuar e Bombeiros 193 | patrimonio / Auto/RE |
| S09 — Condomínio | Segurança de moradores/equipe, risco estrutural/fogo, Bombeiros 193 | patrimonio / Auto/RE |
| S15 — Saúde | Natureza da urgência clínica primeiro; SAMU 192/pronto-socorro quando houver risco imediato | beneficios |
| S05 — Moto | Ferimentos e urgência clínica antes de identificação | patrimonio / Auto/RE |
| S06 — Frota | Segurança do condutor e unidade/veículo afetado (referência interna; sem exigência de placa completa), depois identificação | patrimonio / Auto/RE |
| S10 — Equipamento | Risco de choque, incêndio, ferimentos; nunca tratar como automóvel | patrimonio / Auto/RE |
| S11 — Bike | Ferimentos do ciclista; não perguntar modelo de carro ou guincho | patrimonio / Auto/RE |
| S16 — Odonto | Sangramento grave ou risco imediato, depois identidade e plano | beneficios |
| S18 — Acidentes Pessoais | Estado da pessoa; DIT somente como possível cobertura sujeita a conferência contratual | beneficios |
| S19 — Viagem | Identidade antes de qualquer alegação de contrato; vigência e território ficam para confirmação humana | beneficios |
| S20 — Pet | Urgência veterinária primeiro; identidade antes de consultar contrato Pet | backoffice (triagem humana) |

## Sequência comum com exceção de urgência

1. Identificar ocorrência REAL; não confundir simulação de cotação ou movimentação administrativa com sinistro.
2. Orientar segurança e/ou perguntar uma informação necessária conforme o ramo. Em incêndio, feridos ou risco imediato, nunca atrasar socorro por CPF.
3. Se estiver seguro, identificar titular via CPF/CNPJ somente como chave; Junior pode exigir data de nascimento/CEP. **Identidade só é verificada quando Junior responder `verified`.**
4. Resposta objetiva sobre categoria encontrada, sem exibir franquia/limites, afirmar cobertura ou vigência ativa sem evidência.
5. Oferecer encaminhamento humano à fila; cliente confirma; `humanHandoff=true`, resumo sem PII. Junior efetua a transferência e pausa o agente.

Quando a fila destino específico de algum produto não está definida, não inventar ação da seguradora. Neste conjunto, Pet utiliza Backoffice para triagem humana; confirmar mapeamento definitivo com o Junior caso a operação tenha uma fila exclusiva.

## Segurança

- Não acionar SAMU, Bombeiros, Polícia, guincho, veterinário ou operadora pela API da Clara.
- Números 190, 192 e 193 apenas como orientação no Brasil, de acordo com o risco.
- Não divulgar ou persistir documentos do titular no modelo, RAG, resumo ou logs.
- Não impor documentação obrigatória de sinistro sem confirmação da seguradora; a equipe confere as exigências.
- Handoff não significa sinistro aberto, autorização de cobertura nem atendimento concluído.
- Respeitar o modo desligado, áudio não transcrito, protocolos com sufixo e event webhook v1.2.

## Reteste no WhatsApp de homologação

Prioridade: S04 → S07 → S08 → S09 → S15; sequência: S05, S06, S10, S11, S16, S18, S19, S20. Com um protocolo novo por cenário, observar primeiro a orientação, depois documento fictício autorizado na gestão, etapa de validação do Junior e transferência efetiva. Confirmar visualmente a fila e pausa da Clara. Repetir I01–I10 como regressão da integração.

**Observação:** testes automáticos de código e preview não equivalem à homologação operacional do Junior. O resultado final depende dos prints e estados reais dos protocolos de teste.
