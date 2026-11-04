# Clara · Diagnóstico do Laboratório RAG — 04/11/2026

As três capturas enviadas mostravam respostas substituídas, com aviso genérico.
A resposta original não é persistida; não é possível atribuir retrospectivamente
cada intervenção a um erro do modelo ou a um falso positivo.

## Problemas reproduzidos no código

- “Não consigo consultar o valor do boleto neste laboratório.” era bloqueado por
  `consulta_nao_disponivel`, apesar de ser uma descrição verdadeira da limitação.
- “Não posso encaminhar o pedido. Posso enviar o boleto agora.” passava: uma
  negativa em qualquer lugar do texto desativava a detecção de ofertas indevidas.
- O prompt mestre e fontes históricas descrevem o atendimento integrado, enquanto
  o laboratório não possui essas ferramentas. O aviso geral sobre propostas de
  encaminhamento também coexistia com proibições de ofertas de ações indisponíveis.
  Isso é um conflito identificado, não prova da causa das três respostas originais.

## Ajustes

1. Verificação de negativas por ocorrência e oração, sem isenção para a resposta toda.
2. Instruções finais de capacidades aplicáveis somente à Clara no laboratório,
   após o contexto RAG: orientação e identificação do setor, sem coleta privada
   nem ofertas de operações indisponíveis. Preserva emergências e apresentação única.
3. O painel apresenta as categorias já retornadas pelo filtro, com indicação de que
   a detecção automática exige revisão. Só rótulos conhecidos são apresentados;
   nenhum texto bloqueado é retornado, registrado ou exibido.

O prompt publicado continua V11. Nenhuma gravação no banco, alteração do Murilo,
API operacional do Junior, WhatsApp ou flags de integração.

## Validação e limites

Testes determinísticos cobrem as duas regressões, as três orientações seguras,
preservação do Murilo e exibição de categorias conhecidas. Não equivalem a uma
nova geração ao vivo da IA nem a homologação operacional.

Após atualizar o painel, iniciar conversas separadas para inclusão Saúde,
exclusão Odonto e segunda via Auto. Se houver intervenção, avaliar a categoria
específica mostrada. Manter o filtro ativo e a integração operacional no estado
anterior até a homologação apropriada.
