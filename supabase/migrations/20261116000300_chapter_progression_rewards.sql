-- ============================================================================
-- PPGA #76: chapter progression and the reward model for the CAI loop.
--
-- The chapter loop is now the only progression authority:
--   * `ppg_chapter_unlocks` (from #74) IS the source of truth for `chapter-NN`
--     keys: chapter N+1 opens iff the learner holds the unlock row written by
--     chapter N's post-test pass (best score >= 70%). The global
--     `ppg_module_unlocked` reads that table, so the course map, lesson reads
--     and the chapter test RPCs all agree. Legacy `module-NN` progression is
--     unchanged (archived content).
--   * The chapter test state/submit enforce the unlock server-side; a client
--     cannot post a test for a locked chapter even by calling the RPC direct.
--   * A legacy Self-Check pass no longer feeds chapter progression. For
--     chapter lesson keys it also awards no XP and no badges (the CAI lesson
--     player uses formative mini-checks, which write nothing). Legacy
--     `module-*` self-check XP stays so already-granted history and its tests
--     remain intact; no ledger row is ever deleted.
--   * Rewards are event-driven, fixed amounts, idempotent ledger writes:
--       chapter post-test pass -> 200 XP, event `chapter_posttest_pass`
--       Knowledge Mission pass  -> 100 XP, event `knowledge_mission_pass`
--       Final Test completion   -> 400 XP, event `final_test_pass`
--     XP is never proportional to a score. The reusable helpers below are a
--     definer-only API #84's Final Test submit can call.
--   * Badges: first chapter cleared, perfect chapter post-test, all nine
--     chapters cleared, Final Test completed. The Research Pre-Test awards
--     nothing (no type exists for it).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New reward event types. Existing rows and types are untouched.
-- ----------------------------------------------------------------------------
alter table public.ppg_xp_ledger
  drop constraint ppg_xp_event_type_check;

alter table public.ppg_xp_ledger
  add constraint ppg_xp_event_type_check check (
    event_type in (
      'self_check_pass',
      'knowledge_mission_pass',
      'practical_approval',
      'final_project',
      'chapter_posttest_pass',
      'final_test_pass'
    )
  );

comment on column public.ppg_xp_ledger.event_type is
  'PPGA #10, extended by #76: the awardable events — self_check_pass (+50, legacy content), knowledge_mission_pass (+100), practical_approval (+150, legacy), final_project (+300, legacy), chapter_posttest_pass (+200, once per chapter pass), final_test_pass (+400, once for Final Test completion). Research instruments award nothing.';

alter table public.ppg_badge_awards
  drop constraint ppg_badge_award_event_check;

alter table public.ppg_badge_awards
  add constraint ppg_badge_award_event_check check (
    award_event in (
      'self_check_pass',
      'knowledge_mission_pass',
      'practical_approval',
      'final_project',
      'chapter_posttest_pass',
      'final_test_pass'
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Internal reward helpers: one idempotent ledger write, one idempotent
--    award. Definer-only (no client EXECUTE); called by the submit RPCs.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_grant_xp(
  p_learner uuid,
  p_event_type text,
  p_event_ref text,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_learner is null then
    raise exception 'learner_required: ppg_grant_xp needs a learner';
  end if;
  if p_event_type is null or p_event_type not in ('chapter_posttest_pass', 'final_test_pass') then
    raise exception 'event_type_denied: the chapter-loop reward helper grants chapter_posttest_pass|final_test_pass only';
  end if;
  if p_event_ref is null or btrim(p_event_ref) = '' then
    raise exception 'event_ref_denied: the reward event needs a stable ref';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_denied: the reward amount must be positive and fixed';
  end if;

  insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount)
  values (p_learner, p_event_type, p_event_ref, p_amount)
  on conflict (learner_id, event_type, event_ref) do nothing;

  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then p_amount else 0 end;
end;
$$;

revoke execute on function public.ppg_grant_xp(uuid, text, text, integer)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_grant_xp(uuid, text, text, integer)
  to service_role;

comment on function public.ppg_grant_xp(uuid, text, text, integer) is
  'PPGA #76: the idempotent ledger write — the PK (learner_id, event_type, event_ref) is the once-per-event authority, a retry conflicts and returns 0. Definer-only; the submit RPCs call it. Amount is fixed by the caller, never derived from a score.';

create or replace function public.ppg_grant_badge(
  p_learner uuid,
  p_badge_key text,
  p_award_event text,
  p_event_ref text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_learner is null then
    raise exception 'learner_required: ppg_grant_badge needs a learner';
  end if;
  if p_badge_key is null or p_award_event is null or p_event_ref is null then
    raise exception 'badge_denied: badge key, award event and event ref are required';
  end if;

  insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref)
  values (p_learner, p_badge_key, p_award_event, p_event_ref)
  on conflict (learner_id, badge_key) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.ppg_grant_badge(uuid, text, text, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_grant_badge(uuid, text, text, text)
  to service_role;

comment on function public.ppg_grant_badge(uuid, text, text, text) is
  'PPGA #76: the idempotent award — the PK (learner_id, badge_key) is the once-per-learner-badge authority; a duplicate returns false. Definer-only.';

-- ----------------------------------------------------------------------------
-- 3. The chapter reward event: called by `ppg_chapter_test_submit` after a
--    post-test pass (and directly by the seam tests for simulated chapters).
--    Awards the fixed chapter XP once, then the three chapter badges.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_grant_chapter_rewards(
  p_learner uuid,
  p_chapter_key text,
  p_best_score integer,
  p_item_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer := 0;
  v_badges text[] := array[]::text[];
  v_cleared integer;
begin
  if p_learner is null then
    raise exception 'learner_required: ppg_grant_chapter_rewards needs a learner';
  end if;
  if p_chapter_key is null or p_chapter_key !~ '^chapter-[0-9]{2}$' then
    raise exception 'chapter_denied: p_chapter_key must look like chapter-NN';
  end if;
  if p_item_count is null or p_item_count <= 0 then
    raise exception 'count_denied: the item count must be positive';
  end if;
  if p_best_score is null or p_best_score < 0 then
    raise exception 'score_denied: the best score must be a non-negative count';
  end if;

  if (p_best_score * 100) < (70 * p_item_count) then
    return jsonb_build_object('passed', false, 'xp_granted', 0, 'badges_granted', '[]'::jsonb);
  end if;

  v_xp := public.ppg_grant_xp(p_learner, 'chapter_posttest_pass', p_chapter_key, 200);

  if public.ppg_grant_badge(
    p_learner,
    'first_chapter_cleared',
    'chapter_posttest_pass',
    p_chapter_key
  ) then
    v_badges := array_append(v_badges, 'first_chapter_cleared');
  end if;

  if p_best_score = p_item_count
     and public.ppg_grant_badge(
       p_learner,
       'perfect_chapter_posttest',
       'chapter_posttest_pass',
       p_chapter_key
     ) then
    v_badges := array_append(v_badges, 'perfect_chapter_posttest');
  end if;

  select count(distinct x.event_ref) into v_cleared
    from public.ppg_xp_ledger x
   where x.learner_id = p_learner
     and x.event_type = 'chapter_posttest_pass'
     and x.event_ref ~ '^chapter-0[1-9]$';

  if v_cleared >= 9
     and public.ppg_grant_badge(
       p_learner,
       'all_chapters_cleared',
       'chapter_posttest_pass',
       p_chapter_key
     ) then
    v_badges := array_append(v_badges, 'all_chapters_cleared');
  end if;

  return jsonb_build_object(
    'passed', true,
    'xp_granted', v_xp,
    'badges_granted', to_jsonb(v_badges)
  );
end;
$$;

revoke execute on function public.ppg_grant_chapter_rewards(uuid, text, integer, integer)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_grant_chapter_rewards(uuid, text, integer, integer)
  to service_role;

comment on function public.ppg_grant_chapter_rewards(uuid, text, integer, integer) is
  'PPGA #76: the chapter pass reward — fixed 200 XP once (ledger PK on chapter_posttest_pass:chapter-NN) plus first_chapter_cleared, perfect_chapter_posttest (best = item count) and all_chapters_cleared (nine distinct chapter passes). The score decides pass/fail only; the reward never scales with it.';

-- ----------------------------------------------------------------------------
-- 4. The Final Test reward event, ready for #84's submit RPC. It awards the
--    fixed 400 XP once and the Final Test badge once; the score is NOT a
--    parameter by design. The Research Pre-Test has no event here.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_grant_final_test_reward(
  p_learner uuid,
  p_event_ref text default 'final-test'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer;
  v_badge boolean;
begin
  if p_learner is null then
    raise exception 'learner_required: ppg_grant_final_test_reward needs a learner';
  end if;
  if p_event_ref is null or btrim(p_event_ref) = '' then
    raise exception 'event_ref_denied: the Final Test reward needs a stable ref';
  end if;

  v_xp := public.ppg_grant_xp(p_learner, 'final_test_pass', p_event_ref, 400);
  v_badge := public.ppg_grant_badge(
    p_learner,
    'final_test_complete',
    'final_test_pass',
    p_event_ref
  );

  return jsonb_build_object(
    'xp_granted', v_xp,
    'badge_granted', v_badge
  );
end;
$$;

revoke execute on function public.ppg_grant_final_test_reward(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_grant_final_test_reward(uuid, text)
  to service_role;

comment on function public.ppg_grant_final_test_reward(uuid, text) is
  'PPGA #76: the Final Test completion reward (#84 calls it from the submit definer): fixed 400 XP once + final_test_complete once. No score parameter exists — the score never changes the reward.';

-- ----------------------------------------------------------------------------
-- 5. The new badge definitions (bilingual criteria; awarded from real events
--    only). The Research Pre-Test gets no badge.
-- ----------------------------------------------------------------------------
insert into public.ppg_badge_types
  (badge_key, label_th, label_en, award_rule_th, award_rule_en, award_event)
values
  (
    'first_chapter_cleared',
    'ผ่านบทแรก',
    'First Chapter Cleared',
    'ผ่านข้อสอบหลังเรียนบทแรกด้วยคะแนน 70% ขึ้นไป',
    'Awarded when your first chapter post-test reaches 70%.',
    'chapter_posttest_pass'
  ),
  (
    'perfect_chapter_posttest',
    'ข้อสอบหลังเรียนเต็ม 100%',
    'Perfect Chapter Post-Test',
    'ตอบถูกทุกข้อในข้อสอบหลังเรียนบทใดบทหนึ่ง',
    'Awarded when a chapter post-test scores every item correct.',
    'chapter_posttest_pass'
  ),
  (
    'all_chapters_cleared',
    'ผ่านครบทั้งเก้าบท',
    'All Chapters Cleared',
    'ผ่านข้อสอบหลังเรียนครบทั้ง 9 บท',
    'Awarded when all nine chapter post-tests reach 70%.',
    'chapter_posttest_pass'
  ),
  (
    'final_test_complete',
    'ทำข้อสอบปลายภาคสำเร็จ',
    'Final Test Completed',
    'ทำข้อสอบปลายภาค 50 ข้อสำเร็จ (ให้ครั้งเดียว)',
    'Awarded once when you complete the 50-item Final Test.',
    'final_test_pass'
  )
on conflict (badge_key) do nothing;

-- ----------------------------------------------------------------------------
-- 6. The global unlock rule: `ppg_chapter_unlocks` is the source of truth for
--    chapter keys. The legacy `module-NN` branch is unchanged (archived
--    content: previous module's Mission complete, course-scoped).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_module_unlocked(p_caller uuid, p_module_key text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order integer;
begin
  -- The chapter spine: chapter-01 opens on the #8 gate alone; chapter N+1 is
  -- open iff this learner holds the unlock row a 70% post-test on chapter N
  -- wrote. The unlock record is independent of whether the next chapter's
  -- content row has landed yet (the map only lists rows that exist). No
  -- self-check, no mission, no client input participates.
  if p_module_key ~ '^chapter-[0-9]{2}$' then
    if p_module_key = 'chapter-01' then
      return true;
    end if;
    return exists (
      select 1
        from public.ppg_chapter_unlocks u
       where u.learner_id = p_caller
         and u.chapter_key = p_module_key
    );
  end if;

  select m.order_index into v_order
    from public.ppg_modules m
   where m.module_key = p_module_key;
  if v_order is null then
    return false;
  end if;

  if v_order = 1 then
    return true;
  end if;

  -- Legacy module spine (soft-archived): unchanged from #74.
  return exists (
    select 1
      from public.ppg_module_missions mi
     where mi.learner_id = p_caller
       and mi.status = 'complete'
       and mi.module_key = (
         select m2.module_key
           from public.ppg_modules m2
           join public.ppg_modules m_cur on m_cur.module_key = p_module_key
          where m2.course_key = m_cur.course_key
            and m2.order_index = v_order - 1
          limit 1
       )
  );
end;
$$;

revoke execute on function public.ppg_module_unlocked(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_unlocked(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_module_unlocked(uuid, text) is
  'PPGA #9/#10/#74, rewritten by #76: chapter-01 opens on the #8 gate alone; chapter N+1 opens iff the caller owns ppg_chapter_unlocks(chapter_key = N+1) — the 70% post-test record, never a Self-Check or a client claim. The legacy module-NN branch keeps #74''s previous-module-Mission rule.';

-- ----------------------------------------------------------------------------
-- 7. The chapter state read: a locked chapter is denied server-side, and the
--    next unlock state comes from the same global rule.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_chapter_test_state(p_chapter_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_chapter public.ppg_modules%rowtype;
  v_next text;
  v_pre jsonb;
  v_post jsonb;
begin
  if auth.role() not in ('learner', 'teacher', 'admin') then
    raise exception 'permission_denied: ppg_chapter_test_state is learner/teacher/admin only';
  end if;

  if p_chapter_key !~ '^chapter-[0-9]{2}$' then
    raise exception 'chapter_denied: p_chapter_key must look like chapter-NN';
  end if;

  select * into v_chapter
    from public.ppg_modules m
   where m.module_key = p_chapter_key;
  if not found then
    raise exception 'chapter_missing: no chapter row for %', p_chapter_key;
  end if;

  if auth.role() = 'learner' then
    if not public.ppg_learner_gated(auth.uid()) then
      raise exception 'gate_closed: the #8 gate must pass before chapter tests';
    end if;
    if v_chapter.publication_state <> 'published' then
      raise exception 'chapter_missing: the chapter is not published';
    end if;
    if not exists (
      select 1 from public.ppg_courses c
       where c.course_key = v_chapter.course_key and c.is_active
    ) then
      raise exception 'chapter_denied: the chapter is not on the active course';
    end if;
    if not public.ppg_module_unlocked(auth.uid(), p_chapter_key) then
      raise exception 'chapter_locked: the previous chapter post-test must reach 70%% before this chapter opens';
    end if;
  end if;

  v_next := 'chapter-' || lpad((substring(p_chapter_key from 9)::integer + 1)::text, 2, '0');

  v_pre := jsonb_build_object(
    'questions', public.ppg_chapter_test_bank(p_chapter_key, 'pre'),
    'total', (
      select count(distinct order_index)
        from public.ppg_chapter_test_questions
       where chapter_key = p_chapter_key and phase = 'pre' and form = 'a'
    ),
    'attempts', (
      select count(*) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
    ),
    'first_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
       order by attempt_seq asc limit 1
    ),
    'best_score', (
      select max(score) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
    ),
    'last_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
       order by attempt_seq desc limit 1
    ),
    'submitted_at', (
      select submitted_at from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
       order by attempt_seq desc limit 1
    ),
    'feedback', public.ppg_chapter_test_feedback(auth.uid(), p_chapter_key, 'pre')
  );

  v_post := jsonb_build_object(
    'questions', public.ppg_chapter_test_bank(p_chapter_key, 'post'),
    'total', (
      select count(distinct order_index)
        from public.ppg_chapter_test_questions
       where chapter_key = p_chapter_key and phase = 'post' and form = 'b'
    ),
    'attempts', (
      select count(*) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
    ),
    'first_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
       order by attempt_seq asc limit 1
    ),
    'best_score', (
      select max(score) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
    ),
    'last_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
       order by attempt_seq desc limit 1
    ),
    'submitted_at', (
      select submitted_at from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
       order by attempt_seq desc limit 1
    ),
    'feedback', public.ppg_chapter_test_feedback(auth.uid(), p_chapter_key, 'post')
  );

  return jsonb_build_object(
    'chapter_key', v_chapter.module_key,
    'course_key', v_chapter.course_key,
    'title_th', v_chapter.title_th,
    'title_en', v_chapter.title_en,
    'pre', v_pre,
    'post', v_post,
    'next_chapter_key', v_next,
    'next_unlocked', public.ppg_module_unlocked(auth.uid(), v_next)
  );
end;
$$;

revoke execute on function public.ppg_chapter_test_state(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_chapter_test_state(text)
  to service_role, authenticated;

comment on function public.ppg_chapter_test_state(text) is
  'PPGA #74, hardened by #76: the Chapter test screen state — both banks without the key, the caller''s attempts + feedback, and the real next-chapter unlock. A learner cannot read a chapter the previous post-test has not unlocked (chapter_locked).';

-- ----------------------------------------------------------------------------
-- 8. The chapter submit: the unlock gate, the 70% best-score rule and the
--    reward event. XP and badges ride the same transaction as the attempt.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_chapter_test_submit(
  p_chapter_key text,
  p_phase text,
  p_language text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_chapter public.ppg_modules%rowtype;
  v_form text;
  v_total integer;
  v_score integer;
  v_seq integer;
  v_first integer;
  v_best integer;
  v_passed boolean;
  v_next text;
  v_next_unlocked boolean;
  v_reward jsonb := '{}'::jsonb;
  v_xp integer := 0;
  v_badges jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'learner' then
    raise exception 'permission_denied: ppg_chapter_test_submit is learner-only';
  end if;

  if not public.ppg_learner_gated(auth.uid()) then
    raise exception 'gate_closed: the #8 gate must pass before chapter tests';
  end if;

  if p_chapter_key !~ '^chapter-[0-9]{2}$' then
    raise exception 'chapter_denied: p_chapter_key must look like chapter-NN';
  end if;

  if p_phase is null or p_phase not in ('pre', 'post') then
    raise exception 'phase_denied: p_phase must be pre|post';
  end if;

  if p_language is null or p_language not in ('th', 'en') then
    raise exception 'language_denied: the taken language is th|en ONLY';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers_denied: p_answers must be a JSON object';
  end if;

  select * into v_chapter
    from public.ppg_modules m
   where m.module_key = p_chapter_key;
  if not found then
    raise exception 'chapter_missing: no chapter row for %', p_chapter_key;
  end if;

  if v_chapter.publication_state <> 'published' then
    raise exception 'chapter_missing: the chapter is not published';
  end if;

  if not exists (
    select 1 from public.ppg_courses c
     where c.course_key = v_chapter.course_key and c.is_active
  ) then
    raise exception 'chapter_denied: the chapter is not on the active course';
  end if;

  -- The progression gate: the previous chapter's 70% post-test. Checked
  -- before the bank read so a locked chapter never scores an attempt.
  if not public.ppg_module_unlocked(auth.uid(), p_chapter_key) then
    raise exception 'chapter_locked: the previous chapter post-test must reach 70%% before this chapter opens';
  end if;

  v_form := case p_phase when 'pre' then 'a' else 'b' end;

  select count(distinct order_index) into v_total
    from public.ppg_chapter_test_questions
   where chapter_key = p_chapter_key and phase = p_phase and form = v_form;
  if v_total = 0 then
    raise exception 'bank_missing: no % bank for %', p_phase, p_chapter_key;
  end if;

  if p_phase = 'pre' and exists (
    select 1 from public.ppg_chapter_test_attempts
     where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
  ) then
    raise exception 'pre_already_submitted: the chapter pre-test is one attempt (diagnostic only)';
  end if;

  select count(*) into v_score
    from public.ppg_chapter_test_questions q
   where q.chapter_key = p_chapter_key
     and q.phase = p_phase
     and q.form = v_form
     and q.is_correct
     and (p_answers ->> q.order_index::text) = q.option_key;

  select coalesce(max(attempt_seq), 0) + 1 into v_seq
    from public.ppg_chapter_test_attempts
   where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = p_phase;

  insert into public.ppg_chapter_test_attempts
    (learner_id, chapter_key, phase, attempt_seq, language, answers, score, item_count)
  values
    (auth.uid(), p_chapter_key, p_phase, v_seq, p_language, p_answers, v_score, v_total);

  select score into v_first
    from public.ppg_chapter_test_attempts
   where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = p_phase
   order by attempt_seq asc limit 1;

  select max(score) into v_best
    from public.ppg_chapter_test_attempts
   where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = p_phase;

  v_passed := (v_best * 100) >= (70 * v_total);
  v_next := 'chapter-' || lpad((substring(p_chapter_key from 9)::integer + 1)::text, 2, '0');

  if p_phase = 'post' and v_passed then
    -- The unlock record IS the progression source of truth.
    insert into public.ppg_chapter_unlocks
      (learner_id, chapter_key, unlocked_by_score, item_count)
    values
      (auth.uid(), v_next, v_best, v_total)
    on conflict (learner_id, chapter_key) do update
      set unlocked_by_score = greatest(public.ppg_chapter_unlocks.unlocked_by_score, excluded.unlocked_by_score);

    -- The rewards: fixed XP once per chapter pass, badges once. A retry
    -- re-enters here and the ledger/award PKs return 0/false.
    v_reward := public.ppg_grant_chapter_rewards(auth.uid(), p_chapter_key, v_best, v_total);
    v_xp := coalesce((v_reward ->> 'xp_granted')::integer, 0);
    v_badges := coalesce(v_reward -> 'badges_granted', '[]'::jsonb);
  end if;

  v_next_unlocked := public.ppg_module_unlocked(auth.uid(), v_next);

  return jsonb_build_object(
    'ok', true,
    'chapter_key', p_chapter_key,
    'phase', p_phase,
    'attempt_seq', v_seq,
    'score', v_score,
    'total', v_total,
    'first_score', v_first,
    'best_score', v_best,
    'passed', v_passed,
    'next_chapter_key', v_next,
    'next_unlocked', v_next_unlocked,
    'xp_granted', v_xp,
    'badges_granted', v_badges,
    'feedback', public.ppg_chapter_test_feedback(auth.uid(), p_chapter_key, p_phase)
  );
end;
$$;

revoke execute on function public.ppg_chapter_test_submit(text, text, text, jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_chapter_test_submit(text, text, text, jsonb)
  to service_role, authenticated;

comment on function public.ppg_chapter_test_submit(text, text, text, jsonb) is
  'PPGA #74, rewired by #76: learner-only + gate + chapter unlock, server-side scoring, append-only attempts, best post-test >=70% writes ppg_chapter_unlocks and the fixed XP/badge rewards once. A locked chapter never scores an attempt (chapter_locked). Feedback carries right/wrong only.';

-- ----------------------------------------------------------------------------
-- 9. Self-Check decoupling: a chapter lesson's Self-Check path records its
--    event but awards NO XP and NO badges. Legacy module lessons keep the
--    #10/#11 behaviour (already-granted history and its tests stay intact).
-- ----------------------------------------------------------------------------
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

  -- #76: the chapter loop is reward-driven by its post-test. A chapter
  -- lesson reached through the legacy Self-Check path records the event
  -- (history stays) but awards nothing; the mini-checks in the lesson
  -- player are formative and write nothing at all.
  if v_outcome = 'pass' and p_lesson_key like 'module-%' then
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

    if not exists (
      select 1
        from public.ppg_badge_awards b
       where b.learner_id = auth.uid()
         and b.badge_key = 'mission_ready'
    ) then
      insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
      values (auth.uid(), 'mission_ready', 'self_check_pass', p_lesson_key, now());
    end if;
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
  'PPGA #10/#11, decoupled by #76: the legacy Self-Check still records pass/fail events, but only `module-*` lessons award the legacy +50 and First Steps/Mission Ready badges. A `chapter-*` lesson awards nothing, and a Self-Check pass never gates chapter progression (ppg_module_unlocked ignores it).';

-- ----------------------------------------------------------------------------
-- 10. Knowledge Mission visibility: the chapter loop's Mission depends on the
--     chapter unlock, not on a Self-Check. The legacy module rule is kept.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_knowledge_mission_visible(p_caller uuid, p_module_key text)
returns boolean
language plpgsql
stable
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

  -- #76: a chapter Mission opens with the chapter (the 70% post-test on the
  -- previous chapter). Only the archived legacy module spine still reads
  -- the last lesson's Self-Check pass.
  if p_module_key ~ '^chapter-[0-9]{2}$' then
    return true;
  end if;

  select l.lesson_key INTO v_last_lesson
    FROM public.ppg_lessons l
  WHERE l.module_key = p_module_key
  ORDER BY l.order_index DESC
  LIMIT 1;

  if v_last_lesson is null then
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
  'PPGA #11, decoupled by #76: a chapter Knowledge Mission opens with the chapter unlock (no Self-Check); the legacy module path keeps the last-lesson Self-Check rule.';

-- ----------------------------------------------------------------------------
-- 11. Mission submit: a chapter Mission still awards its fixed +100 once, but
--     no legacy module badge is fabricated for a chapter key (#76 keeps the
--     loop's badges to the four assessment milestones).
-- ----------------------------------------------------------------------------
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
    insert into public.ppg_module_missions (module_key, learner_id, status)
    values (p_module_key, auth.uid(), 'complete')
    on conflict (module_key, learner_id) do update
      set status = 'complete';

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

    -- #76: the legacy per-module badge stays for the archived module spine;
    -- a chapter Mission awards XP only (the four CAI badges mark the
    -- assessment milestones). Mission completion never affects unlocks.
    if p_module_key ~ '^module-[0-9]{2}$' then
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
  'PPGA #11, extended by #76: the Knowledge Mission submit. A pass awards the fixed +100 once (ledger PK) in the same transaction. Legacy module keys also award their module badge; chapter keys award XP only. Mission completion is optional for chapter progression — the 70% post-test is the only unlock.';
