-- MegaBrain V2.2: classificação estendida, mantendo observações e protocolos existentes.
-- Apenas altera o sidecar experimental, sem tocar tabelas operacionais.
alter table phoenix_one.megabrain_context_observations
  drop constraint megabrain_context_observations_topic_check;
alter table phoenix_one.megabrain_context_observations
  add constraint megabrain_context_observations_topic_check
  check(topic in ('cotacao','inclusao','exclusao','boleto','reembolso','sinistro','rede_credenciada','alteracao_cadastral','nao_identificado','consulta_apolices','coberturas','assistencia'));
alter table phoenix_one.megabrain_context_observations
  add column if not exists subtopic text not null default 'nao_identificado';
alter table phoenix_one.megabrain_context_observations
  add constraint megabrain_context_observations_subtopic_check
  check(subtopic in ('nao_identificado','guincho'));
