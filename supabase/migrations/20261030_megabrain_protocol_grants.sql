-- MegaBrain V2.1: autorização explícita e temporária por protocolo.
-- Exclusivamente tabela nova; não altera roteamento, prompts ou dados do Junior.
create table if not exists phoenix_one.megabrain_protocol_grants (
 source_system text not null default 'junior_management' check (source_system='junior_management'),
 external_ticket_id text not null check (external_ticket_id ~ '^[0-9]{8}-[0-9]{4}$'),
 conversation_id uuid not null,
 enabled boolean not null default false,
 granted_by uuid not null,
 granted_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(source_system,external_ticket_id),
 constraint megabrain_protocol_grant_ttl check(expires_at<=granted_at+interval '30 minutes'),
 constraint megabrain_protocol_grant_revoke check(not enabled or revoked_at is null)
);
create index if not exists megabrain_protocol_grants_expires on phoenix_one.megabrain_protocol_grants(expires_at);
alter table phoenix_one.megabrain_protocol_grants enable row level security;
revoke all on phoenix_one.megabrain_protocol_grants from public,anon,authenticated;
grant select,insert,update on phoenix_one.megabrain_protocol_grants to service_role;
comment on table phoenix_one.megabrain_protocol_grants is 'Admin-only 30-minute authorization for isolated MegaBrain shadow capture; unrelated protocols remain denied.';