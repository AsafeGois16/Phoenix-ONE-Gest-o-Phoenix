create table if not exists phoenix_one.protocol_agent_state (
 source_system text not null default 'junior_management' check (source_system='junior_management'),
 external_ticket_id text not null check (external_ticket_id ~ '^[0-9]{8}-[0-9]{4}$'),
 conversation_id uuid not null,
 last_agent text null check (last_agent in ('clara','murilo')),
 last_intent text not null default 'neutral' check (last_intent in ('neutral','service','sales')),
 stage text not null default 'with_agent' check(stage in ('with_agent','assigned','queued','reopened','resolved')),
 last_event_at timestamptz null,updated_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 primary key(source_system,external_ticket_id)
);
create index if not exists protocol_agent_state_expiry_idx on phoenix_one.protocol_agent_state(expires_at);
alter table phoenix_one.protocol_agent_state enable row level security;
revoke all on phoenix_one.protocol_agent_state from public,anon,authenticated;
grant select,insert,update,delete on phoenix_one.protocol_agent_state to service_role;
comment on table phoenix_one.protocol_agent_state is 'Only agent, intent, stage and protocol/conversation identifiers; no PII or conversation text.';
