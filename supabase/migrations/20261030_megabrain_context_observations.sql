-- MegaBrain V2: sidecar isolado; não altera nenhuma tabela operacional.
-- Armazena SOMENTE categorias fixas, sem texto da conversa ou dados pessoais.
create table if not exists phoenix_one.megabrain_context_observations (
 source_system text not null default 'junior_management' check(source_system='junior_management'),
 external_ticket_id text not null check(external_ticket_id ~ '^[0-9]{8}-[0-9]{4}$'),
 conversation_id uuid not null,
 source_agent text not null check(source_agent in ('clara','murilo')),
 topic text not null check(topic in ('cotacao','inclusao','exclusao','boleto','reembolso','sinistro','rede_credenciada','alteracao_cadastral','nao_identificado')),
 product text not null check(product in ('odontologico','saude','vida','auto','residencial','empresarial','viagem','nao_identificado')),
 next_step text not null check(next_step in ('acompanhar_encaminhamento','validar_titular','aguardar_cliente','continuar_atendimento')),
 pending text not null check(pending in ('encaminhamento_proposto','validacao_pendente','resposta_pendente','nao_identificada')),
 facts text[] not null default '{}'
   check(facts <@ array['assunto_identificado','produto_mencionado']::text[]),
 confidence text not null default 'inferido' check(confidence='inferido'),
 source text not null default 'mensagem_cliente' check(source='mensagem_cliente'),
 first_observed_at timestamptz not null default now(),
 observed_at timestamptz not null,
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null,
 primary key(source_system,external_ticket_id)
);
create index if not exists megabrain_context_expiry_idx on phoenix_one.megabrain_context_observations(expires_at);
alter table phoenix_one.megabrain_context_observations enable row level security;
revoke all on phoenix_one.megabrain_context_observations from public,anon,authenticated;
grant select,insert,update,delete on phoenix_one.megabrain_context_observations to service_role;
comment on table phoenix_one.megabrain_context_observations is 'Experimental MegaBrain shadow observation: enum metadata only; no client PII, free-text or raw conversation. Not used by active agents.';
