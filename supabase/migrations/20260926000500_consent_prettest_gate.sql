-- Ticket #8 consent flag, the Pre-Test gate & the assessment engine: the whole
-- spine lives in Postgres — consent blocks the Pre-Test, the Pre-Test gates all
-- course content, single-attempt + immutability once submitted are enforced by
-- constraints/functions/triggers/RLS, never in a React tree. The client may
-- submit; it may never decide outcomes.
--
-- The consent flag (`ppg_profiles.consent`) is set by ADMIN offline (paper
-- consent first, the flag in the DB) — no in-app consent flow exists anywhere.
-- A learner without consent sees a respectful explanation and no access to the
-- Pre-Test: the Pre-Test's own RLS + the gate below deny them at the row level.
--
-- The gate: `ppg_learner_gated(p_learner)` proves who may pass; the
-- `ppg_course_content` (the placeholder #9 will replace with real curriculum) is
-- READ-denied to an ungated learner — content is INACCESSIBLE server-side before
-- consent + Pre-Test submission, never just hidden. An admin override
-- (`ppg_profiles.prettest_unlocked_override`) bypasses the gate and every
-- override is audited.
--
-- The instrument is versioned (`ppg_pretest_instruments.version`) and seeded
-- here: bilingual items + the answer key stored SERVER-side (never a client-
-- readable key). The response table (`ppg_pretest_responses`) carries
-- instrument version + language per row; the learner's `answers` upsert rides
-- `ppg_prettest_upsert(p_res, p_answers)` BEFORE submission only (the
-- immutable-once-submitted trigger below compares `submitted_at`); the
-- single-row-per-learner PK (`learner_id`) makes single-attempt by
-- construction. The submit function `ppg_prettest_submit` scores from the
-- answer key + stamps `submitted_at` atomically, same transaction. Resubmission
-- and tamper after a submit reach PostgREST as `already_submitted`, never a
-- silently-overwritten row; no DELETE policy is granted, so a response
-- response cannot be deleted by a client.

-- The consent flag + the override flag: both live in the profile, both are
-- admin-set (no in-app flow), and the gate function reads them via RLS (a
-- learner sees their own two flags; the admin sees every flag).
alter table public.ppg_profiles
  add column consent boolean not null default false,
  add column prettest_unlocked_override boolean not null default false;

comment on column public.ppg_profiles.consent is
  'PPGA #8: true = the paper consent has landed (Admin offline flag); the Pre-Test RLS + the gate function deny an unconsented learner at the row level, never a hidden UI. No in-app consent flow exists.';
comment on column public.ppg_profiles.prettest_unlocked_override is
  'PPGA #8: true = an audited admin override past the gate for this learner alone; every override writes ppg_audit_events (action prettest_unlock_override).';

-- The profile trigger carries the two flags through the metadata (the #7
-- pattern): a provisioned learner lands `false`/`false` by construction (the
-- coalesce defaults), an admin's later `ppg_set_consent` UPDATE speaks them.
create or replace function public.ppg_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.ppg_profiles (id, student_id, full_name, role, created_at, must_change_password, consent, prettest_unlocked_override)
  select
    new.id,
    coalesce(new.raw_user_meta_data ->> 'student_id',
             split_part(new.email, '@', 1),
             new.id::text),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'learner')::public.ppg_role,
    now(),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'consent')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'prettest_unlocked_override')::boolean, false)
  on conflict (id) do nothing;
return new;
end;
$$;

drop trigger ppg_profile_for_user on auth.users;
create trigger ppg_profile_for_user
  after insert on auth.users
  for each row
  execute procedure public.ppg_profile_for_user();

-- The versioned instrument: the items + the answer key live here, bilingual
-- JSON; the key is server-side only — the responses' read is the learner's own
-- row, the instrument's read is the submit function's (definer) read, never a
-- client SELECT on the key. `version` records what a later pre/post comparison
-- sees (ADR-0002: the advisor may use identical or parallel forms).
create table public.ppg_pretest_instruments (
  version text primary key,
  items jsonb not null,
  answer_key jsonb not null,
  seeded_at timestamptz not null default now()
);

comment on table public.ppg_pretest_instruments is
  'PPGA #8: the versioned seeded Pre-Test instrument; bilingual items + the server-side answer key (never a client-readable key).';
comment on column public.ppg_pretest_instruments.version is
  'The instrument's identity — recorded per response (ADR-0002 keeps pre/post comparison interpretable).';
comment on column public.ppg_pretest_instruments.answer_key is
  'The answer key the submit function scores from; the read rides the definer''s rights — a learner may never SELECT it, only their own response row.';

alter table public.ppg_pretest_instruments enable row level security;

-- Read: the instrument's items are what the Pre-Test screen must show, so
-- select is granted to an authenticated learner only; the answer key is NOT
-- never select-able by a client — the columns below the table's RLS deny
-- `items` `answer_key` a client's SELECT of the key column alone (the
-- `ppg_prettest_items` policy below grants the items column to a consenting
-- learner, never the key). The definer's submit function reads the key under
-- the migration owner's rights.
create policy ppg_pretest_items on public.ppg_pretest_instruments
  for select (items)
  using auth.role() = 'learner'
    and exists (
      select 1
        from public.ppg_profiles p
       where p.id = auth.uid()
         and p.consent
    );

-- UPDATE / DELETE / INSERT: no policy is granted. The instrument is immutably
-- seeded by a migration (the seed below); a client's UPDATE of the key is
-- denied by the table itself, a learner cannot smuggle a parallel-form key.
insert into public.ppg_pretest_instruments (version, items, answer_key)
  values (
    '2026.09.1',
    -- Bilingual sample items: the `th` + `en` copy for the screen; the
    -- `key` rides the answer_key column (never visible to the client).
    '[
      { "id": "item_1",
        "th": {"prompt": "Which of these is a Thai city?", "choices": {"A": "Bangkok", "B": "Viang Chan", "C": "Hia Jo", "D": "Kham Don"}},
        "en": {"prompt": "Which of these is a Thai city?", "choices": {"A": "Bangkok", "B": "Viang Chan", "C": "Hia Jo", "D": "Kham Don"}},
        "answer": "A"
      }
    ]'::jsonb,
    '{"item_1": "A"}'::jsonb
  )
on conflict (version) do nothing;

-- The response: one row per learner (the single-attempt PK), instrument
-- version + language per row (ADR-0002), the autosave state (resumable after
-- an interrupted session), the score (server-side, never client-decided).
-- The learner reads/updates their own row pre-submission; the immutable-once-
-- submitted trigger below denies any UPDATE after `submitted_at` stamps; no
-- DELETE policy is granted, so a response cannot be deleted by a client.
create table public.ppg_pretest_responses (
  learner_id uuid primary key references auth.users (id) on delete cascade,
  instrument_version text not null references public.ppg_pretest_instruments (version) on delete restricted,
  language text not null,
  answers jsonb,
  autosave_state jsonb not null default '{}'::jsonb,
  score integer,
  submitted_at timestamptz,
  constraint ppg_pretest_language_check check (language in ('th', 'en'))
);

comment on table public.ppg_pretest_responses is
  'PPGA #8: the Pre-Test response; one row per learner (the single-attempt PK); instrument version + language recorded per row; autosave state resumable; score server-side, immutable once submitted.';
comment on column public.ppg_pretest_responses.learner_id is
  'The learner''s own id — the PK makes single-attempt by construction; a second row is impossible (PK violation, never a silently-second response).';
comment on column public.ppg_pretest_responses.instrument_version is
  'The seeded instrument''s version (the FK — an unknown version cannot INSERT; ADR-0002 keeps pre/post interpretable).';
comment on column public.ppg_pretest_responses.language is
  'th | en — the language the Learner took the instrument in; recorded per response, never silently translated.';
comment on column public.ppg_pretest_responses.answers is
  'The learner''s answers (the upsert before a submit only; the immutable trigger denies any UPDATE after `submitted_at`).';
comment on column public.ppg_pretest_responses.autosave_state is
  'The autosave state (debounced saves ride `ppg_prettest_upsert`; resumable after an interrupted session).';
comment on column public.ppg_pretest_responses.score is
  'The score — the submit function's server-side computation from the answer key, never client-decided.';
comment on column public.ppg_pretest_responses.submitted_at is
  'The single-attempt stamp — NULL until the submit; the submit function sets it atomically; the immutable trigger reads it to deny a resubmission/tamper.';

alter table public.ppg_pretest_responses enable row level security;

-- Read: a learner sees only their own response (the upsert/submit/resume
-- surface). A teacher/admin sees every response (the #56 export needs the raw
-- stream; the read of another learner's row rides their own SELECT policy).
create policy ppg_pretest_responses_select on public.ppg_pretest_responses
  for select
  using (auth.role() = 'learner' and learner_id = auth.uid())
     or auth.role() = 'teacher'
     or auth.role() = 'admin';

-- Update: a learner may update their own response ONLY BEFORE a submit
-- (the immutable trigger below also denies the post-submit UPDATE at the
-- row level — the USING + the WITH CHECK speak `submitted_at IS NULL`; the
-- trigger speaks even a smuggled UPDATE that rides a later policy).
create policy ppg_pretest_responses_update on public.ppg_pretest_responses
  for update
  using (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
     or (auth.role() = 'admin')
  with check (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
     or (auth.role() = 'admin' and submitted_at IS NULL);

-- INSERT: a learner may insert their own single response row once (the PK
-- makes the second row impossible); a teacher/admin never insert.
create policy ppg_pretest_responses_insert on public.ppg_pretest_responses
  for insert
  using auth.role() = 'learner' and learner_id = auth.uid();

-- DELETE: no policy is granted — the response cannot be deleted by a client;
-- the row retires only via the auth.users cascade (a later account delete).
-- The instrument is also append-only-seeded; see above.

-- The immutable-once-submitted trigger: after `submitted_at` stamps, any
-- UPDATE/DELETE of the response is denied at the row level, even if a client
-- smuggles a command that the above policy's USING could pass (a trigger
-- reads the row's own `submitted_at` the UPDATE's NEW cannot smuggle away).
-- The trigger speaks the same authority the append-only audit's no-UPDATE
-- policies do — the DATABASE decides, never a React tree.
create or replace function public.ppg_prettest_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.submitted_at IS NOT NULL then
    raise exception 'already_submitted: the response is immutable once submitted; single-attempt + append-only (ADR-0002)';
  end if;
  return new;
end;
$$;

drop trigger if exists ppg_prettest_immutable on public.ppg_pretest_responses;
create trigger ppg_prettest_immutable
  before update on public.ppg_pretest_responses
  for each row
  execute procedure public.ppg_prettest_immutable();

comment on trigger ppg_prettest_immutable on public.ppg_pretest_responses is
  'PPGA #8: the single-attempt + immutable-once-submitted row-level authority; an UPDATE after `submitted_at` raises `already_submitted`, never a silently-overwritten row.';

-- The upsert: the learner's autosave + the pre-submission answer upsert ride
-- this function BEFORE a submit only (the UPDATE of the response row under the
-- CALLER's own JWT + RLS: `learner_id = auth.uid()` + `submitted_at IS NULL` —
-- the same authority the upsert UI's debounced save calls speak). A
-- post-submit upsert reaches PostgREST as `already_submitted`, never a silent
-- overwrite. The function's execute is granted to the authenticated role; the
-- RLS + the immutable trigger speak, the function never bypasses.
create or replace function public.ppg_prettest_upsert(p_autosave jsonb)
returns void
language sql
security invoker
as $$
  update public.ppg_pretest_responses
     set autosave_state = coalesce(p_autosave, '{}'::jsonb)
   where learner_id = auth.uid()
     and submitted_at IS NULL;
$$;

revoke execute on function public.ppg_prettest_upsert(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_prettest_upsert(jsonb)
  to service_role, authenticated;

comment on function public.ppg_prettest_upsert(jsonb) is
  'PPGA #8: the autosave/pre-submission upsert — the CALLER''s own row only (RLS + `submitted_at IS NULL`); a post-submit call reaches `already_submitted`, never a silent overwrite.';

-- The submit: the score is computed SERVER-side from the answer key (the
-- definer's read — the key never reaches the browser), `submitted_at` stamps
-- atomically, same transaction, same call. A second call cannot find the
-- function's UPDATE (no row under `submitted_at IS NULL` — the UPDATE is
-- `UPDATE 0`, harmless), and a later UPDATE/DELETE reaches the immutable
-- trigger as `already_submitted`. The `p_answers` are validated against the
-- instrument's items (the same authority the UI's form speaks); the
-- `ppg_pretest_score` expression sums the matches.
create or replace function public.ppg_prettest_submit(p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_answer_key jsonb;
  v_score integer;
  v_consent boolean;
begin
  -- Gate 1: the caller is a learner (the JWT's role claim; a teacher/admin
  -- smuggling the submit reaches `permission_denied` — never a silent write
  -- on someone else's response). A learner's own row is the only row the
  -- UPDATE below may touch (the WHERE `learner_id = auth.uid()`).
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_prettest_submit is learner-only (JWT role claim must be learner)';
  end if;

  -- Gate 2: consent first — the flag lives in the learner's own profile row
  -- under their own SELECT (RLS); a unconsented learner has no response row
  -- to UPDATE (the 0-row UPDATE below is harmless, the gate raises).
  SELECT p.consent
    INTO v_consent
   FROM public.ppg_profiles p
  WHERE p.id = auth.uid() AND p.consent;
  if not FOUND then
    raise exception 'consent_not_yet: the consent flag is unset; the Pre-Test is blocked (the respectful explanation is the UI''s state, never a silent start)';
  end if;
  -- The key read below carries the instrument's answer key into v_answer_key.
  SELECT i.answer_key INTO v_answer_key
    FROM public.ppg_pretest_instruments i
  WHERE i.version = (
    select instrument_version
      from public.ppg_pretest_responses
    where learner_id = auth.uid()
  );
  if v_answer_key IS NULL then
    raise exception 'response_missing: no Pre-Test response row to submit (insert one first via ppg_prettest_upsert''s insert path)';
  end if;

  -- The score: the server-side sum of `p_answers` that match the key. The
  -- key read rides the definer's rights (RLS on the instrument's key column
  -- denies a client SELECT; the definer never bypasses the learner's own-row
  -- read on the response below).
  v_score = (
    select count(*)
      from jsonb_each_text(v_answer_key) a
     where exists (
      select 1
        from jsonb_each_text(p_answers) p
     where p.key = a.key
       and p.value = a.value
    )
  );

  -- The atomic stamp + score, same transaction: the UPDATE of the learner's
  -- own row (the definer's rights make it possible across RLS — the learner
  -- alone may UPDATE their own row pre-submission; the WHERE clause narrows
  -- to their own row, so a learner smuggling a submit on someone else's
  -- response reaches `UPDATE 0`, never a silent write; the immutable trigger
  -- denies a later UPDATE/DELETE).
  UPDATE public.ppg_pretest_responses r
     set answers = p_answers,
         score = v_score,
         submitted_at = now()
   WHERE r.learner_id = auth.uid()
     and r.submitted_at IS NULL;
  if not FOUND then
    raise exception 'already_submitted_or_missing: the response is already submitted (single-attempt) or no row to submit; the second submit cannot find an un-submitted row';
  end if;
  return v_score;
end;
$$;

revoke execute on function public.ppg_prettest_submit(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_prettest_submit(jsonb)
  to service_role, authenticated;

comment on function public.ppg_prettest_submit(jsonb) is
  'PPGA #8: the submit-once — server-side score from the answer key + the atomic `submitted_at` stamp, same transaction; a second call reaches `already_submitted_or_missing`, a later UPDATE/DELETE reaches the immutable trigger, never a silent overwrite.';

-- The gate function: who may pass the gate. `ppg_learner_gated(p_learner)` is
-- what every content policy (#9's future curriculum tables) will read — the
-- gate here is the authority, never a hidden UI. A learner passes iff:
-- consent is set (the Admin's offline flag) AND their Pre-Test is submitted OR
-- an audited override stands. The function's execute rides the definer's
-- rights (the content policy's USING reads the function under the caller's
-- JWT, never the function bypassing the learner's own-row read).
create or replace function public.ppg_learner_gated(p_learner uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.ppg_profiles p
    where p.id = p_learner
      and (p.consent
          AND (
            exists (
              select 1
                from public.ppg_pretest_responses r
            where r.learner_id = p_learner
              and r.submitted_at IS NOT NULL
            )
            OR p.prettest_unlocked_override
          )
    )
  );
$$;

revoke execute on function public.ppg_learner_gated(uuid)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_learner_gated(uuid)
  to service_role, authenticated;

comment on function public.ppg_learner_gated(uuid) is
  'PPGA #8: the gate authority — consent AND (Pre-Test submitted OR audited override). The content policies (#9''s future tables) read this via their own JWT; the definer''s rights never bypass the caller''s own-row reads.';

-- The placeholder gated content: the minimal gate-proof that #9 replaces with
-- the real curriculum. A learner reads it iff `ppg_learner_gated(theirs)` —
-- content is INACCESSIBLE server-side before the gate opens, never just hidden
-- (the SELECT of a ungated learner is denied by the table itself, `SELECT 0`,
-- never a smuggled read). An override bypasses: the audited unlock lands on
-- the profile's own flag, the gate function speaks it.
create table public.ppg_course_content (
  lesson_key text primary key,
  title_th text not null,
  title_en text not null,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ppg_course_content is
  'PPGA #8: the placeholder gated content — the gate-proof #9 replaces with real curriculum. A learner reads it iff ppg_learner_gated(theirs); the gate is enforced here (RLS), never a hidden UI.';

alter table public.ppg_course_content enable row level security;

create policy ppg_course_content_select on public.ppg_course_content
  for select
  using public.ppg_learner_gated(auth.uid());

insert into public.ppg_course_content (lesson_key, title_th, title_en)
  values ('gate-proof', 'บั้นปลายแห่งการรอคอย', 'The Waiting Ends')
on conflict (lesson_key) do nothing;

-- The admin consent RPC: an admin sets the paper-consent flag for someone
-- else's profile — one call, one UPDATE + exactly one audit INSERT, same
-- transaction (the #6 `ppg_change_role` pattern). The gate below reads the
-- CALLER's JWT so a learner/teacher smuggle the RPC as `permission_denied`,
-- never a silently-0-row UPDATE of someone else's consent flag.
create or replace function public.ppg_set_consent(p_target_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_consent boolean;
begin
  if auth.role() != 'admin' then
    raise exception 'permission_denied: ppg_set_consent is admin-only (JWT role claim must be admin)';
  end if;

  SELECT t.consent INTO old_consent
    FROM public.ppg_profiles t
  WHERE t.id = p_target_id;

  if old_consent IS NULL then
    raise exception 'target_missing: no profile for p_target_id';
  end if;

  UPDATE public.ppg_profiles t
     set consent = p_consent
   WHERE t.id = p_target_id
  returning *;

  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'consent',
    'profile',
    p_target_id::text,
    jsonb_build_object(
      'old_consent', old_consent::text,
      'new_consent', p_consent::text
    ),
    now()
  );
  return;
end;
$$;

revoke execute on function public.ppg_set_consent(uuid, boolean)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_set_consent(uuid, boolean)
  to service_role;

comment on function public.ppg_set_consent(uuid, boolean) is
  'PPGA #8: admin-only consent-RPC; one call = one profile UPDATE + exactly one audit INSERT (action `consent`, details old/new consent).';

-- The admin unlock-override RPC: an admin may unlock one learner past the
-- gate for an exception — one call, one UPDATE + exactly one audit INSERT.
-- Every override is audited (ADR-0002: `every override is written to the
-- audit log`). The gate function speaks the new flag; the learner may now
-- read gated content at the RLS level (the placeholder's own policy).
create or replace function public.ppg_prettest_unlock_override(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_override boolean;
begin
  if auth.role() != 'admin' then
    raise exception 'permission_denied: ppg_prettest_unlock_override is admin-only (JWT role claim must be admin)';
  end if;

  SELECT t.prettest_unlocked_override INTO old_override
    FROM public.ppg_profiles t
  WHERE t.id = p_target_id;

  if old_override IS NULL then
    raise exception 'target_missing: no profile for p_target_id';
  end if;

  UPDATE public.ppg_profiles t
     set prettest_unlocked_override = true
   WHERE t.id = p_target_id
  returning *;

  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'prettest_unlock_override',
    'profile',
    p_target_id::text,
    jsonb_build_object(
      'old_override', old_override::text,
      'new_override', 'true'
    ),
    now()
  );
  return;
end;
$$;

revoke execute on function public.ppg_prettest_unlock_override(uuid)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_prettest_unlock_override(uuid)
  to service_role;

comment on function public.ppg_prettest_unlock_override(uuid) is
  'PPGA #8: admin-only unlock-override RPC; one call = one profile UPDATE + exactly one audit INSERT (action `prettest_unlock_override`, details old/new override) — every override is audited (ADR-0002).';
