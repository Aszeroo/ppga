-- Ticket #3 seed: the first Admin account is created by a migration (not by
-- hand-creating a row in the dashboard), and a handful of test Learner/Teacher
-- accounts ride in with it so RLS can be exercised as a real role. Inserting
-- into auth.users fires ppg_profile_for_user, which materialises the profile
-- row with role/student-id/full_name taken from raw_user_meta_data.
--
-- Login identifier scheme (see 20260925000100_profiles_roles.sql + README):
-- the synthetic email `<handle>@ppga.local`. Learner handles are provisioned
-- student-IDs; teacher/admin handles are the role names. Passwords are
-- documented in README "Seeded credentials" (non-secret; local `supabase start`
-- instance only) and are NOT real production secrets.
--
-- auth.users.password carries the bcrypt hash Supa's gotrue verifies against
-- (one $2b$10 round hash of the documented test password ppga-test-2026, for
-- every seeded account). Regenerate locally inside the project (bcrypt is a
-- dev-time dependency): node -e "console.log(require('bcrypt').hashSync('ppga
-- -test-2026',10))". These are documented test credentials, not real secrets.
-- The uuids are fixed so the database-seam RLS tests can impersonate a seeded
-- role with request.jwt.claims = {"role":"<role>","sub":"<uuid>"}.
--
-- auth.users.role is the JWT role claim that auth.role() reads; we keep it in
-- sync with the profile role enum. A direct INSERT must also mirror the values
-- gotrue's own createUser stamps, or login breaks (#36, verified live against
-- a gotrue-created row): aud = 'authenticated' AND instance_id = the zero uuid
-- are the password-grant lookup's WHERE clauses (both columns default to NULL
-- here, so seeded rows were invisible to login); gotrue scans the four token
-- columns, created_at and updated_at into non-nullable Go fields (NULL -> a
-- 500 at login); and raw_app_meta_data carries the provider stamp. Production
-- provisioning rides gotrue's admin createUser, which stamps all of this
-- itself and is unaffected.

insert into auth.users (id, instance_id, role, aud, email, email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new, raw_user_meta_data, encrypted_password, raw_app_meta_data, created_at, updated_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'admin',
    'authenticated',
    'admin@ppga.local',
    now(),
    '',
    '',
    '',
    '',
    '{"student_id":"admin","full_name":"First Admin","role":"admin"}'::jsonb,
    '$2b$10$VzQdKrz3ofDl5qOtIPM2FOqVndGoxGW0w06ZZYkQPT/BDF/8rLbja',
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'teacher',
    'authenticated',
    'teacher@ppga.local',
    now(),
    '',
    '',
    '',
    '',
    '{"student_id":"teacher","full_name":"First Teacher","role":"teacher"}'::jsonb,
    '$2b$10$VzQdKrz3ofDl5qOtIPM2FOqVndGoxGW0w06ZZYkQPT/BDF/8rLbja',
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(),
    now()
  ),
  (
    '64110001-0001-0001-0001-000100010001',
    '00000000-0000-0000-0000-000000000000',
    'learner',
    'authenticated',
    '64110001@ppga.local',
    now(),
    '',
    '',
    '',
    '',
    '{"student_id":"64110001","full_name":"Learner One","role":"learner"}'::jsonb,
    '$2b$10$VzQdKrz3ofDl5qOtIPM2FOqVndGoxGW0w06ZZYkQPT/BDF/8rLbja',
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(),
    now()
  ),
  (
    '64110002-0002-0002-0002-000200020002',
    '00000000-0000-0000-0000-000000000000',
    'learner',
    'authenticated',
    '64110002@ppga.local',
    now(),
    '',
    '',
    '',
    '',
    '{"student_id":"64110002","full_name":"Learner Two","role":"learner"}'::jsonb,
    '$2b$10$VzQdKrz3ofDl5qOtIPM2FOqVndGoxGW0w06ZZYkQPT/BDF/8rLbja',
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(),
    now()
  ),
  (
    '64110003-0003-0003-0003-000300030003',
    '00000000-0000-0000-0000-000000000000',
    'teacher',
    'authenticated',
    '64110003@ppga.local',
    now(),
    '',
    '',
    '',
    '',
    '{"student_id":"64110003","full_name":"Teacher Three","role":"teacher"}'::jsonb,
    '$2b$10$VzQdKrz3ofDl5qOtIPM2FOqVndGoxGW0w06ZZYkQPT/BDF/8rLbja',
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

-- The trigger ran for every row above; assert the profiles exist for all five.
do $$ begin
  if (select count(*) from public.ppg_profiles) < 5 then
    raise exception 'ppg_profiles missing for seeded auth.users';
  end if;
end;
$$;
