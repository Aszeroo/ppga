-- Ticket #6 audit foundation + admin role-change RPC.
--
-- The audit event lives in Postgres; append-only is enforced by RLS: no
-- UPDATE/DELETE policy is granted, so any update/delete on `ppg_audit_events`
-- is denied by the table itself (never by a React tree). Inserts are allowed
-- for every authenticated role (learner/teacher/admin) — the RPC below and
-- every later operation (provisioning, overrides, exports) write here; admin
-- alone reads it.
--
-- The role-change RPC `ppg_change_role(p_role, p_target)` is the admin-only
-- path Ticket #6's story (admin manages user roles): a security-definer
-- function that updates the target's profile role AND inserts exactly one
-- audit event in the same call — so a learner/teacher who smuggles the RPC
-- gets a hard error (`permission_denied`), never a silently-0-row UPDATE.
-- profiles' RLS stays intact; the function is the only admin-side write path
-- for someone else's role.

create table public.ppg_audit_events (
  id uuid primary key default gen_random_uuid(),
  -- The actor (the JWT's `sub` — an `auth.users.id`). Nullable because a
  -- service-side bootstrap (no user JWT) still leaves a row with `actor_id`
  -- `null`; every RPC-initiated event carries the admin's own id.
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The table is append-only; a later `ALTER` that adds UPDATE/DELETE would be
-- the bug, not the feature. The comment below is the DB's own documentation.
comment on table public.ppg_audit_events is
  'PPGA #6: append-only audit event stream; every later operation (role change, provisioning, overrides, exports) writes here.';
comment on column public.ppg_audit_events.actor_id is
  'The event''s actor — the JWT''s `sub` (an auth.users.id); null only for a service bootstrap.';
comment on column public.ppg_audit_events.action is
  'The verb — `role_change` here; later `provision`, `override`, `export`.';
comment on column public.ppg_audit_events.target_type is
  'The object kind — `profile` here; later `account`, `publication`.';
comment on column public.ppg_audit_events.target_id is
  'The object's identity — the profile''s id here; no FK to keep the stream append-only across row-retire.';
comment on column public.ppg_audit_events.details is
  'Structured detail (`{ "old_role": ..., "new_role": ... }` here); every event stays parseable for #56''s inspect.';

alter table public.ppg_audit_events enable row level security;

-- Read: admin alone. A learner/teacher has no SELECT policy granted, so the
-- audit stream is invisible to them at the RLS level (the story's "audit
-- views" are an admin-only surface, #56).
create policy ppg_audit_events_select on public.ppg_audit_events
  for select
  using auth.role() = 'admin';

-- Insert: every authenticated role — the audit stream is what a role-gated
-- operation must write to; the deny on read does not deny the write. The
-- anon role has no INSERT policy, so a service bootstrap rides the service
-- role's bypass, never the anon key.
create policy ppg_audit_events_insert on public.ppg_audit_events
  for insert
  using auth.role() in ('learner'::text, 'teacher'::text, 'admin'::text);

-- UPDATE / DELETE: no policy is granted, so the command tag is denied by the
-- table itself — the append-only enforcement lives in the database, never in
-- the React tree.

-- The admin-only role-change RPC: one call — one UPDATE of the target's
-- profile role, one INSERT of the audit event. `security definer` so the
-- function speaks with the owner's (RLS-bypassing) rights; the FIRST gate
-- below reads the CALLER's JWT, so a learner/teacher calling the RPC gets a
-- hard `permission_denied`, never a silently-skipped write.
create or replace function public.ppg_change_role(
  p_new_role public.ppg_role,
  p_target_id uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_role public.ppg_role;
begin
  -- Gate 1: only an admin may call (the JWT's role claim, never a Postgres
  -- role — Supa ships only anon/authenticated/service_role as DB roles).
  if auth.role() != 'admin' then
    raise exception 'permission_denied: ppg_change_role is admin-only (JWT role claim must be admin)';
  end if;

  -- Gate 2: the target must exist (an admin can never silently-0-row a
  -- role-change for someone else's missing profile) — and its current role
  -- is read first so the audit event can carry the `old_role` a #56 inspect
  -- needs (after the UPDATE, the old value is gone).
  SELECT t.role INTO old_role
    FROM public.ppg_profiles t
   WHERE t.id = p_target_id;

  if old_role is null then
    raise exception 'target_missing: no profile for p_target_id';
  end if;

  -- The UPDATE of the target's role — the function's (definer, RLS-bypass)
  -- rights make it possible; the gate above made it admin-only.
  update public.ppg_profiles t
     set role = p_new_role
   WHERE t.id = p_target_id
  returning *;

  -- Exactly one audit event, same transaction, same call.
  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'role_change',
    'profile',
    p_target_id::text,
    jsonb_build_object(
      'old_role', old_role::text,
      'new_role', p_new_role::text
    ),
    now()
  );

  return;
end;
$$;

-- The RPC's execute is revoked from every client role so a bare
-- `SELECT ppg_change_role(...)` cannot find it; the gate above is still the
-- authority for the authenticated caller (JWT), the revoke covers the other
-- Postgres roles.
revoke execute on function public.ppg_change_role(
  public.ppg_role, uuid
) from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_change_role(
  public.ppg_role, uuid
) to service_role;

comment on function public.ppg_change_role(public.ppg_role, uuid) is
  'PPGA #6: admin-only role-change RPC; one call = one profile UPDATE + exactly one audit INSERT.';

-- The admin-only user-list RPC `ppg_admin_users_list(p_page)` — the LIST read
-- the console needs. profiles' Ticket #3 select policy lets a teacher see
-- every row for their own lesson-view; the console's user list is an admin
-- surface (#52), so the read rides this function's JWT gate — a teacher/
-- learner caller gets `permission_denied`, never a silently-listed roster.
create or replace function public.ppg_admin_users_list(p_page integer)
returns table (
  id uuid,
  student_id text,
  full_name text,
  role public.ppg_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- `RAISE` is a PL keyword (an SQL-language function cannot raise); the
  -- gate therefore rides plpgsql — the same authority as the role-change RPC.
  if auth.role() != 'admin' then
    raise exception 'permission_denied: ppg_admin_users_list is admin-only';
  end if;

  return query
  select t.id, t.student_id, t.full_name, t.role, t.created_at
    from public.ppg_profiles t
   order by t.student_id
   limit 20
   offset p_page * 20;
end;
$$;

revoke execute on function public.ppg_admin_users_list(integer)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_admin_users_list(integer)
  to service_role;

comment on function public.ppg_admin_users_list(integer) is
  'PPGA #6: admin-only user-list RPC; page-20, ordered by student_id.';

-- The admin-only audit-read RPC `ppg_admin_audit_list(p_limit)` — the console's
-- event stream, latest first. The `ppg_audit_events_select` policy already
-- denies a teacher/learner read silently (RLS filters, 0 rows); the console's
-- denial must be a hard outcome, never a roster-shaped `empty` that a smuggled
-- teacher mistake could pass, so the read rides this function's own JWT gate
-- — a teacher/learner caller gets `permission_denied`, not a 0-row list.
create or replace function public.ppg_admin_audit_list(p_limit integer)
returns table (
  id uuid,
  actor_id uuid,
  action text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() != 'admin' then
    raise exception 'permission_denied: ppg_admin_audit_list is admin-only';
  end if;

  return query
  select e.id, e.actor_id, e.action, e.target_type, e.target_id, e.details, e.created_at
    from public.ppg_audit_events e
   order by e.created_at desc
   limit p_limit;
end;
$$;

revoke execute on function public.ppg_admin_audit_list(integer)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_admin_audit_list(integer)
  to service_role;

comment on function public.ppg_admin_audit_list(integer) is
  'PPGA #6: admin-only audit-read RPC; latest first, limit-N.';
