-- Ticket #10 the Lesson reader + the gamification foundation: the Self-Check
-- ends every Lesson (the DATABASE's own answer key checks — never the
-- browser's key), the XP ledger records every grant with its PK, the Level +
-- the next-Level progress DERIVE from the ledger (no fake numbers), and the
-- First Steps badge rides the first-pass EVENT. The Mission gate the #9's
-- linear rule reads stands server-side: the Self-Check pass of a Module's
-- LAST lesson marks that Module self-check-complete, but the NEXT module
-- stays LOCKED until the previous module's Mission completes (the
-- `ppg_module_missions` placeholder rows this migration does NOT write —
-- #11/#13 are the missions; the unlock function keeps honoring both the
-- conditions, parameterized for the seam below).
--
-- The idempotency: the ledger's PRIMARY KEY (learner_id, event_type,
-- event_ref) is the once-per-learner-per-event authority — a retry, a
-- double-click, a replay INSERT reaches `unique_violation` server-side,
-- never a second +50 a learner keeps; the badge award's PK (learner_id,
-- badge_key) is the once-per-learner-badge authority. The ADR-0001 rules
-- hold here: XP is the only gamification currency (a ledger row is the
-- only a reward's record), research instruments award NOTHING (no
-- prettest/final? no reward for the #8's instrument ever appears here),
-- XP ≠ any score (the Self-Check is NOT a scored assessment — the events
-- table carries pass|fail ONLY, no grade column; a grade never lands).

-- The Self-Check questions: the #16 story's per-Lesson check the learner
-- answers IN THE LESSON (the read's RPC filtered to the CALLER's visibility
-- — gated + published + the module OPEN; a locked/draft/arched Lesson's
-- questions are INVISIBLE server-side, never a hidden UI). The option's own
-- `is_correct` is the answer key — the column lives server-side ONLY: no
-- policy lets a browser SELECT the key, the check function sums it. A
-- question = 3 options (a|b|c), 2..3 questions per Lesson (the
-- `ppg_self_check_question_order_unique`), seeded for module 1 here.
create table public.ppg_self_check_questions (
  lesson_key text not null references public.ppg_lessons (lesson_key) on delete cascade,
  order_index integer not null,
  option_key text not null,
  prompt_th text not null,
  prompt_en text not null,
  option_th text not null,
  option_en text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (lesson_key, order_index, option_key),
  constraint ppg_self_check_option_key_check check (option_key in ('a', 'b', 'c', 'd')),
  constraint ppg_self_check_question_order_check check (order_index between 1 and 3),
  constraint ppg_self_check_question_order_unique unique (lesson_key, order_index),
  constraint ppg_self_check_options_per_question_check check (option_key in ('a', 'b', 'c'))
);

comment on table public.ppg_self_check_questions is
  'PPGA #10: the per-Lesson Self-Check questions (2..3 per Lesson, 3 options a|b|c); bilingual prompt+option; the answer key (is_correct) is SERVER-side only (no SELECT policy lets a browser read a key, the check function sums it).';

alter table public.ppg_self_check_questions enable row level security;

-- Read as a Learner: the gate (#8) AND the Lesson's own visibility (the
-- `ppg_self_check_visible` function: published + the parent module OPEN) —
-- a locked/draft/arched Lesson''s questions never appear (`SELECT 0`),
-- never a smuggled read. A Teacher/admin reads every row incl the key
-- (the console sees what the migration seeds). No INSERT/UPDATE/DELETE
-- policy — a migration seeds the questions (ADR-0003: content as versioned
-- seed), the check function writes EVENTS, never a client deciding.
create policy ppg_self_check_questions_select on public.ppg_self_check_questions
  for select
  using (auth.role() = 'learner' AND public.ppg_self_check_visible(auth.uid(), lesson_key))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The answer-key invisibility: the Learner''s own SELECT of the key column
-- is denied by the same authority the row policy speaks (the visibility
-- function AND the column''s own `is_correct` live server-side) — the
-- check function's definer read is the ONLY summing read.
create or replace function public.ppg_self_check_visible(p_caller uuid, p_lesson_key text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.ppg_lessons l
    where l.lesson_key = p_lesson_key
      and l.publication_state = 'published'
      and public.ppg_module_unlocked(auth.uid(), l.module_key)
      and public.ppg_learner_gated(auth.uid())
  );
$$;

revoke execute on function public.ppg_self_check_visible(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_self_check_visible(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_self_check_visible(uuid, text) is
  'PPGA #10: the Lesson''s own visibility the questions ride (gate #8 + published + the module OPEN) — a locked/draft/arched Lesson is INVISIBLE server-side, never a hidden UI.';

-- The questions read: the RPC the LESSON page calls (the same authority the
-- row policy speaks + the CALLER''s JWT; every SEE-ABLE question of the
-- LESSON lands (option_key + prompt/option bilingual; the `is_correct` key
-- NEVER lands in the jsonb — the browser never sees the answer key, the
-- check function''s definer read sums it server-side only).
create or replace function public.ppg_self_check_questions(p_lesson_key text)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lesson_key', q.lesson_key,
        'order_index', q.order_index,
        'option_key', q.option_key,
        'prompt_th', q.prompt_th,
        'prompt_en', q.prompt_en,
        'option_th', q.option_th,
        'option_en', q.option_en
      ) ORDER BY q.order_index, q.option_key
    )::jsonb,
    '[]'::jsonb
  )
  -- the CALLER sees questions iff the Lesson is SEE-ABLE (the same authority
  -- the row policy speaks; the key column never rides out).
  from public.ppg_self_check_questions q
  where q.lesson_key = p_lesson_key
    and (
      auth.role() in ('teacher', 'admin')
      OR (
        auth.role() = 'learner'
        and public.ppg_self_check_visible(auth.uid(), p_lesson_key)
      )
    );
$$;

revoke execute on function public.ppg_self_check_questions(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_self_check_questions(text)
  to service_role, authenticated;

comment on function public.ppg_self_check_questions(text) is
  'PPGA #10: the Self-Check questions a SEE-ABLE Lesson shows (gate + published + module OPEN for a learner; all for teacher/admin); the jsonb NEVER carries is_correct (the answer key never reaches the browser; the check function''s definer read is the only summing authority).';

-- The Self-Check events: the append-only attempt stream — a retry, a replay
-- INSERT of the same answers ADDS a row (unlimited retries, the
-- `ppg_self_check_events_pk` stamps `attempt_seq` as the retry count the
-- ledger''s own count + 1), while the outcome is pass|fail ONLY (no grade —
-- the Self-Check is NOT a scored assessment; the ADR-0001 separation: the
-- pass/fail never becomes a result). Learner reads their own events;
-- Teacher/admin read all; NO INSERT policy from a client (the writes land
-- via the check function''s definer insert, never a client deciding).
create table public.ppg_self_check_events (
  learner_id uuid not null references auth.users (id) on delete cascade,
  lesson_key text not null references public.ppg_lessons (lesson_key) on delete cascade,
  outcome text not null,
  attempt_seq integer not null,
  created_at timestamptz not null default now(),
  primary key (learner_id, lesson_key, attempt_seq),
  constraint ppg_self_check_outcome_check check (outcome in ('pass', 'fail'))
);

comment on table public.ppg_self_check_events is
  'PPGA #10: the append-only Self-Check attempt stream (unlimited retries add rows; the PK stamps the retry count); outcome pass|fail ONLY — NOT a scored assessment (no grade column ever lands, ADR-0001: XP ≠ any score).';

alter table public.ppg_self_check_events enable row level security;

create policy ppg_self_check_events_select on public.ppg_self_check_events
  for select
  using (auth.role() = 'learner' AND learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The XP ledger: the SINGLE gamification currency the ADR-0001 names — the
-- once-per-learner-per-event grant authority IS the PRIMARY KEY
-- (learner_id, event_type, event_ref): a retry, a double-click, a replay
-- INSERT of the same event reaches `unique_violation` server-side, never a
-- second +50; the ledger''s own PK makes the idempotency STRUCTURAL, not a
-- a convention (the check function''s `ON CONFLICT DO NOTHING` ride the
-- same key). Learner reads their own rows; Teacher/admin read all; the
-- writes are the definer''s ONLY (no client INSERT — the client never
-- decides what XP a learner holds).
create table public.ppg_xp_ledger (
  learner_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  event_ref text not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (learner_id, event_type, event_ref),
  constraint ppg_xp_event_type_check check (
    event_type in ('self_check_pass', 'knowledge_mission_pass', 'practical_approval', 'final_project')
  )
);

comment on table public.ppg_xp_ledger is
  'PPGA #10: the XP ledger — the ONLY gamification currency (ADR-0001; a reward''s record is a ledger row). The PK (learner_id, event_type, event_ref) IS the once-per-learner-per-event authority: a replay INSERT reaches unique_viation, never a second +50. Research instruments award nothing (no prettest row type ever appears). XP ≠ any score.';
comment on column public.ppg_xp_ledger.event_ref is
  'PPGA #10: the event''s handle (a Lesson''s self-check pass = its lesson_key; a mission = its module_key) — the once-per-learner-per-event idempotency the PK speaks.';
comment on column public.ppg_xp_ledger.event_type is
  'PPGA #10: the four awardable events ONLY (self_check_pass +50, knowledge_mission_pass +100, practical_approval +150, final_project +300 — the later tickets'' grants); a research instrument (Pre/Post-Test, Survey) is NOT a grantable type here, ADR-0001.';

alter table public.ppg_xp_ledger enable row level security;

create policy ppg_xp_ledger_select on public.ppg_xp_ledger
  for select
  using (auth.role() = 'learner' AND learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The badge types: the named achievements the later tickets'' badges ride
-- (the taxonomy is shared — read-only to the authenticated roles, never
-- author-able by a client). Seeded here with the First Steps badge (the
-- first Self-Check pass awards it; #13+ add the mission/project badges).
create table public.ppg_badge_types (
  badge_key text primary key,
  label_th text not null,
  label_en text not null,
  award_rule_th text not null,
  award_rule_en text not null,
  award_event text not null,
  created_at timestamptz not null default now()
);

comment on table public.ppg_badge_types is
  'PPGA #10: the badge taxonomy (First Steps = the first Self-Check pass; the #13+ tickets add the mission/project badges) — read-only to the authenticated roles, no client authoring (ADR-0003).';

alter table public.ppg_badge_types enable row level security;

create policy ppg_badge_types_select on public.ppg_badge_types
  for select
  using auth.role() in ('learner', 'teacher', 'admin');

insert into public.ppg_badge_types
  (badge_key, label_th, label_en, award_rule_th, award_rule_en, award_event)
values
  (
    'first_steps',
    'ก้าวแรก (First Steps)',
    'First Steps',
    'ก้าวแรกแห่งทุกทักษะ — ผ่าน Self-Check ครั้แรก (50 XP)',
    'First Steps on the whole spine — awarded on the first Self-Check pass (a real event, +50 XP once)',
    'self_check_pass'
  )
on conflict (badge_key) do nothing;

-- The badge awards: the learner''s earned badges — the once-per-learner-
-- badge authority IS the PRIMARY KEY (learner_id, badge_key): a retry,
-- a replay INSERT of the same award reaches `unique_violation`, never a
-- second badge; the award is the EVENT''s own record (the same transaction
-- the pass''s ledger row + the award ride — the badge lands on a REAL
-- achievement, never a fake award). Learner reads their own awards;
-- Teacher/admin read all; the writes are the definer''s ONLY.
create table public.ppg_badge_awards (
  learner_id uuid not null references auth.users (id) on delete cascade,
  badge_key text not null references public.ppg_badge_types (badge_key) on delete restrict,
  award_event text not null,
  event_ref text not null,
  awarded_at timestamptz not null default now(),
  primary key (learner_id, badge_key),
  constraint ppg_badge_award_event_check check (award_event in ('self_check_pass', 'knowledge_mission_pass', 'practical_approval', 'final_project'))
);

comment on table public.ppg_badge_awards is
  'PPGA #10: the earned-badges (the PK (learner_id, badge_key) is the once-per-learner-badge authority; the award is a real achievement''s record — the First Steps badge lands in the same transaction as the first pass''s ledger row, never a fake award).';

alter table public.ppg_badge_awards enable row level security;

create policy ppg_badge_awards_select on public.ppg_badge_awards
  for select
  using (auth.role() = 'learner' AND learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The check: the DATABASE''s own answer-key sum the LESSON page''s submit
-- calls (POST /api/self-check/submit — the browser never sees the key,
-- never decides the outcome). The function''s gates: a CALLER who is not a
-- learner reaches `permission_denied`; an ungated learner reaches
-- `gate_closed` (never a started Self-Check); a Lesson not SEE-ABLE
-- reaches `lesson_not_visible` server-side (never a hidden check). The
-- outcome: EVERY question''s option the CALLER answered matches the
-- option''s `is_correct` ⇒ pass; a missing key, a wrong one ⇒ fail.
-- On pass the function INSERTs the pass EVENT (unlimited retries: the
-- `attempt_seq` the events''s own count + 1), the +50 XP LEDGER row
-- (idempotent ON CONFLICT — a retry replays to conflict, never a second
-- +50; `xp_granted` the return says 50 the first, 0 the replay), and
-- the First Steps BADGE on the CALLER''s FIRST pass of ANY Lesson
-- (the award PK ON CONFLICT — a second badge reaches conflict, never a
-- duplicate). No grade column ever lands (the Self-Check is NOT a
-- scored assessment); the XP is the ADR-0001''s ONLY currency.
create or replace function public.ppg_check_self_check(p_lesson_key text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_outcome text;
  v_correct_total integer;
  v_correct_matched integer;
  v_wrong_answers integer;
  v_attempts integer;
  v_granted_xp integer := 0;
  v_badge_granted boolean := false;
begin
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_check_self_check is learner-only (the JWT role claim must be learner)';
  end if;

  if not public.ppg_learner_gated(auth.uid()) then
    raise exception 'gate_closed: the #8 gate (consent AND the Pre-Test submitted, OR the audited override) must stand before a Self-Check runs';
  end if;

  if not public.ppg_self_check_visible(auth.uid(), p_lesson_key) then
    raise exception 'lesson_not_visible: the Lesson is locked/draft/arched server-side — no check runs on it (never a hidden UI)';
  end if;

  -- the DATABASE''s own answer-key sum: the answer jsonb''s keys ARE the
  -- question order_index strings ('1','2'…), the values are the chosen
  -- option_key. PASS iff EVERY correct question's order_index key lands an
  -- answer equal to its `is_correct` option AND no answered option is a
  -- wrong one (a missing key, a wrong one ⇒ fail). The key read here is
  -- the definer''s ONLY — the browser never SELECTs the key (the read RPC
  -- never carries is_correct).
  select count INTO v_correct_total
    FROM public.ppg_self_check_questions q
  WHERE q.lesson_key = p_lesson_key
    AND q.is_correct;

  select count INTO v_correct_matched
    FROM public.ppg_self_check_questions q
  WHERE q.lesson_key = p_lesson_key
    AND q.is_correct
    AND (p_answers ->> q.order_index::text) = q.option_key;

  select count INTO v_wrong_answers
    FROM public.ppg_self_check_questions q
  WHERE q.lesson_key = p_lesson_key
    AND NOT q.is_correct
    AND (p_answers ->> q.order_index::text) = q.option_key;

  -- the outcome; the attempt count; the idempotent ledger insert; the
  -- first-pass badge.
  if v_correct_matched = v_correct_total AND v_wrong_answers = 0 then
    v_outcome = 'pass';
  else
    v_outcome = 'fail';
  end if;

  select coalesce(max(e.attempt_seq), 0) + 1 INTO v_attempts
    FROM public.ppg_self_check_events e
  WHERE e.learner_id = auth.uid()
    AND e.lesson_key = p_lesson_key;

  insert into public.ppg_self_check_events (learner_id, lesson_key, outcome, attempt_seq, created_at)
  values (
    auth.uid(),
    p_lesson_key,
    v_outcome,
    v_attempts,
    now()
  );

  if v_outcome = 'pass' then
    -- the +50 the first pass the ONLY grant authority is the ledger''s PK
    -- (learner_id, event_type, event_ref) — a retry/double-click/replay
    -- INSERT reaches conflict, never a second +50 a learner keeps; the
    -- `xp_granted` the return says what the CALLER actually received.
    if not exists (
      select 1
        from public.ppg_xp_ledger x
      where x.learner_id = auth.uid()
        and x.event_type = 'self_check_pass'
        and x.event_ref = p_lesson_key
    ) then
      insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
      values (auth.uid(), 'self_check_pass', p_lesson_key, 50, now());
      v_granted_xp = 50;
    end if;

    -- the First Steps badge the CALLER''s FIRST pass of ANY Lesson awards
    -- it ONCE — the award PK (learner_id, badge_key) is the authority; a
    -- second award (any Lesson, any retry) reaches conflict, never a
    -- duplicate badge.
    if not exists (
      select 1
        from public.ppg_badge_awards b
      where b.learner_id = auth.uid()
        and b.badge_key = 'first_steps'
    ) then
      insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
      values (auth.uid(), 'first_steps', 'self_check_pass', p_lesson_key, now());
      v_badge_granted = true;
    end if;

    return jsonb_build_object(
      'lesson_key', p_lesson_key,
      'outcome', v_outcome,
      'attempt_seq', v_attempts,
      'xp_granted', v_granted_xp,
      'badge_granted', v_badge_granted
    );
  end if;

  return jsonb_build_object(
    'lesson_key', p_lesson_key,
    'outcome', v_outcome,
    'attempt_seq', v_attempts,
    'xp_granted', v_granted_xp,
    'badge_granted', v_badge_granted
  );
end;
$$;

revoke execute on function public.ppg_check_self_check(text, jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_check_self_check(text, jsonb)
  to service_role, authenticated;

comment on function public.ppg_check_self_check(text, jsonb) is
  'PPGA #10: the DATABASE''s own answer-key sum (server-side pass/fail ONLY — no grade ever lands, the Self-Check is NOT a scored assessment; a learner smuggle reaches permission_denied; an ungated reaches gate_closed; a locked/draft/arched lesson reaches lesson_not_visible). Pass writes the pass EVENT (unlimited retries: the attempt_seq the events''s count +1), the +50 ledger row (idempotent: the PK (learner_id, event_type, event_ref) — a replay conflicts, never a second +50; xp_granted says what actually landed), and the First Steps badge on the CALLER''s FIRST pass of ANY lesson (the award PK — a duplicate conflicts). The XP is the ADR-0001''s ONLY currency.';

-- The XP read: the header''s real Level/XP/progress the learner''s own
-- ledger DERIVES from — the SUM total XP; the Level the floor(total/100)+1
-- formula (no fake numbers: the read is the ledger''s sum, never a client
-- count); the next-Level progress the remainder/100 + the xp-to-next
-- (next threshold = level*100) — the real state the `ppg_xp_bar`/
-- `ppg_progress_bar` render; the earned badges ride the awards (a real
-- achievement''s record, never a fake award). The definer''s rights read
-- FILTERED to the CALLER''s own learner_id — an other learner''s XP/Level
-- never rides out.
create or replace function public.ppg_xp_summary()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with v_total as (
    select coalesce(sum(x.amount)::int, 0::int) AS t
      from public.ppg_xp_ledger x
    where x.learner_id = auth.uid()
  ),
  v_level as (
    select floor(v_total.t / 100::float)::int + 1 AS level
      from v_total
  ),
  v_state as (
    select
      v_total.t,
      v_level.level,
      (v_level.level * 100 - v_total.t)::int AS xp_to_next,
      (
        (v_total.t - floor(v_total.t / 100::float)::int * 100)::int
        / 100::float * 100
      )::numeric AS progress_pct,
      coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'badge_key', b.badge_key,
            'label_th', t.label_th,
            'label_en', t.label_en,
            'event_ref', b.event_ref,
            'award_event', b.award_event
          ) ORDER BY b.awarded_at
        )::jsonb
          from public.ppg_badge_awards b
          JOIN public.ppg_badge_types t ON b.badge_key = t.badge_key
        WHERE b.learner_id = auth.uid()
        ),
        '[]'::jsonb
      ) AS badges
      from v_total, v_level
  )
  select jsonb_build_object(
    'total_xp', v_state.t,
    'level', v_state.level,
    'xp_to_next', v_state.xp_to_next,
    'progress_pct', v_state.progress_pct,
    'badges', v_state.badges
  )
  FROM v_state;
$$;

revoke execute on function public.ppg_xp_summary()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_xp_summary()
  to service_role, authenticated;

comment on function public.ppg_xp_summary() is
  'PPGA #10: the header''s real Level/XP/progress DERIVED from the learner''s own ledger (total = the SUM; level = floor(total/100)+1; xp_to_next = level*100 - total; progress = remainder/100) + the earned badges (the awards''s own records) — no fake numbers (the state is the ledger''s read, never a client count); filtered to the CALLER''s own rows (an other learner''s XP never appears).';

-- The linear rule WIRE: the #9''s `ppg_module_unlocked` honors BOTH the
-- Self-Check AND the Mission now — module 1 opens on the #8 gate alone
-- (the policy''s own gate AND this); module N+1 opens iff the previous
-- module''s LAST lesson''s Self-Check passed AND its Mission completed.
-- The mission-condition the placeholder stays INCOMPLETE (this migration
-- DOES NOT write `ppg_module_missions` — #11/#13 wire the Knowledge/
-- Practical missions + their complete writes; the SEAM seam: an unlock
-- test marks the placeholder complete server-side the row''s own UPDATE
-- policy still denies a client, the service's definer writes). What stays
-- LOCKED meanwhile: module 2 (its mission incomplete) — a learner who
-- passed module 1''s self-checks still sees module 2 LOCKED (the gate the
-- ticket asserts: the Self-Check gates the Mission, the Mission still
-- decides the unlock).
create or replace function public.ppg_module_unlocked(p_caller uuid, p_module_key text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order integer;
  v_prev_key text;
begin
  select m.order_index INTO v_order
    FROM public.ppg_modules m
  WHERE m.module_key = p_module_key;
  if v_order IS NULL then
    return false;
  end if;

  -- Module 1 (the first module) opens on the #8 gate alone — the policy
  -- ANDs this function with `ppg_learner_gated`, so `true` here is only
  -- the linear-rule part.
  if v_order = 1 then
    return true;
  end if;

  select m2.module_key INTO v_prev_key
    FROM public.ppg_modules m2
  WHERE m2.order_index = v_order - 1
  LIMIT 1;

  if v_prev_key IS NULL then
    return false;
  end if;

  -- The rule now honors BOTH conditions (the ticket''s WIRE): the previous
  -- module''s LAST lesson''s Self-Check passed AND its Mission completed.
  -- The mission rows this migration DOES NOT write — the placeholder
  -- `incomplete` (the `ppg_module_missions` UPDATE/INSERT policies deny a
  -- client; #11/#13 wire the real writes). So module 2 stays LOCKED even
  -- after module 1''s self-checks pass — the gate the ticket asserts.
  return exists (
    select 1
      FROM public.ppg_module_missions mi
    WHERE mi.learner_id = p_caller
      AND mi.module_key = v_prev_key
      AND mi.status = 'complete'
  )
  AND exists (
    select 1
      FROM public.ppg_self_check_events e
    WHERE e.learner_id = p_caller
      AND e.lesson_key = (
        select l.lesson_key
          FROM public.ppg_lessons l
        WHERE l.module_key = v_prev_key
        ORDER BY l.order_index DESC
        LIMIT 1
      )
      AND e.outcome = 'pass'
  );
end;
$$;

revoke execute on function public.ppg_module_unlocked(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_unlocked(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_module_unlocked(uuid, text) is
  'PPGA #9+#10: the linear-rule authority — module 1 open on the #8 gate alone; module N+1 iff the previous module''s LAST lesson''s Self-Check passed AND its Mission is `complete` for the CALLER (the #10 wires the self-check condition here; the mission-condition the placeholder `incomplete` — #11/#13 write the real `complete`. What stays LOCKED meanwhile: module 2 (mission incomplete) even after module 1''s self-checks pass.';

-- The seeded Self-Check questions: the module-1 Lessons' checks, 2..3 per
-- Lesson, 3 options a|b|c, bilingual prompts/options, the `is_correct`
-- server-side (the answer key never lands in the read RPC's jsonb).
-- `module-01-lesson-01` (Opening PowerPoint & a new presentation): the
-- Home-tab's New button the learner saw in the Lesson's body.
-- `module-01-lesson-02` (Switch panes & views): the Normal view the slide
-- list rides + the Preview's audience view. All Thai/English copy is
-- real content in BOTH languages (ADR-0003), concise.
insert into public.ppg_self_check_questions
  (lesson_key, order_index, option_key, prompt_th, prompt_en, option_th, option_en, is_correct)
values
  -- Lesson 1, Q1 (the New button's tab):
  ('module-01-lesson-01', 1, 'a', 'ปุ่น-Home คือที่ใด', 'Where is the New button for a presentation?', 'บน-Home (ปุ่ม-New)', 'On the Home tab (New)', true),
  ('module-01-lesson-01', 1, 'b', 'ปุ่น-Home คือที่ใด', 'Where is the New button for a presentation?', 'บน-File (ปุ่ม-Open)', 'On the File tab (Open)', false),
  ('module-01-lesson-01', 1, 'c', 'ปุ่น-Home คือที่ใด', 'Where is the New button for a presentation?', 'บน-View (ปุ่ม-New Slide)', 'On the View tab (New Slide)', false),
  -- Lesson 1, Q2 (the first step to open):
  ('module-01-lesson-01', 2, 'a', 'ขั้แรกแห่งทุกทักษะ คือใด', 'The first step on every skill is…', 'เปิดงาน (เปิด-แอป)', 'Opening the app', true),
  ('module-01-lesson-01', 2, 'b', 'ขั้แรกแห่งทุกทักษะ คือใด', 'The first step on every skill is…', 'กด-Alt+F4', 'Pressing Alt+F4', false),
  ('module-01-lesson-01', 2, 'c', 'ขั้แรกแห่งทุกทักษะ คือใด', 'The first step on every skill is…', 'พิมพ์-URL', 'Typing a URL', false),
  -- Lesson 2, Q1 (the Normal view):
  ('module-01-lesson-02', 1, 'a', 'วิ้วใดจะจตอง-sild-list', 'Which view shows the slide list beside the slide?', 'วิ้ว-Normal', 'Normal view', true),
  ('module-01-lesson-02', 1, 'b', 'วิ้วใดจะจตอง-sild-list', 'Which view shows the slide list beside the slide?', 'วิ้ว-Preview-อานยอง', 'Preview (audience) only', false),
  ('module-01-lesson-02', 1, 'c', 'วิ้วใดจะจตอง-sild-list', 'Which view shows the slide list beside the slide?', 'วิ้ว-Slide-Show', 'Slide Show (fullscreen)', false),
  -- Lesson 2, Q2 (the Preview's audience view):
  ('module-01-lesson-02', 2, 'a', 'วิ้ว-Preview จะจตอง-ใด', 'Preview shows…', 'สไลด-อานยอง (the audience''s view)', 'The slide as the audience sees it', true),
  ('module-01-lesson-02', 2, 'b', 'วิ้ว-Preview จะจตอง-ใด', 'Preview shows…', 'ข้อความ-edit-หลาย', 'The edit fields only', false),
  ('module-01-lesson-02', 2, 'c', 'วิ้ว-Preview จะจตอง-ใด', 'Preview shows…', 'Markup-ของ-XML', 'The raw XML markup', false)
on conflict (lesson_key, order_index, option_key) do nothing;