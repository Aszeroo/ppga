-- Baseline migration for the PPGA health check.
-- Creates a tiny one-row table the health endpoints can query for real database connectivity.
create table if not exists public.ppg_health (
  id integer primary key,
  ok boolean not null default true,
  detail text
);

comment on table public.ppg_health is 'PPGA scaffold: server-side connectivity baseline.';

insert into public.ppg_health (id, ok, detail)
values (1, true, 'scaffold baseline')
on conflict (id) do nothing;