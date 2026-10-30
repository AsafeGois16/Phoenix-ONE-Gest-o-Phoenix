# MegaBrain — Botão de teste seguro

A partir desta versão, a página **MegaBrain** possui um controle `Ativar modo de teste` acima da lista de protocolos.

## O que faz
Abre um laboratório com cinco cenários totalmente fictícios: cotação de Vida, inclusão de Saúde, segunda via de boleto Auto, reembolso Odontológico e saudação simples. O laboratório executa **o mesmo classificador determinístico** existente no serviço de observação do MegaBrain V2, apresentando assunto, produto, pendência e próximo passo.

## O que NÃO faz
- Não ativa observação automática no WhatsApp ou em protocolos existentes.
- Não escreve no Supabase, não consulta o CRM LEADS, não envia mensagens, não transfere atendimentos.
- Não altera os prompts da Clara ou Murilo, o bridge, a integração do Junior ou o modo de captura.
- Os cenários são fixos: não solicitamos dados pessoais nem transmitimos conteúdo do navegador a um serviço de IA.

A ativação de captura de conversas reais continua protegida por `PHOENIX_MEGABRAIN_SHADOW`, atualmente desativada. Para liberar observação em um protocolo de homologação, será necessário implementar e auditar uma lista de permissão por protocolo **antes** de ativar a flag. Não trate este botão de laboratório como autorização para capturar conversas reais.

## Testes
A suíte existente `node --test tests/*.test.js` inclui testes específicos para garantir que o botão abre e fecha o laboratório, usa o mesmo classificador e não tem requisição de gravação.
