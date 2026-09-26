-- PPGA #11: Knowledge Missions for Modules 1..7 (bilingual instructions
-- + questions/options), the DATABASE's own server-side scoring at the 70%
-- pass threshold (the client never decides the outcome), the append-only
-- attempt stream (unlimited retries below the threshold; the score history
-- retained per learner+mission), the completion hook on the FIRST pass —
-- it unlocks Module N+1 (the #9/#10 linear rule now reads a real `complete`
-- row), +100 XP granted EXACTLY ONCE (the ledger's PK — the same idempotent
-- pattern #10 set), the module badge awarded on the first pass, the Mission
-- Ready badge awarded on the learner's first Self-Check pass (the same
-- transaction #10 set already speaks), and the badge gallery read (every
-- badge with its bilingual criteria + the CALLER's earned/locked state).
-- The answer key stays server-side (the read RPCs never carry `is_correct`
-- — the submit function's definer read sums it server-side only). ADR-0001:
-- XP ≠ the knowledge score; the scores never appear on the leaderboard.

create table public.ppg_knowledge_missions (
  module_key text primary key references public.ppg_modules (module_key) on delete cascade,
  instructions_th text not null,
  instructions_en text not null,
  created_at timestamptz not null default now()
);

comment on table public.ppg_knowledge_missions is
  'PPGA #11: the ONE Knowledge Mission per Module (modules 1..7) — the bilingual instructions the attempt page shows (the Mission Ready gate the Self-Check pass already fired rides here). One Mission per Module: Practical 8..10 lands later (#13).';
comment on column public.ppg_knowledge_missions.instructions_th is
  'PPGA #11: the Mission''s instructions in Thai (ADR-0003 bilingual: real content, not a placeholder copy).';
comment on column public.ppg_knowledge_missions.instructions_en is
  'PPGA #11: the Mission''s instructions in English (ADR-0003 bilingual: real content, not a placeholder copy).';

alter table public.ppg_knowledge_missions enable row level security;

-- Read as a Learner: the gate (#8) AND the Mission's own visibility (the
-- `ppg_knowledge_mission_visible` function: the module published + OPEN +
-- the end-of-module Self-Check pass). A locked/draft/arched Module''s
-- instructions never appear (`SELECT 0`), never a smuggled read. A
-- Teacher/admin reads every row. No INSERT/UPDATE/DELETE policy — a
-- migration seeds the copy (ADR-0003), the submit function writes the
-- events, never a client deciding.
create policy ppg_knowledge_missions_select on public.ppg_knowledge_missions
  for select
  using (auth.role() = 'learner' AND public.ppg_knowledge_mission_visible(auth.uid(), module_key))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The questions: the Mission's own bilingual prompts/options, the
-- `is_correct` key server-side only (the read RPC never carries it), the
-- educational feedback per question (the explanation says what was right,
-- what was wrong, WHY; the review pointer says what to review — NOT just
-- "correct/incorrect"). `explanation`/`review` columns are real bilingual
-- copy; the key never rides out.
create table public.ppg_knowledge_mission_questions (
  module_key text not null references public.ppg_modules (module_key) on delete cascade,
  order_index integer not null,
  option_key text not null,
  prompt_th text not null,
  prompt_en text not null,
  option_th text not null,
  option_en text not null,
  is_correct boolean not null,
  explanation_th text not null,
  explanation_en text not null,
  review_th text not null,
  review_en text not null,
  created_at timestamptz not null default now(),
  primary key (module_key, order_index, option_key),
  constraint ppg_knowledge_mission_option_key_check check (option_key in ('a', 'b', 'c')),
  constraint ppg_knowledge_mission_order_check check (order_index between 1 and 10)
);

comment on table public.ppg_knowledge_mission_questions is
  'PPGA #11: the Knowledge Mission questions/options — bilingual prompts/options + the `is_correct` key SERVER-side only (the read RPC''s jsonb never carries it; the submit function''s definer read is the ONLY summing read). The feedback columns (explanation + review pointer) are the what-was-right/what-was-wrong/WHY/what-to-review copy (bilingual, actionable — not a "correct/incorrect" label only).';
comment on column public.ppg_knowledge_mission_questions.explanation_th is
  'PPGA #11: the per-question WHY the feedback lands in Thai (what was right/wrong + why — educational, not a label).';
comment on column public.ppg_knowledge_mission_questions.explanation_en is
  'PPGA #11: the per-question WHY the feedback lands in English (what was right/wrong + why — educational, not a label).';
comment on column public.ppg_knowledge_mission_questions.review_th is
  'PPGA #11: the per-question WHAT-TO-REVIEW pointer in Thai (the Lesson to reread below the threshold).';
comment on column public.ppg_knowledge_mission_questions.review_en is
  'PPGA #11: the per-question WHAT-TO-REVIEW pointer in English (the Lesson to reread below the threshold).';

alter table public.ppg_knowledge_mission_questions enable row level security;

create policy ppg_knowledge_mission_questions_select on public.ppg_knowledge_mission_questions
  for select
  using (auth.role() = 'learner' AND public.ppg_knowledge_mission_visible(auth.uid(), module_key))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The attempt stream: the append-only score history per learner+mission
-- (unlimited retries ADD rows; the PK stamps the retry count; the score
-- retained). Outcome pass|fail at the 70% threshold (the score% = the
-- matched correct options / all correct options, rounded). The score never
-- becomes the leaderboard state (ADR-0001: XP ≠ any score; the scores
-- never ride the header). Learner reads their own history; Teacher/admin
-- read all; NO INSERT policy from a client (the writes land via the
-- submit function''s definer insert, never a client deciding).
create table public.ppg_mission_attempts (
  learner_id uuid not null references auth.users (id) on delete cascade,
  module_key text not null references public.ppg_modules (module_key) on delete cascade,
  attempt_seq integer not null,
  outcome text not null,
  score_pct integer not null,
  created_at timestamptz not null default now(),
  primary key (learner_id, module_key, attempt_seq),
  constraint ppg_mission_attempt_outcome_check check (outcome in ('pass', 'fail')),
  constraint ppg_mission_attempt_score_check check (score_pct between 0 and 100)
);

comment on table public.ppg_mission_attempts is
  'PPGA #11: the append-only Knowledge Mission attempt stream (unlimited retries add rows; the PK stamps the retry count) — the score history RETAINED per learner+mission (score_pct = the matched correct options / all, rounded; outcome pass|fail at the 70% threshold). A scored instrument here IS a Knowledge Mission (ADR-0001: the score NEVER becomes the leaderboard state — the header reads XP, never a score).';

alter table public.ppg_mission_attempts enable row level security;

create policy ppg_mission_attempts_select on public.ppg_mission_attempts
  for select
  using (auth.role() = 'learner' AND learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The visibility: the Mission rides the gate (#8) + the Module published +
-- the Module OPEN (the linear rule: for Module 1 on the gate alone; for
-- Module N+1 on Module N''s Mission `complete` AND its last lesson''s
-- Self-Check pass) + the CALLER's end-of-module gate (the Module's LAST
-- lesson''s Self-Check PASSED — #10''s rule: the Mission unlocks ONLY after
-- the Module''s Self-Check passes). A locked/draft/arched Module, an
-- ungated learner, an un-passed Self-Check — `false`, never a hidden UI.
create or replace function public.ppg_knowledge_mission_visible(p_caller uuid, p_module_key text)
returns boolean
language plpgsql stable
security definer
set search_path = public, auth
as $$
declare
  v_last_lesson text;
begin
  if not public.ppg_learner_gated(p_caller) then
    return false;
  end if;

  if not exists (
    select 1
      FROM public.ppg_modules m
    WHERE m.module_key = p_module_key
      AND m.publication_state = 'published'
  ) then
    return false;
  end if;

  if not public.ppg_module_unlocked(p_caller, p_module_key) then
    return false;
  end if;

  select l.lesson_key INTO v_last_lesson
    FROM public.ppg_lessons l
  WHERE l.module_key = p_module_key
  ORDER BY l.order_index DESC
  LIMIT 1;

  if v_last_lesson IS NULL then
    return false;
  end if;

  return exists (
    select 1
      FROM public.ppg_self_check_events e
    WHERE e.learner_id = p_caller
      AND e.lesson_key = v_last_lesson
      AND e.outcome = 'pass'
  );
end;
$$;

revoke execute on function public.ppg_knowledge_mission_visible(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_knowledge_mission_visible(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_knowledge_mission_visible(uuid, text) is
  'PPGA #11: the Mission''s own visibility the questions/instructions ride — gate #8 + the Module published + the Module OPEN (the linear rule: #10''s self-check pass AND the previous Module''s Mission `complete`) + the end-of-module gate (the Module''s LAST lesson''s Self-Check passed: the Mission unlocks ONLY after the Module''s Self-Check passes). A locked/draft/arched/un-gated/un-passed Module reaches `false` server-side, never a hidden UI.';

-- The read: the instructions + questions+options the SEE-ABLE Mission shows
-- (the `ppg_read_mission` RPC — the answer key NEVER lands in the jsonb,
-- the submit function's definer read is the ONLY summing authority; a
-- locked/un-gated/un-passed Mission returns `{}` (never a hidden UI)) + the
-- pass threshold the server scores at (70 — the client never decides).
create or replace function public.ppg_read_mission(p_module_key text)
returns jsonb
language sql stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'module_key', m.module_key,
    'instructions_th', m.instructions_th,
    'instructions_en', m.instructions_en,
    'pass_threshold_pct', 70,
    'questions', q.agg
  )
  FROM public.ppg_knowledge_missions m
  WHERE m.module_key = p_module_key
    AND (
      auth.role() in ('teacher', 'admin')
      OR (
        auth.role() = 'learner'
        AND public.ppg_knowledge_mission_visible(auth.uid(), p_module_key)
      )
    )
  JOIN LATERAL (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'module_key', x.module_key,
          'order_index', x.order_index,
          'option_key', x.option_key,
          'prompt_th', x.prompt_th,
          'prompt_en', x.prompt_en,
          'option_th', x.option_th,
          'option_en', x.option_en
        ) ORDER BY x.order_index, x.option_key
      )::jsonb,
      '[]'::jsonb
    ) agg
    FROM public.ppg_knowledge_mission_questions x
    WHERE x.module_key = p_module_key
      AND (
        auth.role() in ('teacher', 'admin')
        OR (
          auth.role() = 'learner'
          AND public.ppg_knowledge_mission_visible(auth.uid(), p_module_key)
        )
      )
  ) q ON TRUE;
$$;

revoke execute on function public.ppg_read_mission(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_read_mission(text)
  to service_role, authenticated;

comment on function public.ppg_read_mission(text) is
  'PPGA #11: the Mission''s instructions + questions/options the attempt page reads (the jsonb NEVER carries `is_correct` — the answer key never reaches the browser; a locked/un-gated/un-passed Mission returns `{}`, never a hidden UI). The `pass_threshold_pct` 70 is the SERVER''s own scoring threshold (the submit function applies it; the client never decides).';

-- The attempt history: the score history RETAINED across attempts (the
-- `ppg_mission_history` RPC the attempt page reads — the CALLER''s own
-- rows only (an other learner''s history never rides out; the definer''s
-- rights read FILTERED to the CALLER''s `learner_id`), the order the
-- attempt_seq (the retry count), the score/outcome per attempt. Scores
-- never ride the leaderboard (ADR-0001: the read is the history, never a
-- header state).
create or replace function public.ppg_mission_history(p_module_key text)
returns jsonb
language sql stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'module_key', a.module_key,
        'attempt_seq', a.attempt_seq,
        'outcome', a.outcome,
        'score_pct', a.score_pct
      ) ORDER BY a.attempt_seq
    )::jsonb,
    '[]'::jsonb
  )
  FROM public.ppg_mission_attempts a
  WHERE a.module_key = p_module_key
    AND a.learner_id = auth.uid()
    AND auth.role() = 'learner';
$$;

revoke execute on function public.ppg_mission_history(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_mission_history(text)
  to service_role, authenticated;

comment on function public.ppg_mission_history(text) is
  'PPGA #11: the Mission attempt history the attempt page shows — the score history RETAINED across attempts (append-only; the CALLER''s own rows ONLY under the definer''s rights (an other learner''s history never rides out; a non-learner reaches `[]`). The scores never ride the leaderboard (ADR-0001: the read is the history, never a header state).';

-- The submit: the DATABASE's own answer-key sum at the 70% threshold
-- (POST /api/mission/submit calls it; the browser never sees the key,
-- never decides the outcome). Server-side pass/fail ONLY (score% = the
-- matched correct options / all correct options, rounded; PASS iff
-- score% >= 70). Unlimited retries below the threshold ADD attempt rows
-- (the PK stamps the retry count; the score history retained). The
-- feedback per question: what was right, what was wrong, WHY (the
-- explanation), what to review (the review pointer) — bilingual,
-- actionable, NOT a "correct/incorrect" label only. On the FIRST pass of
-- the Mission the completion hook lands in ONE transaction: the
-- `ppg_module_missions` row UPSERTs to `complete` (the unlock authority:
-- the #9/#10 linear rule now reads a real `complete` row — Module N+1
-- opens server-side, the client cannot bypass); the +100 XP lands
-- idempotently (the ledger's PK — a retry/double-click/replay conflicts,
-- never a second +100; `xp_granted` says what landed); the Module badge
-- awarded on the completion (the award PK — a duplicate conflicts).
-- A non-learner smuggle reaches `permission_denied`; an ungated reaches
-- `gate_closed`; a locked/un-passed Mission reaches `mission_not_visible`;
-- a module with no seeded questions reaches `mission_content_missing`.
create or replace function public.ppg_submit_mission(p_module_key text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_correct_total integer;
  v_correct_matched integer;
  v_score_pct integer;
  v_outcome text;
  v_attempts integer;
  v_granted_xp integer := 0;
  v_badge_granted boolean := false;
  v_module_badge_key text;
  v_feedback jsonb := '[]'::jsonb;
begin
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_submit_mission is learner-only (the JWT role claim must be learner)';
  end if;

  if not public.ppg_learner_gated(auth.uid()) then
    raise exception 'gate_closed: the #8 gate (consent AND the Pre-Test submitted, OR the audited override) must stand before a Mission submits';
  end if;

  if not public.ppg_knowledge_mission_visible(auth.uid(), p_module_key) then
    raise exception 'mission_not_visible: the Mission is locked/un-gated/un-self-checked server-side — no submit runs on it (never a hidden UI)';
  end if;

  -- The DATABASE's own answer-key sum: the answer jsonb's keys ARE the
  -- question order_index strings ('1','2'…), the values are the chosen
  -- option_key. SCORE = the matched correct options / all correct
  -- options, rounded; the key read here is the definer's ONLY (the
  -- browser never SELECTs the key).
  select count(*) INTO v_correct_total
    FROM public.ppg_knowledge_mission_questions q
  WHERE q.module_key = p_module_key
    AND q.is_correct;

  if v_correct_total = 0 then
    raise exception 'mission_content_missing: no questions for the Mission seeded server-side';
  end if;

  select count(*) INTO v_correct_matched
    FROM public.ppg_knowledge_mission_questions q
  WHERE q.module_key = p_module_key
    AND q.is_correct
    AND (p_answers ->> q.order_index::text) = q.option_key;

  v_score_pct := round(100::numeric * v_correct_matched::numeric / v_correct_total::numeric)::integer;

  if v_score_pct >= 70 then
    v_outcome := 'pass';
  else
    v_outcome := 'fail';
  end if;

  select coalesce(max(a.attempt_seq), 0) + 1 INTO v_attempts
    FROM public.ppg_mission_attempts a
  WHERE a.learner_id = auth.uid()
    AND a.module_key = p_module_key;

  insert into public.ppg_mission_attempts (learner_id, module_key, attempt_seq, outcome, score_pct, created_at)
  values (
    auth.uid(),
    p_module_key,
    v_attempts,
    v_outcome,
    v_score_pct,
    now()
  );

  -- The per-question educational feedback: what was right, what was wrong,
  -- WHY (the explanation), what to review (the pointer) — bilingual,
  -- actionable. The key rides out HERE (the attempt is scored server-side
  -- already; the retries are unlimited) — never in the read RPC above.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'module_key', q.module_key,
        'order_index', q.order_index,
        'chosen_key', p_answers ->> q.order_index::text,
        'is_right', coalesce((p_answers ->> q.order_index::text) = c.option_key, false),
        'why_th', q.explanation_th,
        'why_en', q.explanation_en,
        'review_th', q.review_th,
        'review_en', q.review_en
      ) ORDER BY q.order_index
    )::jsonb,
    '[]'::jsonb
  ) INTO v_feedback
  FROM public.ppg_knowledge_mission_questions q
  JOIN LATERAL (
    select x.option_key
    FROM public.ppg_knowledge_mission_questions x
    WHERE x.module_key = q.module_key
      AND x.order_index = q.order_index
      AND x.is_correct
    LIMIT 1
  ) c ON TRUE
  WHERE q.module_key = p_module_key;

  if v_outcome = 'pass' then
    -- The completion hook: the `ppg_module_missions` row UPSERTs to
    -- `complete` — the unlock authority IS the linear rule's `complete`
    -- read (the #9/#10 function already honors both conditions; this
    -- ticket wires the real writes). Module N+1 opens SERVER-side under
    -- the CALLER's next request's JWT; the client cannot bypass.
    insert into public.ppg_module_missions (module_key, learner_id, status)
    values (p_module_key, auth.uid(), 'complete')
    on conflict (module_key, learner_id) do update
      set status = 'complete';

    -- The +100 the first pass the ONLY grant authority is the ledger's PK
    -- (learner_id, event_type, event_ref) — a retry/double-click/replay
    -- INSERT reaches conflict, never a second +100 a learner keeps; the
    -- `xp_granted` the return says what the CALLER actually received.
    if not exists (
      select 1
        from public.ppg_xp_ledger x
      where x.learner_id = auth.uid()
        and x.event_type = 'knowledge_mission_pass'
        and x.event_ref = p_module_key
    ) then
      insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
      values (auth.uid(), 'knowledge_mission_pass', p_module_key, 100, now());
      v_granted_xp := 100;
    end if;

    -- The Module badge the first pass awards it ONCE — the award PK
    -- (learner_id, badge_key) is the authority; a second award (any
    -- retry) reaches conflict, never a duplicate badge.
    v_module_badge_key := 'module_' || right(p_module_key, 2) || '_mission';
    if not exists (
      select 1
        from public.ppg_badge_awards b
      where b.learner_id = auth.uid()
        and b.badge_key = v_module_badge_key
    ) then
      insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
      values (auth.uid(), v_module_badge_key, 'knowledge_mission_pass', p_module_key, now());
      v_badge_granted := true;
    end if;

    return jsonb_build_object(
      'module_key', p_module_key,
      'outcome', v_outcome,
      'score_pct', v_score_pct,
      'pass_threshold_pct', 70,
      'attempt_seq', v_attempts,
      'xp_granted', v_granted_xp,
      'badge_granted', v_badge_granted,
      'module_badge_key', v_module_badge_key,
      'feedback', v_feedback
    );
  end if;

  return jsonb_build_object(
    'module_key', p_module_key,
    'outcome', v_outcome,
    'score_pct', v_score_pct,
    'pass_threshold_pct', 70,
    'attempt_seq', v_attempts,
    'xp_granted', v_granted_xp,
    'badge_granted', v_badge_granted,
    'feedback', v_feedback
  );
end;
$$;

revoke execute on function public.ppg_submit_mission(text, jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_submit_mission(text, jsonb)
  to service_role, authenticated;

comment on function public.ppg_submit_mission(text, jsonb) is
  'PPGA #11: the DATABASE''s own answer-key sum AT the 70% threshold (server-side pass/fail ONLY — the score% = the matched correct options / all, rounded; a learner smuggle reaches permission_denied; an ungated reaches gate_closed; a locked/un-passed Mission reaches mission_not_visible; a module with no questions reaches mission_content_missing). Pass/fail BOTH write the append-only ATTEMPT row (unlimited retries: the attempt_seq the attempts'' count +1; the score history retained). The feedback per question carries what was right, what was wrong, WHY + what to review (bilingual, actionable — the key rides HERE AFTER the score only, never in the read). On the FIRST pass the completion hook lands in ONE transaction: the module_missions UPSERT to complete (the #9/#10 linear rule''s real unlock — module N+1 opens server-side, the client cannot bypass), the +100 ledger row (idempotent: the PK (learner_id, event_type, event_ref) — a replay conflicts, never a second +100; xp_granted says what actually landed), and the Module badge (the award PK — a duplicate conflicts). The XP is the ADR-0001''s ONLY currency; the score NEVER rides the leaderboard.';

-- The replacement check (#10's function + the Mission Ready badge): the
-- SAME transaction the first Self-Check pass already speaks — the learner's
-- first pass of ANY lesson marks the FIRST Knowledge Mission READY, so the
-- `mission_ready` badge rides the award PK ONCE too (a second pass, any
-- lesson, adds NO award row). The `badge_granted` the return stays the
-- `first_steps` signal #10 set (unchanged); the ready-award lands in the
-- same transaction, never a separate write. The gates, the answer-key sum,
-- the pass/fail, the +50 idempotency, the First Steps award, the attempt
-- count — ALL #10's own; this ticket wires the real `mission_ready` award
-- here (no fake behavior; the gallery shows it earned/locked with criteria).
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

  select count(*) INTO v_correct_total
    FROM public.ppg_self_check_questions q
  WHERE q.lesson_key = p_lesson_key
    AND q.is_correct;

  select count(*) INTO v_correct_matched
    FROM public.ppg_self_check_questions q
  WHERE q.lesson_key = p_lesson_key
    AND q.is_correct
    AND (p_answers ->> q.order_index::text) = q.option_key;

  select count(*) INTO v_wrong_answers
    FROM public.ppg_self_check_questions q
  WHERE q.lesson_key = p_lesson_key
    AND NOT q.is_correct
    AND (p_answers ->> q.order_index::text) = q.option_key;

  if v_correct_matched = v_correct_total AND v_wrong_answers = 0 then
    v_outcome := 'pass';
  else
    v_outcome := 'fail';
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
    if not exists (
      select 1
        from public.ppg_xp_ledger x
      where x.learner_id = auth.uid()
        and x.event_type = 'self_check_pass'
        and x.event_ref = p_lesson_key
    ) then
      insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
      values (auth.uid(), 'self_check_pass', p_lesson_key, 50, now());
      v_granted_xp := 50;
    end if;

    if not exists (
      select 1
        from public.ppg_badge_awards b
      where b.learner_id = auth.uid()
        and b.badge_key = 'first_steps'
    ) then
      insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
      values (auth.uid(), 'first_steps', 'self_check_pass', p_lesson_key, now());
      v_badge_granted := true;
    end if;

    -- PPGA #11 wires HERE: the `mission_ready` badge on the CALLER's
    -- FIRST pass of ANY Lesson — the first Knowledge Mission is READY
    -- next (the same transaction the first pass already speaks; the
    -- award PK (learner_id, badge_key) — a second pass, any lesson,
    -- adds NO award row; the ready-award NEVER changes the
    -- `badge_granted` signal #10 set).
    if not exists (
      select 1
        from public.ppg_badge_awards b
      where b.learner_id = auth.uid()
        and b.badge_key = 'mission_ready'
    ) then
      insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
      values (auth.uid(), 'mission_ready', 'self_check_pass', p_lesson_key, now());
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
  'PPGA #10 (wired #11): the DATABASE''s own answer-key sum (server-side pass/fail ONLY — unlimited retries: the attempt_seq the events'' count +1), the +50 ledger row (idempotent: the PK — a replay conflicts, never a second +50; xp_granted says what actually landed), and the First Steps badge on the CALLER''s FIRST pass of ANY lesson (the award PK — a duplicate conflicts). PPGA #11 adds HERE: the Mission Ready badge in the SAME transaction (the learner''s first pass marks the FIRST Knowledge Mission READY; the award PK — a second pass adds NO 'mission_ready' row; `badge_granted` stays the first_steps signal #10 set).';

-- The gallery: every badge + the CALLER's earned/locked state WITH its
-- bilingual criteria text (the award_rule_th/en the criteria shown).
-- Earned = the award row for the CALLER; LOCKED = no award yet (the
-- criteria the gallery shows anyway — the state announced by text + the
-- StatusPill's aria-label, never colour-alone). The taxonomy rows are
-- shared (read-only, ADR-0003); the earned/locked is the CALLER's own
-- awards read under the definer's rights filtered to `learner_id` (an
-- other learner's earned-state never rides out). A non-learner
--- reaches `[]` types anyway? No: teacher/admin see all rows + all
-- awards? Keep: teacher/admin see every row with the EVERY-learner
-- earned? No — the gallery is per-CALLER. OK.
create or replace function public.ppg_badge_gallery()
returns jsonb
language sql stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'badge_key', t.badge_key,
        'label_th', t.label_th,
        'label_en', t.label_en,
        'criteria_th', t.award_rule_th,
        'criteria_en', t.award_rule_en,
        'award_event', t.award_event,
        'earned', coalesce(b.earned, false),
        'event_ref', b.event_ref
      ) ORDER BY t.badge_key
    )::jsonb,
    '[]'::jsonb
  )
  FROM public.ppg_badge_types t
  LEFT JOIN LATERAL (
    select true earned, a.event_ref
    FROM public.ppg_badge_awards a
    WHERE a.learner_id = auth.uid()
      AND a.badge_key = t.badge_key
  ) b ON TRUE;
$$;

revoke execute on function public.ppg_badge_gallery()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_badge_gallery()
  to service_role, authenticated;

comment on function public.ppg_badge_gallery() is
  'PPGA #11: the Badge gallery read — every badge with its bilingual criteria (the award_rule copy shown in BOTH states) + the CALLER''s earned/locked (the award row EXISTS: earned; no award YET: locked — the criteria stay VISIBLE anyway, the state is text+aria-label, never colour-alone). The earned/lock is the CALLER''s own awards (the definer''s rights filtered to `auth.uid()` — an other learner''s earned-state never rides out; a signed-in learner/teacher/admin reads the taxonomy + their own earned state).';

-- The badge taxonomy: the #11 seeds real awards from real events — the
-- Mission Ready (the learner's first Self-Check pass — a real event the
-- check function above wires ONCE) + the Module completion badges for the
-- Knowledge Mission modules 1..7 (the first pass of the Mission — a real
-- event; +100 XP once). The criteria copy is bilingual (ADR-0003: real
-- content, the award rule a learner can read). No INSERT/UPDATE policy —
-- a migration seeds it, the check/submit functions award from real events,
-- never a client deciding.
insert into public.ppg_badge_types
  (badge_key, label_th, label_en, award_rule_th, award_rule_en, award_event)
VALUES
  -- The first Self-Check pass marks the first Knowledge Mission READY
  -- (a real event, once — the award PK (learner_id, badge_key)).
  (
    'mission_ready',
    'พร้อม-ภารกิจ (Mission Ready)',
    'Mission Ready',
    'ผ่าน-เซล์ฟเช็ค first — the first Knowledge Mission unlocks next (+100 XP once — the badge the first pass awards ONCE)',
    'Mission Ready — awarded on your first Self-Check pass (a real event; the first Knowledge Mission unlocks next, +100 XP once)',
    'self_check_pass'
  ),
  -- The first pass of the module's Knowledge Mission awards its badge
  -- (a real event, once — the award PK; +100 XP once). Modules 1..7.
  (
    'module_01_mission',
    'ภารกิจ-01 (Module 1 Mission)',
    'Module 1 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 1 badge (a real event, +100 XP once)',
    'Module 1 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  ),
  (
    'module_02_mission',
    'ภารกิจ-02 (Module 2 Mission)',
    'Module 2 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 2 badge (a real event, +100 XP once)',
    'Module 2 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  ),
  (
    'module_03_mission',
    'ภารกิจ-03 (Module 3 Mission)',
    'Module 3 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 3 badge (a real event, +100 XP once)',
    'Module 3 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  ),
  (
    'module_04_mission',
    'ภารกิจ-04 (Module 4 Mission)',
    'Module 4 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 4 badge (a real event, +100 XP once)',
    'Module 4 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  ),
  (
    'module_05_mission',
    'ภารกิจ-05 (Module 5 Mission)',
    'Module 5 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 5 badge (a real event, +100 XP once)',
    'Module 5 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  ),
  (
    'module_06_mission',
    'ภารกิจ-06 (Module 6 Mission)',
    'Module 6 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 6 badge (a real event, +100 XP once)',
    'Module 6 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  ),
  (
    'module_07_mission',
    'ภารกิจ-07 (Module 7 Mission)',
    'Module 7 Mission',
    'ผ่าน-ความรู้ mission first at 70% — the Module 7 badge (a real event, +100 XP once)',
    'Module 7 Knowledge Mission — awarded on the first pass at 70% (a real event, +100 XP once)',
    'knowledge_mission_pass'
  )
ON CONFLICT (badge_key) DO NOTHING;

-- The Mission instructions: real bilingual copy for the Module 1 Mission
-- (the threshold 70%, the unlimited retries, the score history retained —
-- the client never decides). Module 2..7 instructions are PLACEHOLDER-
-- BUT-VALID content (marked clearly below for the #11 content pass to
-- replace verbatim — the rows are valid, the copy is generic).
insert into public.ppg_knowledge_missions (module_key, instructions_th, instructions_en)
VALUES
  (
    'module-01',
    'ภารกิจ-ความรู้: 70% ผ่าน. unlimited retries — the score history retained. What to review: the Lessons 1-2 (Opening / Views).',
    'Knowledge Mission: 70% passes. Unlimited retries — your score history is retained. Review Lessons 1-2 (Opening PowerPoint, panes & views) if you fail.'
  ),
  -- PLACEHOLDER-BUT-VALID (the #11 content pass later replaces this copy
  -- verbatim; the Mission for Module 2..7 is valid, generic):
  ('module-02', 'ภารกิจ-ความรู้-02: 70% ผ่าน. retries unlimited. Review this Module''s Lessons.', 'Knowledge Mission: 70% passes. Unlimited retries — review this Module''s Lessons if you fail.'),
  ('module-03', 'ภารกิจ-ความรู้-03: 70% ผ่าน. retries unlimited. Review this Module''s Lessons.', 'Knowledge Mission: 70% passes. Unlimited retries — review this Module''s Lessons if you fail.'),
  ('module-04', 'ภารกิจ-ความรู้-04: 70% ผ่าน. retries unlimited. Review this Module''s Lessons.', 'Knowledge Mission: 70% passes. Unlimited retries — review this Module''s Lessons if you fail.'),
  ('module-05', 'ภารกิจ-ความรู้-05: 70% ผ่าน. retries unlimited. Review this Module''s Lessons.', 'Knowledge Mission: 70% passes. Unlimited retries — review this Module''s Lessons if you fail.'),
  ('module-06', 'ภารกิจ-ความรู้-06: 70% ผ่าน. retries unlimited. Review this Module''s Lessons.', 'Knowledge Mission: 70% passes. Unlimited retries — review this Module''s Lessons if you fail.'),
  ('module-07', 'ภารกิจ-ความรู้-07: 70% ผ่าน. retries unlimited. Review this Module''s Lessons.', 'Knowledge Mission: 70% passes. Unlimited retries — review this Module''s Lessons if you fail.')
ON CONFLICT (module_key) DO NOTHING;

-- The Knowledge Mission questions: REAL bilingual content for the
-- Module 1 Mission (the key server-side only; the explanation/review
-- pointer educational + actionable — what was right, what was wrong, WHY,
-- what to review, NOT a "correct/incorrect" label only). The options
-- cover the Module 1 Lessons the learner saw: the New button's tab, the
-- Normal view's slide list, the first step on every skill.
insert into public.ppg_knowledge_mission_questions
  (module_key, order_index, option_key, prompt_th, prompt_en, option_th, option_en, is_correct, explanation_th, explanation_en, review_th, review_en)
VALUES
  -- Module 1 Mission, Q1 (the New button — the Home tab the body showed):
  -- right: Home tab's New starts a NEW presentation; File's Open opens an
  -- EXISTING file; View's New Slide makes a slide, not a presentation.
  ('module-01', 1, 'a', 'ปุ่ม-New ใดใหม่ คือใด', 'Where is the New button for a NEW presentation?', 'บน-Home (New)', 'On the Home tab (New)', true,
    'ถู格-Home คือ New (New) เรื่ม-งาน-ใหม่ (a new presentation); File-Open เรื่ม-ไฟล์-เก่า (an existing file); View-New Slide is a slide, not a presentation.',
    'The Home tab''s New starts a new presentation; the File tab''s Open opens an existing file; the View tab''s New Slide makes a slide, not a presentation.',
    'review Lesson 1 (Opening PowerPoint)', 'review Lesson 1 (Opening PowerPoint)'),
  ('module-01', 1, 'b', 'ปุ่ม-New ใดใหม่ คือใด', 'Where is the New button for a NEW presentation?', 'บน-File (Open)', 'On the File tab (Open)', false,
    'File-Open เรื่ม-ไฟล์-เก่า, not a NEW presentation — the right answer is Home-New.',
    'The File tab''s Open opens an existing file, not a new presentation — the correct answer is the Home tab''s New.',
    'review Lesson 1 (Opening PowerPoint)', 'review Lesson 1 (Opening PowerPoint)'),
  ('module-01', 1, 'c', 'ปุ่ม-New ใดใหม่ คือใด', 'Where is the New button for a NEW presentation?', 'บน-View (New Slide)', 'On the View tab (New Slide)', false,
    'View-New Slide is a slide, not a presentation — the right answer is Home-New.',
    'The View tab''s New Slide makes a slide, not a presentation — the correct answer is the Home tab''s New.',
    'review Lesson 1 (Opening PowerPoint)', 'review Lesson 1 (Opening PowerPoint)'),
  -- Module 1 Mission, Q2 (the Normal view — the slide list the body rode):
  -- right: the Normal view carries the slide LIST pane; the Preview is an
  -- audience-less view; the Full-screen hides the panes.
  ('module-01', 2, 'a', 'view ใด carries the slide list, right?', 'Which view carries the slide list?', 'Normal view (slide list)', 'The Normal view (slide list)', true,
    'Normal view carries the slide/outline/thumbnail panes — the slide list lives there.',
    'The Normal view carries the slide/outline/thumbnail panes — the slide list lives there.',
    'review Lesson 2 (Panes & views)', 'review Lesson 2 (Panes & views)'),
  ('module-01', 2, 'b', 'view ใด carries the slide list, right?', 'Which view carries the slide list?', 'Preview view (audience-less)', 'The Preview view (audience-less)', false,
    'Preview is an audience-less display, not the slide list pane — the right answer is Normal.',
    'The Preview view is an audience-less display, not the slide list pane — the correct answer is the Normal view.',
    'review Lesson 2 (Panes & views)', 'review Lesson 2 (Panes & views)'),
  ('module-01', 2, 'c', 'view ใด carries the slide list, right?', 'Which view carries the slide list?', 'Full-screen (no panes)', 'The Full-screen view (no panes)', false,
    'Full-screen hides the panes, no slide list here — the right answer is Normal.',
    'The Full-screen view hides the panes — the slide list is not there; the correct answer is the Normal view.',
    'review Lesson 2 (Panes & views)', 'review Lesson 2 (Panes & views)'),
  -- Module 1 Mission, Q3 (the first step on every skill): right: open the
  -- app; a wrong one (Alt+F4 closes the window; help is no first step).
  ('module-01', 3, 'a', 'ขั้น-แรก ของทุก-ทักษะ คือใด', 'The first step on every skill is…', 'เปิด-งาน (open the app)', 'Opening the app', true,
    'เปิด-งาน is the first step (open PowerPoint to start a new presentation).',
    'Opening the app is the first step — open PowerPoint to start a new presentation.',
    'review Lesson 1 (Opening PowerPoint)', 'review Lesson 1 (Opening PowerPoint)'),
  ('module-01', 3, 'b', 'ขั้น-แรก ของทุก-ทักษะ คือใด', 'The first step on every skill is…', 'กด-Alt+F4 (close the window)', 'Pressing Alt+F4 (close the window)', false,
    'Alt+F4 CLOSES the window — not the first step on a skill; the right answer is open the app.',
    'Alt+F4 closes the window — that is not the first step on a skill; the correct answer is opening the app.',
    'review Lesson 1 (Opening PowerPoint)', 'review Lesson 1 (Opening PowerPoint)'),
  ('module-01', 3, 'c', 'ขั้น-แรก ของทุก-ทักษะ คือใด', 'The first step on every skill is…', 'ดู-ช่อ-วย (help first)', 'Reading the help pane first', false,
    'The help pane is not the first step on a skill — open the app first.',
    'Reading the help pane first is not the first step on a skill — open the app first.',
    'review Lesson 1 (Opening PowerPoint)', 'review Lesson 1 (Opening PowerPoint)')
ON CONFLICT (module_key, order_index, option_key) DO NOTHING;

-- PLACEHOLDER-BUT-VALID QUESTIONS (modules 2..7): 1 Q per Mission, 3
-- options a|b|c, correct a, GENERIC bilingual explanation/review pointer.
-- The rows are VALID (the Mission has questions, the key server-side,
-- the feedback copy actionable-generic); the #11 content pass later
-- replaces these VERBATIM rows per Module (real PowerPoint content).
insert into public.ppg_knowledge_mission_questions
  (module_key, order_index, option_key, prompt_th, prompt_en, option_th, option_en, is_correct, explanation_th, explanation_en, review_th, review_en)
VALUES
  ('module-02', 1, 'a', 'placeholder-02: the right option is a', 'Placeholder question (Module 2): the correct answer is option a.', 'option-a (placeholder: right)', 'Option a (placeholder: the correct answer)', true,
    'placeholder: option a is right in this placeholder — see this Module''s Lessons to real content.',
    'Placeholder: option a is the correct answer in this placeholder question — the real content lands with the #11 content pass; review this Module''s Lessons.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-02', 1, 'b', 'placeholder-02: the right option is a', 'Placeholder question (Module 2): the correct answer is option a.', 'option-b (placeholder: wrong)', 'Option b (placeholder: a wrong answer)', false,
    'placeholder: option b is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option b is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-02', 1, 'c', 'placeholder-02: the right option is a', 'Placeholder question (Module 2): the correct answer is option a.', 'option-c (placeholder: wrong)', 'Option c (placeholder: a wrong answer)', false,
    'placeholder: option c is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option c is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-03', 1, 'a', 'placeholder-03: the right option is a', 'Placeholder question (Module 3): the correct answer is option a.', 'option-a (placeholder: right)', 'Option a (placeholder: the correct answer)', true,
    'placeholder: option a is right in this placeholder — see this Module''s Lessons to real content.',
    'Placeholder: option a is the correct answer in this placeholder question — the real content lands with the #11 content pass; review this Module''s Lessons.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-03', 1, 'b', 'placeholder-03: the right option is a', 'Placeholder question (Module 3): the correct answer is option a.', 'option-b (placeholder: wrong)', 'Option b (placeholder: a wrong answer)', false,
    'placeholder: option b is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option b is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-03', 1, 'c', 'placeholder-03: the right option is a', 'Placeholder question (Module 3): the correct answer is option a.', 'option-c (placeholder: wrong)', 'Option c (placeholder: a wrong answer)', false,
    'placeholder: option c is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option c is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-04', 1, 'a', 'placeholder-04: the right option is a', 'Placeholder question (Module 4): the correct answer is option a.', 'option-a (placeholder: right)', 'Option a (placeholder: the correct answer)', true,
    'placeholder: option a is right in this placeholder — see this Module''s Lessons to real content.',
    'Placeholder: option a is the correct answer in this placeholder question — the real content lands with the #11 content pass; review this Module''s Lessons.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-04', 1, 'b', 'placeholder-04: the right option is a', 'Placeholder question (Module 4): the correct answer is option a.', 'option-b (placeholder: wrong)', 'Option b (placeholder: a wrong answer)', false,
    'placeholder: option b is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option b is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-04', 1, 'c', 'placeholder-04: the right option is a', 'Placeholder question (Module 4): the correct answer is option a.', 'option-c (placeholder: wrong)', 'Option c (placeholder: a wrong answer)', false,
    'placeholder: option c is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option c is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-05', 1, 'a', 'placeholder-05: the right option is a', 'Placeholder question (Module 5): the correct answer is option a.', 'option-a (placeholder: right)', 'Option a (placeholder: the correct answer)', true,
    'placeholder: option a is right in this placeholder — see this Module''s Lessons to real content.',
    'Placeholder: option a is the correct answer in this placeholder question — the real content lands with the #11 content pass; review this Module''s Lessons.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-05', 1, 'b', 'placeholder-05: the right option is a', 'Placeholder question (Module 5): the correct answer is option a.', 'option-b (placeholder: wrong)', 'Option b (placeholder: a wrong answer)', false,
    'placeholder: option b is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option b is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-05', 1, 'c', 'placeholder-05: the right option is a', 'Placeholder question (Module 5): the correct answer is option a.', 'option-c (placeholder: wrong)', 'Option c (placeholder: a wrong answer)', false,
    'placeholder: option c is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option c is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-06', 1, 'a', 'placeholder-06: the right option is a', 'Placeholder question (Module 6): the correct answer is option a.', 'option-a (placeholder: right)', 'Option a (placeholder: the correct answer)', true,
    'placeholder: option a is right in this placeholder — see this Module''s Lessons to real content.',
    'Placeholder: option a is the correct answer in this placeholder question — the real content lands with the #11 content pass; review this Module''s Lessons.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-06', 1, 'b', 'placeholder-06: the right option is a', 'Placeholder question (Module 6): the correct answer is option a.', 'option-b (placeholder: wrong)', 'Option b (placeholder: a wrong answer)', false,
    'placeholder: option b is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option b is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-06', 1, 'c', 'placeholder-06: the right option is a', 'Placeholder question (Module 6): the correct answer is option a.', 'option-c (placeholder: wrong)', 'Option c (placeholder: a wrong answer)', false,
    'placeholder: option c is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option c is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-07', 1, 'a', 'placeholder-07: the right option is a', 'Placeholder question (Module 7): the correct answer is option a.', 'option-a (placeholder: right)', 'Option a (placeholder: the correct answer)', true,
    'placeholder: option a is right in this placeholder — see this Module''s Lessons to real content.',
    'Placeholder: option a is the correct answer in this placeholder question — the real content lands with the #11 content pass; review this Module''s Lessons.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-07', 1, 'b', 'placeholder-07: the right option is a', 'Placeholder question (Module 7): the correct answer is option a.', 'option-b (placeholder: wrong)', 'Option b (placeholder: a wrong answer)', false,
    'placeholder: option b is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option b is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)'),
  ('module-07', 1, 'c', 'placeholder-07: the right option is a', 'Placeholder question (Module 7): the correct answer is option a.', 'option-c (placeholder: wrong)', 'Option c (placeholder: a wrong answer)', false,
    'placeholder: option c is wrong in this placeholder — the right answer is option a.',
    'Placeholder: option c is a wrong answer in this placeholder — the correct answer is option a.',
    'review this Module''s Lessons (placeholder)', 'review this Module''s Lessons (placeholder)')
ON CONFLICT (module_key, order_index, option_key) DO NOTHING;
