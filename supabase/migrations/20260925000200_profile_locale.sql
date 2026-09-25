-- Ticket #4 locale persistence migration: the profile remembers the learner's
-- language choice so it outlasts the httpOnly session cookies (logout and
-- re-login). The column is an enum-backed text? it maps the same values the
-- next-intl routing locales list (routing.ts) and the CHECK rejects anything
-- else. RLS: the existing `ppg_profiles_update` policy (Ticket #3) already
-- lets a learner update their own row only; no new policy is needed.
--
do $$ begin
  begin
    execute 'drop type public.ppg_locale cascade'
  exception
    when undefined_object then null; -- a fresh database has no enum to drop
  end;
end;
$$;

create type public.ppg_locale as enum ('th', 'en');

alter table public.ppg_profiles add column locale public.ppg_locale not null default 'th'::public.ppg_locale;

comment on column public.ppg_profiles.locale is
  'Ticket #4: the language the profile carries; it is the routing locale name (th | en) and the UI reads it on re-login.';

-- The seeded admin/provisioning flow (Ticket #3's trigger) now fills `locale`
-- from the metadata the admin supplies, or defaults to Thai — the first visit
-- is always Thai, the selector's switch is what the learner's own update.
create or replace function public.ppg_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.ppg_profiles (id, student_id, full_name, role, locale, created_at)
  select
    new.id,
    coalesce(new.raw_user_meta_data ->> 'student_id',
             split_part(new.email, '@', 1),
             new.id::text),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'learner')::public.ppg_role,
    coalesce(new.raw_user_meta_data ->> 'locale', 'th')::public.ppg_locale,
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

-- The existing `ppg_profiles_update` policy from Ticket #3 already allows a
-- learner to update their own row (and `role` only). `locale` is an ordinary
-- column under that policy — no separate grant, no policy drift.
