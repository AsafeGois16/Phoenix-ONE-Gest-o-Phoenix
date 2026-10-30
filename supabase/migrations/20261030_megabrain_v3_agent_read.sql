-- MegaBrain V3: leitura pela IA é consentimento DIFERENTE de captura.
-- Default FALSE e vinculado ao grant de captura existente; sem dados pessoais.
alter table phoenix_one.megabrain_protocol_grants
 add column if not exists agent_read_enabled boolean not null default false;
comment on column phoenix_one.megabrain_protocol_grants.agent_read_enabled
 is 'Per-protocol admin consent to pass fresh categorical context to agents; defaults false and expires with capture grant.';
