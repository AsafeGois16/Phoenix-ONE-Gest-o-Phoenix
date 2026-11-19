-- Candidate only; not applied. Existing private Phoenix ONE schema.
begin;
create table phoenix_one.orchestration_pilot_settings(
 id boolean primary key default true check(id),mode text not null check(mode in ('clara_only','clara_murilo')),revision integer not null check(revision>=1),cutoff date);
create table phoenix_one.orchestration_pilot_pins(
 base text primary key check(base ~ '^\d{8}-\d{4}$'),mode text not null check(mode in ('clara_only','clara_murilo')),revision integer not null check(revision>=1));
alter table phoenix_one.orchestration_pilot_settings enable row level security;
alter table phoenix_one.orchestration_pilot_pins enable row level security;
revoke all on phoenix_one.orchestration_pilot_settings,phoenix_one.orchestration_pilot_pins from public,anon,authenticated;
insert into phoenix_one.orchestration_pilot_settings values(true,'clara_murilo',1,null);
commit;
