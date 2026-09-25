-- Roles & profiles migration for ticket #3.
-- The profile lives in Postgres; roles are enforced by Row Level Security (RLS),
-- never in the React tree. A trigger materialises a profile row whenever an
-- auth.users row is created, so a learner/teacher/admin account always has a
-- profile. Credentials and role bootstrap data come from auth.users' metadata.
--
-- Login identifier scheme (documented for ticket #3):
--   Learner rows use a synthetic email `<student-id>@ppga.local` so Supabase
--   Auth can treat the student-ID as the login identifier without requiring a
--   real email. Teachers/admin use `<role>@ppga.local`. See README "Seeded
--   credentials" for the documented (non-secret) test accounts.

do $$ begin
  begin
    execute 'drop type public.ppg_role cascade'
  exception
    when undefined_object then null; -- a fresh database has no enum to drop
  end;
end;
$$;

create type public.ppg_role as enum ('learner', 'teacher', 'admin');

create table public.ppg_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  student_id text not null,
  full_name text not null,
  role public.ppg_role not null default 'learner'::public.ppg_role,
  created_at timestamptz not null default now(),
  -- student_id is unique so a provisioned learner can never be duplicated; the
  -- identifier doubles as the login handle inside the synthetic email.
  constraint ppg_profiles_student_id_unique unique (student_id)
);

comment on table public.ppg_profiles is
  'PPGA #3: one row per auth.users; role enum lives here and RLS reads it.';
comment on column public.ppg_profiles.role is
  'learner | teacher | admin — the authority for every role-gated action.';
comment on column public.ppg_profiles.student_id is
  'Provisioned login identifier; unique across the platform.';

create or replace function public.ppg_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.ppg_profiles (id, student_id, full_name, role, created_at)
  select
    new.id,
    coalesce(new.raw_user_meta_data ->> 'student_id',
             split_part(new.email, '@', 1),
             new.id::text),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'learner')::public.ppg_role,
    now()
  on conflict (id) do nothing;
return new;
end;
$$;

drop trigger ppg_profile_for_user on auth.users;
create trigger ppg_profile_for_user
  after insert on auth.users
  for each row
  execute procedure public.ppg_profile_for_user();

alter table public.ppg_profiles enable row level security;

-- Read: a learner sees only their own profile; teacher/admin see every profile.
-- Every policy speaks the JWT's role claim (auth.role()), never a Postgres
-- role — Supabase ships only anon/authenticated/service_role as DB roles.
create policy ppg_profiles_select on public.ppg_profiles
  for select
  using (auth.role() = 'learner' and id = auth.uid())
     or auth.role() = 'teacher'
     or auth.role() = 'admin';

-- Update: a learner may change only their own profile and may never change
-- role; the CHECK blocks cross-role escalation (and any other row) even if a
-- client smuggles the UPDATE.
create policy ppg_profiles_update on public.ppg_profiles
  for update
  using (auth.role() = 'learner' and id = auth.uid())
     or (auth.role() = 'teacher' and id = auth.uid())
     or auth.role() = 'admin'
  with check auth.role() = 'learner' and id = auth.uid() and role = 'learner'::public.ppg_role
     or auth.role() = 'teacher' and id = auth.uid() and role = 'teacher'::public.ppg_role
     or auth.role() = 'admin';

-- Profiles are never deleted by clients; rows retire only via the auth.users
-- cascade. Delete is therefore denied outright (no policy granted).
-- Insert is reserved for the security-definer trigger above and for the admin
-- role only (provisioning) — no self-registration path exists for any client.
create policy ppg_profiles_insert on public.ppg_profiles
  for insert
  with check auth.role() = 'admin';

-- Supabase's local auth admin role (supabase_auth_admin) and the service_role
-- both bypass RLS for the bootstrap trigger and the migration seeding below.
