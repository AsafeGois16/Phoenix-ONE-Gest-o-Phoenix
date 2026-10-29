alter table phoenix_one.protocol_agent_state add column if not exists clara_apresentada boolean not null default false;
alter table phoenix_one.protocol_agent_state add column if not exists murilo_apresentado boolean not null default false;
comment on column phoenix_one.protocol_agent_state.clara_apresentada is 'Confirmed in outbound agent messages; no PII, not proposed messages.';
comment on column phoenix_one.protocol_agent_state.murilo_apresentado is 'Confirmed in outbound agent messages; no PII, not proposed messages.';
