-- Ticket #7 roster provisioning: the one-time temporary password flag + the
-- provision-audit RPC.
--
-- The flag lives in the DATABASE (`ppg_profiles.must_change_password`), never
-- in a client-readable user_metadata bag: RLS can speak it (the profile's own
-- policies read/write it) and the login/change-password flow reads it through
-- the session's JWT + RLS — a learner sees their own flag; the first-login
-- force-change gate (middleware + the login route) speaks the same authority.
-- Default `false` — the seeded #3 accounts (and every future self-set password
-- account) may keep signing in without a forced change; the provisioning flow
-- sets `true` per provisioned learner so the handout's temp password is
-- one-time by construction, not by a React tree's promise.
--
-- The provision-audit RPC `ppg_provision_finalize(p_target, p_student, p_name,
-- p_line_result)` follows Ticket #6's `ppg_change_role` pattern: a
-- security-definer function gated on the CALLER's JWT role claim (admin OR
-- teacher — Teacher/Admin both provision #7's story), one UPDATE of the
-- created account's `auth.users.role` to the learner role claim so the
-- RLS' `auth.role()` speaks after the Supa gotrue's admin createUser landed
-- the row with `role = 'authenticated'` (gotrue's default group — without
-- this UPDATE the provisioned learner would sign in with a JWT whose
-- `role` claim is `authenticated`, denied by every profile policy), one
-- SELECT assert the profile materialises (the after-insert trigger fired for
-- the admin API's INSERT too), and exactly one audit INSERT — so a
-- learner/teacher who smuggles the RPC reaches PostgREST as
-- `permission_denied` (SQLSTATE family), never a silently-0-row UPDATE or a
-- roster that was never written.
--
-- The audit event's `details` carry the line's student_id + full_name + the
-- line's result (`created|duplicate|malformed` — the bilingual report's
-- per-line status); NO password material lands in the audit stream: temp
-- passwords reach the printable handout (the route's response) and the auth
-- service's own bcrypt hash only.
--
-- The `p_target_id` may be null for a rejected line (a duplicate/malformed
-- roster line has no created account): the role UPDATE is a 0-row UPDATE (
-- harmless — the WHERE id IS NULL never matched anything), the profile
-- SELECT assert runs only when a target is given, and the audit INSERT still
-- writes the line's result so the report stream proves every attempt (the
-- #56 inspect reads it).

alter table public.ppg_profiles
  add column must_change_password boolean not null default false;

comment on column public.ppg_profiles.must_change_password is
  'PPGA #7: true = the account is signed in with a one-time temp password; the first-login force-change gate (middleware/login route + ppga_must_change_password cookie) speaks this flag via RLS, before anything else.';

-- The profile trigger must carry the flag through the metadata so a
-- provisioned learner's profile row is flagged at the same instant the
-- account row lands (the after-insert trigger), and stays false for the #3
-- seeded bootstrap rows (they carry no `must_change_password` key in their
-- metadata — the coalesce default below makes that `false`, verbatim).
create or replace function public.ppg_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.ppg_profiles (id, student_id, full_name, role, created_at, must_change_password)
  select
    new.id,
    coalesce(new.raw_user_meta_data ->> 'student_id',
             split_part(new.email, '@', 1),
             new.id::text),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'learner')::public.ppg_role,
    now(),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  on conflict (id) do nothing;
return new;
end;
$$;

drop trigger ppg_profile_for_user on auth.users;
create trigger ppg_profile_for_user
  after insert on auth.users
  for each row
  execute procedure public.ppg_profile_for_user();

-- The provision-audit RPC: the Teacher/Admin provisioning path (#7). One call
-- = one UPDATE of the created account's role claim, one SELECT assert the
-- profile exists, exactly one audit INSERT; the gate below reads the CALLER's
-- JWT role claim, so a learner calling the RPC gets a hard
-- `permission_denied`, never a silent write on someone else's account.
create or replace function public.ppg_provision_finalize(
  p_target_id uuid,
  p_student_id text,
  p_full_name text,
  p_line_result text
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  has_profile boolean;
begin
  -- Gate 1: an admin OR a teacher may call (Teacher/Admin both provision #7's
  -- story — the JWT's role claim, never a Postgres role — Supa ships only
  -- anon/authenticated/service_role as DB roles).
  if auth.role() != 'admin' and auth.role() != 'teacher' then
    raise exception 'permission_denied: ppg_provision_finalize is admin/teacher-only (JWT role claim must be admin or teacher)';
  end if;

  -- Gate 2: the target must exist when one is given (an admin/teacher can never
  -- silently-0-row a finalize for a never-created account). The assert rides
  -- the definer's (RLS-bypass) read; the profile row materialises from the
  -- admin createUser's own after-insert trigger, so its presence proves the
  -- trigger fired for the Auth-admin API's INSERT — not a hand-seed.
  if p_target_id is not null then
    SELECT t.id IS NOT NULL INTO has_profile
      FROM public.ppg_profiles t
     WHERE t.id = p_target_id;

    if has_profile is null or has_profile = false then
      raise exception 'target_missing: no profile for p_target_id';
    end if;

    -- The UPDATE of the created account's role claim — gotrue's admin
    -- createUser INSERTs the row with `role = 'authenticated'` (its default
    -- group), so the provisioned learner would otherwise sign in with a JWT
    -- whose `role` claim is `authenticated`: denied by every profile policy.
    -- The definer's rights make the UPDATE possible across auth.users (RLS is
    -- disabled on auth.users — the gotrue's own table, not the repo's); the
    -- gate above made it admin/teacher-only. The metadata rewrite carries the
    -- provisioned handle + name + the one-time-flag verbatim so the #56
    -- inspect (and a later re-trigger) has the raw material on the row.
    UPDATE auth.users u
       set role = 'learner'::text,
         raw_user_meta_data = jsonb_build_object(
           'student_id', p_student_id,
           'full_name', p_full_name,
           'role', 'learner'::text,
           'must_change_password', true
         )
     WHERE u.id = p_target_id
    returning *;
  end if;

  -- Exactly one audit event, same transaction, same call — for every line
  -- result, created/duplicate/malformed alike (the bilingual report's per-line
  -- status rides this stream). No password material in `details`: the verb is
  -- the provision; the object is the account; the identity is the student_id
  -- handle (no FK keeps the stream append-only); the detail is the line's
  -- name + result.
  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'provision',
    'account',
    p_student_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'full_name', p_full_name,
      'line_result', p_line_result
    ),
    now()
  );

  return;
end;
$$;

-- The RPC's execute is revoked from every client role so a bare
-- `SELECT ppg_provision_finalize(...)` cannot find it; the JWT gate above is
-- still the authority for the authenticated caller (the authenticated POST
-- through PostgREST rides the caller's own rights — the revoke covers the
-- other Postgres roles).
revoke execute on function public.ppg_provision_finalize(uuid, text, text, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_provision_finalize(uuid, text, text, text)
  to service_role;

comment on function public.ppg_provision_finalize(uuid, text, text, text) is
  'PPGA #7: admin/teacher-only provision-audit RPC; one call = one auth.users role UPDATE + exactly one audit INSERT; p_target_id null for a rejected line (0-row UPDATE, harmless, the audit still writes the line result).';
