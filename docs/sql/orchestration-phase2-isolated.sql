-- FASE 2: schema isolado de homologação no projeto existente. Não usar para operação real.
-- Não é migration automática. Sem dados de clientes, mensagens ou prompts.
begin;
create schema phx_orch_test;
revoke all on schema phx_orch_test from public, anon, authenticated;
grant usage on schema phx_orch_test to authenticated, service_role;
create table phx_orch_test.allowed_admins (
 user_id uuid primary key
);
-- Lista de acesso de homologação, sem alterar a tabela de origem.
insert into phx_orch_test.allowed_admins(user_id)
 select user_id from phoenix_one.admin_users where role in ('admin','owner');
alter table phx_orch_test.allowed_admins enable row level security;
revoke all on phx_orch_test.allowed_admins from public, anon, authenticated;
grant select on phx_orch_test.allowed_admins to authenticated,service_role;
create policy orch_admin_self on phx_orch_test.allowed_admins for select to authenticated
 using (user_id=(select auth.uid()));
create table phx_orch_test.settings (
 id boolean primary key default true check(id),
 mode text not null check(mode in ('clara_murilo','clara_only')),
 revision bigint not null check(revision>=1),
 updated_at timestamptz not null default now()
);
insert into phx_orch_test.settings(id,mode,revision) values(true,'clara_murilo',1);
create table phx_orch_test.revisions (
 revision bigint primary key,
 mode text not null check(mode in ('clara_murilo','clara_only')),
 actor uuid,
 changed_at timestamptz not null default now()
);
insert into phx_orch_test.revisions(revision,mode) values(1,'clara_murilo');
create table phx_orch_test.protocol_modes (
 protocol_ref uuid primary key,
 revision bigint not null references phx_orch_test.revisions(revision),
 pinned_at timestamptz not null default now()
);
alter table phx_orch_test.settings enable row level security;
alter table phx_orch_test.revisions enable row level security;
alter table phx_orch_test.protocol_modes enable row level security;
revoke all on all tables in schema phx_orch_test from public, anon, authenticated;
grant select,update on phx_orch_test.settings to service_role;
grant select,insert on phx_orch_test.revisions,phx_orch_test.protocol_modes to service_role;
grant select on phx_orch_test.allowed_admins to authenticated;
grant select,update on phx_orch_test.settings to authenticated;
grant select,insert on phx_orch_test.revisions,phx_orch_test.protocol_modes to authenticated;
create policy orch_settings_read on phx_orch_test.settings for select to authenticated
 using (exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())));
create policy orch_settings_write on phx_orch_test.settings for update to authenticated
 using (exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())))
 with check (exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())));
create policy orch_revisions_read on phx_orch_test.revisions for select to authenticated
 using (exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())));
create policy orch_revisions_write on phx_orch_test.revisions for insert to authenticated
 with check (actor=(select auth.uid()) and exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())));
create policy orch_pins_read on phx_orch_test.protocol_modes for select to authenticated
 using (exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())));
create policy orch_pins_write on phx_orch_test.protocol_modes for insert to authenticated
 with check (exists(select 1 from phx_orch_test.allowed_admins a where a.user_id=(select auth.uid())));

create function public.phx_orch_test_get() returns jsonb
language sql stable security invoker set search_path = ''
as $$ select jsonb_build_object('mode',mode,'revision',revision)
       from phx_orch_test.settings where id $$;

create function public.phx_orch_test_set(p_mode text,p_expected_revision bigint,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare cur phx_orch_test.settings%rowtype;
begin
 if p_mode is null or p_mode not in ('clara_murilo','clara_only') or p_actor is null or p_actor is distinct from auth.uid() or p_expected_revision is null then
  raise exception 'invalid_configuration' using errcode='22023';
 end if;
 select * into strict cur from phx_orch_test.settings where id for update;
 if cur.revision <> p_expected_revision then
  return jsonb_build_object('conflict',true,'mode',cur.mode,'revision',cur.revision);
 end if;
 if cur.mode=p_mode then
  return jsonb_build_object('mode',cur.mode,'revision',cur.revision);
 end if;
 update phx_orch_test.settings set mode=p_mode,revision=cur.revision+1,updated_at=now() where id;
 insert into phx_orch_test.revisions(revision,mode,actor) values(cur.revision+1,p_mode,p_actor);
 return jsonb_build_object('mode',p_mode,'revision',cur.revision+1);
end $$;

-- O identificador fictício é fornecido pelo servidor. Na futura integração,
-- p_new_protocol só poderá vir de evento confiável de início do Junior.
-- Protocolo desconhecido sem prova de início herda o padrão histórico (rev. 1).
create function public.phx_orch_test_pin(p_protocol_ref uuid,p_new_protocol boolean) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare rev bigint; chosen text;
begin
 if p_protocol_ref is null or p_new_protocol is null then raise exception 'invalid_protocol' using errcode='22023'; end if;
 select revision into strict rev from phx_orch_test.settings where id for share;
 insert into phx_orch_test.protocol_modes(protocol_ref,revision)
 values(p_protocol_ref,case when p_new_protocol then rev else 1 end)
 on conflict(protocol_ref) do nothing;
 select p.revision,r.mode into strict rev,chosen from phx_orch_test.protocol_modes p
 join phx_orch_test.revisions r on p.revision=r.revision where p.protocol_ref=p_protocol_ref;
 return jsonb_build_object('protocol_ref',p_protocol_ref,'mode',chosen,'revision',rev);
end $$;

revoke all on function public.phx_orch_test_get() from public,anon,authenticated,service_role;
revoke all on function public.phx_orch_test_set(text,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.phx_orch_test_pin(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.phx_orch_test_get() to authenticated;
grant execute on function public.phx_orch_test_set(text,bigint,uuid) to authenticated;
grant execute on function public.phx_orch_test_pin(uuid,boolean) to authenticated;
commit;
