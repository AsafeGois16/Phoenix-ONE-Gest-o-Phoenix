alter table phoenix_one.external_ticket_refs add column if not exists assigned_to_user_id text null;
comment on column phoenix_one.external_ticket_refs.assigned_to_user_id is 'ID do usuário responsável informado por ticket.assigned.v1, sem nome ou contato.';
