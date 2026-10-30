# Phoenix ONE — consentimento antes de transferências e continuidade Auto

## Regra operacional
O Phoenix ONE **não** retorna `humanHandoff=true` sem pedido explícito do cliente por atendimento humano ou confirmação registrada depois de oferta de encaminhamento. Inclui Backoffice, dúvidas de Auto, falha de identidade, movimentações e andamento de solicitações.

A primeira passagem da Clara para Murilo por nova cotação também exige aceite: fazer uma cotação não significa autorizar trocar de agente. A confirmação será reconhecida a partir de mensagens de saída efetivamente enviadas pelo Junior e resposta posterior. Um "não" mantém a Clara e não provoca insistência. Não é necessária confirmação repetida quando o cliente já pede claramente falar com humano.

O retorno de `humanHandoff=true` continua a ser executado exclusivamente pelo sistema do Junior. O Phoenix ONE só fornece a proposta e a justificativa do encaminhamento.

### Testes recomendados
1. Cliente pede assistência/guincho: Clara responde sem transferir.
2. Cliente pede equipe de Auto: Clara pergunta "Posso encaminhar?". Antes da resposta não há handoff.
3. Cliente responde "Não": Clara não transfere e não pergunta de novo.
4. Cliente responde "Sim": somente então é emitida proposta de handoff para patrimônio.
5. Nova cotação enquanto Clara atende: Clara apresenta o Murilo e **pergunta se pode passar**. Somente após confirmação o Murilo assume.
6. Em solicitação de inclusão/exclusão, selecionar uma apólice não é autorização de transferência. Clara pergunta antes de encaminhar ao Backoffice.

## Continuidade de cotação do mesmo Auto
- Quando o usuário pede cotar o **mesmo carro** em outra seguradora, o Murilo tenta **reconsultar o Junior** para o mesmo protocolo e conversa, a partir da informação documental já fornecida no histórico.
- Reutilização de dados de veículo somente se `identity/resolve` retornar `verified` novamente para o mesmo documento, protocolo e conversa. CPF é chave de busca, não autenticação.
- Modelo, marca e ano vêm da resposta autorizada da API. Sem isso, não inventar modelo, ano, placa ou seguradora.
- Se houver mais de um seguro Auto na carteira, pedir para escolher qual deseja cotar.
- Nunca compartilhar CPF/CNPJ, placa, Renavam, chassi ou número de apólice com o modelo na continuidade de cotação.

### Campos opcionais que o Junior precisa expor, se ainda não disponíveis

No retorno de `POST /identity/resolve` após `status=verified`, em cada item de `policies` do ramo Automóvel:

```json
{
  "ramo": "Automóvel",
  "seguradora": "Seguradora de exemplo",
  "veiculo": {
    "marca": "Marca fictícia",
    "modelo": "Modelo fictício",
    "ano_modelo": 2022,
    "ano_fabricacao": 2021
  }
}
```

`veiculo` é opcional, e os novos campos são opcionais para compatibilidade. Não incluir placa, CPF, proprietário, chassi nem identificadores sensíveis nesse resumo comercial. A consulta continua exigindo verificação de identidade. Se o Junior não fornecer `veiculo`, a Phoenix ONE consegue identificar o produto Auto, mas **não sabe modelo e ano** apenas pelos campos de apólice e coberturas.

Esta mudança prepara o Phoenix ONE para consumir os campos, **não altera a API do Junior**. O Junior pode implementar a extensão sem quebrar seu contrato atual.

## Proteção do sistema
- Não foram modificados prompts mestres da Clara V8 ou Murilo V4.
- Não mudou o schema do Supabase nem as tabelas do MegaBrain.
- Não foi alterada a propriedade pública `humanHandoff` nem o formato do contrato.
- Os guardiões de consentimento ficam antes da serialização e se aplicam também aos caminhos determinísticos.
- A memória V3 de categorias inferidas continua separada da fonte verificada de dados do Junior.
- Para confirmar se o Junior exibe a transferência corretamente, validar o campo `humanHandoff` enviado pelo Phoenix ONE e o evento efetivamente executado na gestão.

## Rollback
O código está em PR isolado. Reverter o merge desfaz as mudanças no Phoenix ONE. O mapeamento opcional `veiculo` no bridge não cria tabelas nem altera o contrato anterior, mas uma reversão completa pode restaurar a Edge Function anterior pelo arquivo versionado no GitHub.
