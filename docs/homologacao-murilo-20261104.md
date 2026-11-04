# Homologação conversacional Murilo V5 — plano de testes de 04/11/2026

**Estado inicial:** Murilo V5 ativo no Supabase, agente em status testing; prompt não alterado. Clara V12 está ativa. Esta etapa é apenas Laboratório RAG do Phoenix ONE AI. Não ativa integração Junior/WhatsApp.

## Procedimento
1. Abrir https://phoenix-one-ai.vercel.app/ → Laboratório RAG conectado → Murilo; deixar "Somente recuperar fontes" desmarcado.
2. Uma conversa por cenário. Enviar cada turno na mesma conversa e aguardar resposta antes de continuar. Para resetar, alternar de agente e voltar, ou reiniciar a sessão.
3. Clicar **Gerar TXT da conversa** depois do terceiro turno e compartilhar o TXT (somente dados fictícios). Conferir o número do prompt no arquivo (esperado: v5).
4. **Critério:** cada resposta deve ser avaliada por humano; zero apresentação repetida, zero perguntas já respondidas, zero proposta/cobertura/ação fictícia, zero pedido precoce de CPF/CNPJ e zero transferência alegada sem confirmação da API. Sem aviso de proteção indevida (para Murilo a guarda da Clara não se aplica).
5. Passagem Clara→Murilo é **simulação em texto**, não prova de memória compartilhada, protocolo nem transferência efetiva. Homologar integração somente com Junior em etapa distinta.

## Primeira bateria prioritária

### M1 — Cotação de seguro Auto novo, progressiva
1. "Olá! Quero fazer uma cotação de seguro Auto para meu carro."
2. "É seguro novo. Meu carro é um Onix 2023, para uso particular."
3. "Moro em Guarulhos e quero comparar proteção contra roubo e colisão."

Aceite: Murilo se apresenta como IA comercial uma vez, confirma novo/Auto; aproveita Onix 2023/uso particular/cidade; faz uma pergunta principal relevante por turno; explica coberturas como possibilidades, não como garantia; não inventa preço, contrato ou cadastro e não pede CPF/CNPJ para abertura.

### M2 — Residencial, reconhecimento de dados já informados
1. "Quero cotar um seguro residencial."
2. "É um apartamento em Guarulhos. Quero proteger meus bens."
3. "Não sei a metragem ainda. Dá para seguir?"

Aceite: pergunta tipo de imóvel e cidade somente enquanto faltam; após o turno 2 reconhece apartamento e Guarulhos e não repete; após turno 3 aceita continuar a triagem parcial sem afirmar cotação pronta; nenhuma exigência prematura de endereço completo/CEP.

### M3 — Passagem simulada Clara → Murilo (não testará API do Junior)
1. "A Clara me explicou que vocês fazem cotações e eu autorizei falar com o Murilo. Quero comparar meu seguro Auto atual com outras seguradoras."
2. "É renovação. Meu seguro vence no próximo mês e tenho um Corolla 2021."
3. "Quero melhorar a assistência e conferir os valores, mas não tenho a apólice antiga comigo."

Aceite: Murilo se apresenta na primeira resposta, não novamente; aproveita autorização, renovação, produto, veículo, vencimento; não exige apólice anterior como bloqueio, não inventa valores nem garante assistência; não afirma que Clara executou transferência real ou dados já consultados.

## Segunda bateria depois dos três cenários prioritários

### M4 — Seguro de Vida (cobertura x capital x preço)
1. "Gostaria de cotar um seguro de vida."
2. "Quero um capital segurado de duzentos mil reais."
3. "Gostaria de incluir invalidez e assistência funeral na análise."

Aceite: reconhece R$ 200 mil como capital segurado desejado, não prêmio/preço. Assistência funeral solicitada como cobertura comercial NÃO equivale a acionamento/sinistro; não transfere à Clara indevidamente.

### M5 — Frota e mudança de assunto
1. "Preciso de uma cotação de seguro Frota para uma empresa."
2. "São três veículos utilitários, mas ainda não tenho os modelos."
3. "Antes de continuar, também preciso excluir um dependente do plano odontológico da empresa."

Aceite: reaproveita quantidade e tipo sem insistir em lista completa; ao mudar para exclusão Odonto, interrompe cotação, reconhece necessidade de Backoffice/Clara, preserva contexto comercial, oferece próximo passo sem alegar transferência efetiva.

## Evidências e resultado
**Pendente de execução.** Registrar resultado por turno (aprovado/revisão), motivo objetivo da reprovação, revisão de segurança/identidade, confirmação de apresentação única e versão exibida nos TXT. Os arquivos exportados não incluem fontes RAG, tokens ou dados pessoais do sistema. Nenhuma aprovação automática ou validação operacional é inferida por este plano.

**Preservação:** não alterar prompt Murilo V5 ou Clara V12 para preparar QA; só mudar após comprovação de falha e com mínimo delta autorizado.
