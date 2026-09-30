-- ============================================================================
-- PPGA #15: Final Project acceptance (+300 XP once, Final Boss / Level 5 /
-- Course Complete badges from the real approval event), the Post-Test (unlocks
-- ONLY on Final Project acceptance) and the Satisfaction Survey (follows the
-- Post-Test) — the research close for the Learner (ADR-0002 sequencing,
-- ADR-0001 currency).
--
-- The Final Project is the 11th Mission of the ONE linear spine: Modules 1-7
-- are Knowledge, 8-10 are Practical, module-11 is the integrative Practical
-- the whole Course ends into. It rides #13's submissions + #14's review
-- machinery; the APPROVAL branch of ppg_submit_review is widened here to
-- branch on module-11 (+300 instead of +150, event_type `final_project`, the
-- three close badges) and to UPSERT the `ppg_module_missions` completion the
-- linear rule reads (#9's unlock authority; a practical approval finally
-- WRITES the completion state it always decided).
--
-- Both research instruments mirror the #8 Pre-Test engine: versioned seeded
-- instrument (the answer key server-side, never a client SELECT), one response
-- row per learner (the single-attempt PK), the autosave pre-submission only,
-- the immutable-once-submitted trigger, no DELETE policy, instrument version +
-- language recorded per row (ADR-0002). The SEQUENCING is the DATABASE's:
--   Post-Test unlocks iff module-11's Mission is `complete` for the CALLER
--   (written ONLY by the Teacher's approval, same transaction);
--   Survey unlocks iff the CALLER's Post-Test response is submitted.
-- A learner who smuggles the early call reaches `final_project_not_accepted` /
-- `posttest_not_submitted` — never a silently-early instrument.
--
-- Research integrity + currency (ADR-0002 + ADR-0001): Post-Test and Survey
-- grant NOTHING — no ledger INSERT, no badge INSERT anywhere near them (the
-- ledger's own event_type CHECK already excludes them). The +300 is the
-- Final Project approval's alone, idempotent through the ledger PK
-- (learner_id, event_type, event_ref) — a re-approval of another round NEVER
-- grants a second +300. The Level 5 badge rides the REAL level
-- (floor(total XP / 100) + 1 >= 5 — the ledger's sum, never a claimed flag);
-- Final Boss + Course Complete ride the real approval event, once (the award
-- PK). Submissions, rubric scores, attempts and audit events stay append-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The spine widens: module-11 becomes addressable by the curriculum tables.
-- ----------------------------------------------------------------------------

-- The linear rule's table allowed orders 1..10 (#9); the Final Project is the
-- 11th Mission (PRD: modules 1-7 Knowledge, 8-10 Practical, + Final Project).
alter table public.ppg_modules
  drop constraint ppg_module_order_check;
alter table public.ppg_modules
  add constraint ppg_module_order_check check (order_index between 1 and 11);

-- The practical-mission range widens to the Final Project (the integrative
-- Practical Mission riding the same upload + review machinery). The regex is
-- also anchored properly here (the #13 form only anchored the first branch).
alter table public.ppg_practical_missions
  drop constraint ppg_practical_module_range;
alter table public.ppg_practical_missions
  add constraint ppg_practical_module_range
  check (module_key ~ '^(module-08|module-09|module-10|module-11)$');

-- The Skill Domain tag the Final Project rides (the glossary's integrative
-- domain; the module table's FK demands it exists).
insert into public.ppg_skill_domains (domain, label_th, label_en)
  values
    ('Final Project', 'พรีเซนตพร้อมส้าง (Final Project)', 'Final Project')
on conflict (domain) do nothing;

-- The 11th Module of the ONE Course — published (the real close screen),
-- bilingual, ordered last.
insert into public.ppg_modules
  (module_key, course_key, order_index, skill_domain, title_th, title_en, summary_th, summary_en, publication_state)
  values
    ('module-11', 'powerpoint-creation', 11, 'Final Project',
     'พรีเซนตพร้อมส้าง (Final Project)',
     'The Final Project',
     'ส้างพรีเซนต 8 สไลดรวมทุกทักษะ — เปิดงาน, สไลด, ข้อความ, แบบ, Font, รูปร่าง, SmartArt,วางรปู, Transition, ตรวจแก้มกับส้าง-PDF.',
     'Build one 8-slide deck combining every skill of the Course: open, slides, text, design, fonts, shapes, SmartArt, object layout, transitions, review & export.',
     'published')
on conflict (module_key) do nothing;

-- The Final Project's Practical Mission body (the integrative scenario the
-- Lessons 1-10 end into; bilingual, real seeded content — ADR-0003).
insert into public.ppg_practical_missions
  (module_key, scenario_th, scenario_en, requirements_th, requirements_en, expected_out_th, expected_out_en)
  values
    ('module-11',
     'งานสุดท้້ายของวชิ: ส้างพรีเซนต 8 สไลดเพอื นำเสนอ เรือง ทักษะ PowerPoint ของผม/ดิฉัน รวมทุกทักษะทเรยี นมาตังแต่ Module 1 ถง 10.',
     'The Course''s final deliverable: build an 8-slide presentation titled "My PowerPoint Skills" that combines every skill learned from Module 1 through Module 10.',
     '8 สไลด; สไลดแรกชอื งาน; ใช้ text, font, color; ใช้ images, shapes, SmartArt; ใช้ transition; ตรวจ review แลว้ export เปน PDF แลว้ส่ง ไฟล .pptx พร้อม reflection สนั ๆ.',
     'Eight slides; a title slide; text with fonts and colors; at least one image, shape and SmartArt graphic; a transition; review the deck, export a PDF, then upload the .pptx file with a short reflection.',
     'ไฟล .pptx ครบ 8 สไลด ครบทกทักษะ ตรวจแล้วก่อนสง่.',
     'A complete 8-slide .pptx that exercises every Course skill, checked before submitting.')
on conflict (module_key) do nothing;

-- The completion record the linear rule reads: the Final Project is LOCKED
-- (incomplete) for every seeded Learner until the Teacher's approval writes
-- `complete` (the replaced ppg_submit_review below — the ONLY writer for
-- module-11; a client never may: the placeholder's UPDATE policy denies).
insert into public.ppg_module_missions (module_key, learner_id)
  select m.module_key, p.id
    from public.ppg_modules m
   cross join public.ppg_profiles p
   where p.role = 'learner'
     and m.module_key = 'module-11'
on conflict (module_key, learner_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. The close badges: Final Boss, Level 5, Course Complete (award_event
--    `final_project` — the ledger/badge taxonomy already reserves it; the
--    awards ride the REAL approval, once, through the award PK).
-- ----------------------------------------------------------------------------
insert into public.ppg_badge_types
  (badge_key, label_th, label_en, award_rule_th, award_rule_en, award_event)
  values
    ('final_boss',
     'บอสสุดท้้าย (Final Boss)',
     'Final Boss',
     'Final Project ไดร้ับ approved — บอสสดุท้ายของ Course (a real event, +300 XP once)',
     'Final Boss — awarded on the Final Project''s approval (a real event, +300 XP once)',
     'final_project'),
    ('level_5',
     'ระดับ 5 (Level 5)',
     'Level 5',
     'ระดบั = floor(XP รวม/100)+1 ถง 5 ขนไป (400 XP รวมขึนไป) ณ จดุ Final Project approved — the level the ledger''s sum computes',
     'Level 5 — awarded when the ledger''s real total reaches 400 XP (floor(total/100)+1 = 5) at the Final Project approval (a real sum, never a claimed flag)',
     'final_project'),
    ('course_complete',
     'จบ Course (Course Complete)',
     'Course Complete',
     'Final Project ไดร้ับ approved — Course ทังหมดจบแล้ว (a real event, once)',
     'Course Complete — awarded on the Final Project''s approval: the whole linear Course is done (a real event, once)',
     'final_project')
on conflict (badge_key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. ppg_submit_review widened (#15 onto #14): the APPROVAL branch now knows
--    the Final Project, and every practical approval finally WRITES the
--    Mission completion the linear rule reads.
--    module-11 approval:  +300 once (`final_project` ledger event), the Final
--      Boss + Course Complete badges once, and the Level 5 badge iff the
--      ledger's real total after the grant reaches 400 XP (level
--      floor(total/100)+1 >= 5 — never a claimed flag).
--    module-08..10 approval: unchanged (+150 once, module_XX_mission badge).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_submit_review(
  p_mission_id       text,
  p_submission_seq   integer,
  p_scores           jsonb,          -- {"content_structure":3,...} 1–5 ×7
  p_decision         ppg_review_decision,
  p_feedback_th      text,
  p_feedback_en      text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();           -- the teacher/admin caller's own uid
  v_learner_id uuid;                   -- the submission owner (the row read below)
  v_c1 integer;
  v_c2 integer;
  v_c3 integer;
  v_c4 integer;
  v_c5 integer;
  v_c6 integer;
  v_c7 integer;
  v_total integer;
  v_total_xp integer;                  -- the ledger's real total (level authority)
  v_status_before ppg_submission_status;
  v_granted_xp integer := 0;
  v_badge_granted boolean := false;
  v_module_badge_key text;
begin
  if auth.role() not in ('teacher','admin') then
    raise exception 'denied_role: the review is teacher/admin-only (a learner''s write NEVER yields a review row)';
  end if;
  if auth.uid() <> v_uid then
    raise exception 'denied_caller: the caller''s own uid NEVER writes a stranger''s review row';
  end if;

  select s.learner_id, s.status into v_learner_id, v_status_before
    from public.ppg_submissions s
    where s.mission_id = p_mission_id
      and s.submission_seq = p_submission_seq;
  if v_learner_id is null or v_status_before is null then
    raise exception 'submission_missing: no row to review for this mission/round (round %1$2s)',
      p_submission_seq;
  end if;
  if v_status_before <> 'submitted' then
    raise exception 'not_pending: the review runs on a `submitted` row ONLY (a round already reviewed NEVER speaks) (round %1$2s)',
      p_submission_seq;
  end if;

  v_c1 := (p_scores ->> 'content_structure')::integer;
  v_c2 := (p_scores ->> 'text_formatting')::integer;
  v_c3 := (p_scores ->> 'images_visual')::integer;
  v_c4 := (p_scores ->> 'slide_design')::integer;
  v_c5 := (p_scores ->> 'powerpoint_tool_usage')::integer;
  v_c6 := (p_scores ->> 'creativity')::integer;
  v_c7 := (p_scores ->> 'completeness')::integer;
  if v_c1 is null or v_c2 is null or v_c3 is null or v_c4 is null or
     v_c5 is null or v_c6 is null or v_c7 is null then
    raise exception 'rubric_validation_missing: the 7 criterion scores ride the jsonb ALL (round %1$2s)',
      p_submission_seq;
  end if;
  if v_c1 not between 1 and 5 or v_c2 not between 1 and 5 or v_c3 not between 1 and 5 or
     v_c4 not between 1 and 5 or v_c5 not between 1 and 5 or v_c6 not between 1 and 5 or
     v_c7 not between 1 and 5 then
    raise exception 'rubric_score_denied: 1–5 each ONLY; a 0/6/8 NEVER rides the rubric (round %1$2s)',
      p_submission_seq;
  end if;
  v_total := v_c1 + v_c2 + v_c3 + v_c4 + v_c5 + v_c6 + v_c7;          -- the SERVER-computed sum
  if v_total not between 7 and 35 then
    raise exception 'rubric_total_denied: 7–35 the server-computed sum ONLY (round %1$2s)',
      p_submission_seq;
  end if;

  -- the definer seam (#14): the review's own UPDATE of review_* carries
  -- `ppg_rerun = on` (the append-only trigger allows the review columns iff
  -- the flag rides; a hand replay update NEVER speaks).
  perform set_config('ppg.rerun', 'on', true);

  update public.ppg_submissions
     set review_verdict = p_decision::text,
         review_notes_th  = p_feedback_th,
         review_notes_en  = p_feedback_en,
         reviewed_by      = v_uid,
         reviewed_at      = now()
    where learner_id = v_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;

  -- the review row: the per-round rubric scores (append-only; the PK is the
  -- authority — a replay INSERT of the same round reaches conflict, never an
  -- overwrite; ADR-0002).
  insert into public.ppg_rubric_reviews
    (learner_id, mission_id, submission_seq, teacher_id,
      score_content_structure, score_text_formatting, score_images_visual,
      score_slide_design, score_tool_usage, score_creativity, score_completeness,
      total_score, decision, feedback_th, feedback_en, created_at)
    values (
      v_learner_id, p_mission_id, p_submission_seq, v_uid,
      v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_c7,
      v_total, p_decision, p_feedback_th, p_feedback_en, now()
    );

  -- the status transition: #13's own function moves `submitted ->
  -- approved|needs_improvement` (the definer seam carries `ppg_rerun` past
  -- denied_role; the illegal pair NEVER moves, invalid_transition).
  perform * from public.ppg_set_submission_status(
    v_learner_id, p_mission_id, p_submission_seq,
    case p_decision
      when 'approved' then 'approved'::ppg_submission_status
      else 'needs_improvement'::ppg_submission_status
    end
  );

  if p_decision = 'approved' then
    -- The completion the linear rule (#9) reads: an approved Mission is the
    -- `complete` record — UPSERT (the PK (module_key, learner_id) — a replay
    -- rides do-update, never a second row). For module-11 this single write
    -- is ALSO the Post-Test's unlock authority below.
    insert into public.ppg_module_missions (module_key, learner_id, status)
      values (p_mission_id, v_learner_id, 'complete')
    on conflict (module_key, learner_id) do update set status = 'complete';

    if p_mission_id = 'module-11' then
      -- The Final Project's close grants (#15, ADR-0001):
      -- the +300 XP ONCE — the ONLY grant authority is the ledger's PK
      -- (learner_id, 'final_project', 'module-11'); a re-approval of another
      -- round NEVER conflicts a second +300 away from the learner, and never
      -- grants one either (the existence guard); `xp_granted` says what the
      -- CALLER actually received.
      if not exists (
        select 1
          from public.ppg_xp_ledger x
        where x.learner_id = v_learner_id
          and x.event_type = 'final_project'
          and x.event_ref  = 'module-11'
      ) then
        insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
        values (v_learner_id, 'final_project', 'module-11', 300, now());
        v_granted_xp := 300;
      end if;

      -- Final Boss + Course Complete: the approval event's own record, once
      -- per learner (the award PK (learner_id, badge_key) is the authority; a
      -- replay reaches the guard, never a duplicate badge).
      if not exists (
        select 1
          from public.ppg_badge_awards b
        where b.learner_id = v_learner_id
          and b.badge_key = 'final_boss'
      ) then
        insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
        values (v_learner_id, 'final_boss', 'final_project', 'module-11', now());
        v_badge_granted := true;
      end if;
      if not exists (
        select 1
          from public.ppg_badge_awards b
        where b.learner_id = v_learner_id
          and b.badge_key = 'course_complete'
      ) then
        insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
        values (v_learner_id, 'course_complete', 'final_project', 'module-11', now());
        v_badge_granted := true;
      end if;

      -- Level 5 rides the REAL level: floor(total XP / 100) + 1 >= 5 — the
      -- ledger's own sum AFTER this grant (400 XP total). A learner whose
      -- real total is under 400 NEVER receives the Level 5 badge from this
      -- event (the level is the ledger's computation, never a claimed flag).
      select coalesce(sum(x.amount), 0) into v_total_xp
        from public.ppg_xp_ledger x
       where x.learner_id = v_learner_id;
      if v_total_xp >= 400 and not exists (
        select 1
          from public.ppg_badge_awards b
        where b.learner_id = v_learner_id
          and b.badge_key = 'level_5'
      ) then
        insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
        values (v_learner_id, 'level_5', 'final_project', 'module-11', now());
        v_badge_granted := true;
      end if;

      v_module_badge_key := 'final_boss';
    else
      -- the practical modules 8..10: #14's grant UNCHANGED — the +150 XP the
      -- FIRST approval (the ledger PK — a re-approval NEVER grants a second
      -- +150) + the module badge (the award PK ONCE).
      if not exists (
        select 1
          from public.ppg_xp_ledger x
        where x.learner_id = v_learner_id
          and x.event_type = 'practical_approval'
          and x.event_ref  = p_mission_id
      ) then
        insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
        values (v_learner_id, 'practical_approval', p_mission_id, 150, now());
        v_granted_xp := 150;
      end if;

      v_module_badge_key := 'module_' || right(p_mission_id, 2) || '_mission';
      if not exists (
        select 1
          from public.ppg_badge_awards b
        where b.learner_id = v_learner_id
          and b.badge_key = v_module_badge_key
      ) then
        insert into public.ppg_badge_awards (learner_id, badge_key, award_event, event_ref, awarded_at)
        values (v_learner_id, v_module_badge_key, 'practical_approval', p_mission_id, now());
        v_badge_granted := true;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'mission_id', p_mission_id,
    'submission_seq', p_submission_seq,
    'decision', p_decision,
    'total_score', v_total,
    'scores', p_scores,
    'xp_granted', v_granted_xp,
    'badge_granted', v_badge_granted,
    'module_badge_key', v_module_badge_key
  );
end;
$$;

revoke execute on function public.ppg_submit_review(text,integer,jsonb,ppg_review_decision,text,text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_submit_review(text,integer,jsonb,ppg_review_decision,text,text)
  to authenticator;

comment on function public.ppg_submit_review(text,integer,jsonb,ppg_review_decision,text,text) is
  'PPGA #14 widened by PPGA #15: the Teacher''s review (rubric + append-only round, unchanged) — the APPROVAL branch now branches on module-11 (the Final Project): +300 XP once (`final_project` ledger event, the PK the only once-authority), Final Boss + Course Complete badges from the real event once (the award PK), and the Level 5 badge iff the ledger''s real total after the grant reaches 400 XP (floor(total/100)+1 = 5 — never a claimed flag); modules 8..10 keep the +150 + module badge; EVERY practical approval UPSERTs the `ppg_module_missions` completion the linear rule reads (module-11''s completion is the Post-Test''s unlock authority below). A research instrument is NEVER an event here (ADR-0001).';

-- ----------------------------------------------------------------------------
-- 4. The unlock functions: the Post-Test's and the Survey's gates. SECURITY
--    DEFINER like ppg_learner_gated (the RLS policies evaluate them under the
--    caller's JWT; the definer's rights never bypass a caller's own-row reads).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_posttest_unlocked(p_learner uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.ppg_module_missions mi
    where mi.learner_id = p_learner
      and mi.module_key = 'module-11'
      and mi.status = 'complete'
  );
$$;

revoke execute on function public.ppg_posttest_unlocked(uuid)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_unlocked(uuid)
  to service_role, authenticated;

comment on function public.ppg_posttest_unlocked(uuid) is
  'PPGA #15: the Post-Test''s gate — module-11 (the Final Project) is `complete` for the learner, i.e. the Teacher APPROVED a final-project round (the replaced ppg_submit_review is the ONLY writer of that completion). Post-Test unlocks on Final Project acceptance, NEVER earlier (ADR-0002).';



-- ----------------------------------------------------------------------------
-- 5. The Post-Test: the #8 engine mirrored (versioned instrument, server-side
--    key, single-attempt PK, autosave, immutable trigger, no DELETE policy,
--    version + language recorded), sequenced by ppg_posttest_unlocked.
-- ----------------------------------------------------------------------------
create table public.ppg_posttest_instruments (
  version text primary key,
  items jsonb not null,
  answer_key jsonb not null,
  seeded_at timestamptz not null default now()
);

comment on table public.ppg_posttest_instruments is
  'PPGA #15: the versioned seeded Post-Test instrument; bilingual items + the server-side answer key (never a client-readable key). The version pairs with the Pre-Test''s (ADR-0002 keeps pre/post comparison interpretable).';
comment on column public.ppg_posttest_instruments.version is
  'The instrument''s identity — recorded per response (ADR-0002).';
comment on column public.ppg_posttest_instruments.answer_key is
  'The answer key the submit function scores from; the read rides the definer''s rights — a learner may never SELECT it, only their own response row.';

alter table public.ppg_posttest_instruments enable row level security;

-- Read: the instrument's items are what the Post-Test screen must show — a
-- FINAL-PROJECT-ACCEPTED learner only (the unlock gate at the row level; an
-- early learner reaches `SELECT 0`, never a smuggled read). The answer key is
-- never readable by ANY policy.
create policy ppg_posttest_items on public.ppg_posttest_instruments
  for select
  using (auth.role() = 'learner'
    and public.ppg_posttest_unlocked(auth.uid()));

-- UPDATE / DELETE / INSERT: no policy — the instrument is immutably seeded by
-- this migration; a client can never smuggle a parallel-form key.
insert into public.ppg_posttest_instruments (version, items, answer_key)
  values (
    '2026.09.1',
    -- Bilingual post items mirror the Pre-Test's single-item form (the real
    -- instrument ships with the content pass; the ENGINE is what this ticket
    -- proves — sequencing, single attempt, immutability, recording).
    '[
      { "id": "item_1",
        "th": {"prompt": "PowerPoint ใช้สำหรับทำงานประเภทใด?", "choices": {"A": "นำเสนองาน (presentation)", "B": "ตัดต่อวิดีโอ", "C": "เขียนฐานข้อมูล", "D": "แต่งรูป"}},
        "en": {"prompt": "What kind of work is PowerPoint used for?", "choices": {"A": "Presentations", "B": "Video editing", "C": "Database scripting", "D": "Photo retouching"}},
        "answer": "A"
      }
    ]'::jsonb,
    '{"item_1": "A"}'::jsonb
  )
on conflict (version) do nothing;

create table public.ppg_posttest_responses (
  learner_id uuid primary key references auth.users (id) on delete cascade,
  instrument_version text not null references public.ppg_posttest_instruments (version) on delete restrict,
  language text not null,
  answers jsonb,
  autosave_state jsonb not null default '{}'::jsonb,
  score integer,
  submitted_at timestamptz,
  constraint ppg_posttest_language_check check (language in ('th', 'en'))
);

comment on table public.ppg_posttest_responses is
  'PPGA #15: the Post-Test response; one row per learner (the single-attempt PK); instrument version + language recorded per row (ADR-0002); autosave resumable; score server-side; immutable once submitted. Grants NOTHING (ADR-0001: a research instrument is never a reward).';
comment on column public.ppg_posttest_responses.learner_id is
  'The learner''s own id — the PK makes single-attempt by construction.';
comment on column public.ppg_posttest_responses.instrument_version is
  'The seeded instrument''s version (the FK — an unknown version cannot INSERT; ADR-0002).';
comment on column public.ppg_posttest_responses.language is
  'th | en — the language the Learner took the instrument in; recorded per response.';
comment on column public.ppg_posttest_responses.submitted_at is
  'The single-attempt stamp — NULL until the submit; the Survey''s unlock reads it (ppg_survey_unlocked).';

alter table public.ppg_posttest_responses enable row level security;

create policy ppg_posttest_responses_select on public.ppg_posttest_responses
  for select
  using (
    (auth.role() = 'learner' and learner_id = auth.uid()
      and public.ppg_posttest_unlocked(auth.uid()))
    or auth.role() = 'teacher'
    or auth.role() = 'admin'
  );

-- INSERT: the row may be created ONLY after the Final Project is accepted
-- (the unlock gate speaks here too — an early INSERT is a silent 0-row deny
-- at the policy, and the submit function below re-gates as
-- `final_project_not_accepted`). The PK makes the second row impossible.
create policy ppg_posttest_responses_insert on public.ppg_posttest_responses
  for insert
  with check (
    auth.role() = 'learner'
    and learner_id = auth.uid()
    and public.ppg_posttest_unlocked(auth.uid())
  );

create policy ppg_posttest_responses_update on public.ppg_posttest_responses
  for update
  using (
    (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
    or (auth.role() = 'admin')
  )
  with check (
    (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
    or (auth.role() = 'admin' and submitted_at IS NULL)
  );

-- DELETE: no policy is granted — the response cannot be deleted by a client
-- (append-only, ADR-0002); it retires only via the auth.users cascade.

create or replace function public.ppg_posttest_immutable()
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

drop trigger if exists ppg_posttest_immutable on public.ppg_posttest_responses;
create trigger ppg_posttest_immutable
  before update on public.ppg_posttest_responses
  for each row
  execute function public.ppg_posttest_immutable();

comment on trigger ppg_posttest_immutable on public.ppg_posttest_responses is
  'PPGA #15: the single-attempt + immutable-once-submitted row-level authority (mirrors the Pre-Test''s trigger); an UPDATE after `submitted_at` raises `already_submitted`, never a silently-overwritten row.';

create or replace function public.ppg_posttest_upsert(p_autosave jsonb)
returns void
language sql
security invoker
as $$
  update public.ppg_posttest_responses
     set autosave_state = coalesce(p_autosave, '{}'::jsonb)
   where learner_id = auth.uid()
     and submitted_at IS NULL;
$$;

revoke execute on function public.ppg_posttest_upsert(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_upsert(jsonb)
  to service_role, authenticated;

comment on function public.ppg_posttest_upsert(jsonb) is
  'PPGA #15: the Post-Test autosave — the CALLER''s own row only (RLS + `submitted_at IS NULL`); a post-submit call reaches the immutable trigger, never a silent overwrite.';

create or replace function public.ppg_posttest_submit(p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_answer_key jsonb;
  v_score integer;
begin
  -- Gate 1: the caller is a learner (the JWT's role claim).
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_posttest_submit is learner-only (JWT role claim must be learner)';
  end if;

  -- Gate 2: the sequencing (ADR-0002): the Final Project's approval opens
  -- the Post-Test and NEVER earlier — the completion the Teacher's approval
  -- wrote is the authority (ppg_posttest_unlocked).
  if not public.ppg_posttest_unlocked(auth.uid()) then
    raise exception 'final_project_not_accepted: the Post-Test unlocks ONLY on the Final Project''s acceptance (the Teacher''s approval writes the unlock)';
  end if;

  -- The key read (definer's rights): the response row's own recorded
  -- instrument version decides the key (a learner may never SELECT it).
  SELECT i.answer_key INTO v_answer_key
    FROM public.ppg_posttest_instruments i
  WHERE i.version = (
    select instrument_version
      from public.ppg_posttest_responses
    where learner_id = auth.uid()
  );
  if v_answer_key IS NULL then
    raise exception 'response_missing: no Post-Test response row to submit (insert one first — the row may be created after the Final Project''s acceptance)';
  end if;

  -- The score: the server-side sum of `p_answers` that match the key (never
  -- client-decided). The instruments carry NO reward: this function grants no
  -- XP, no badge, nothing (ADR-0001 — a research instrument never rewards).
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
  -- own row, narrowed to an un-submitted one — a second submit finds no row.
  UPDATE public.ppg_posttest_responses r
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

revoke execute on function public.ppg_posttest_submit(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_submit(jsonb)
  to service_role, authenticated;

comment on function public.ppg_posttest_submit(jsonb) is
  'PPGA #15: the Post-Test submit-once — learner-only, unlocked ONLY by the Final Project''s acceptance (`final_project_not_accepted` otherwise), server-side score from the answer key, the atomic `submitted_at` stamp; a second call reaches `already_submitted_or_missing`. Grants NOTHING — no XP, no badge (ADR-0001).';

-- The row starter: the single response row is CREATED here — gated, once,
-- with the CURRENT instrument version (the server's own read, never a
-- client-smuggled version) + the learner's taken language (th|en only, the
-- CHECK the row carries). SECURITY DEFINER for this narrow insert: the
-- unlock gate is re-checked INSIDE the function (the INSERT policy's gate
-- speaks too; a double authority, never a bypass of the caller's own-row
-- reads). ON CONFLICT DO NOTHING keeps it idempotent — the autosave/submit
-- routes may call it before their real call; a second learner row is the
-- PK's denial by construction (single-attempt).
create or replace function public.ppg_posttest_start(p_language text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_version text;
begin
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_posttest_start is learner-only (JWT role claim must be learner)';
  end if;
  if p_language is null or p_language not in ('th','en') then
    raise exception 'language_denied: the taken language is th|en ONLY';
  end if;
  if not public.ppg_posttest_unlocked(auth.uid()) then
    raise exception 'final_project_not_accepted: the Post-Test unlocks ONLY on the Final Project''s acceptance';
  end if;

  select i.version into v_version
    from public.ppg_posttest_instruments i
   order by i.version desc
   limit 1;
  if v_version is null then
    raise exception 'instrument_missing: no seeded Post-Test instrument to start';
  end if;

  insert into public.ppg_posttest_responses (learner_id, instrument_version, language)
    values (auth.uid(), v_version, p_language)
  on conflict (learner_id) do nothing;
end;
$$;

revoke execute on function public.ppg_posttest_start(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_start(text)
  to service_role, authenticated;

comment on function public.ppg_posttest_start(text) is
  'PPGA #15: the Post-Test row starter — learner-only, unlock-gated (a second gate inside, beyond the INSERT policy), the CURRENT instrument version recorded server-side + the th|en taken language; idempotent (ON CONFLICT DO NOTHING — the single-attempt PK).';


-- ----------------------------------------------------------------------------
-- 6. The Satisfaction Survey: the same engine, gated by ppg_survey_unlocked
--    (the Post-Test's own submitted stamp). No answer key, no score — a
--    satisfaction instrument has no right answer; the responses are the
--    append-only research stream. Grants NOTHING (ADR-0001).
-- ----------------------------------------------------------------------------
create table public.ppg_survey_instruments (
  version text primary key,
  items jsonb not null,
  seeded_at timestamptz not null default now()
);

comment on table public.ppg_survey_instruments is
  'PPGA #15: the versioned seeded Satisfaction-Survey instrument; bilingual items only — the survey has NO answer key (satisfaction has no right answer); the version is recorded per response (ADR-0002).';

alter table public.ppg_survey_instruments enable row level security;

create or replace function public.ppg_survey_unlocked(p_learner uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.ppg_posttest_responses r
    where r.learner_id = p_learner
      and r.submitted_at IS NOT NULL
  );
$$;

revoke execute on function public.ppg_survey_unlocked(uuid)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_survey_unlocked(uuid)
  to service_role, authenticated;

comment on function public.ppg_survey_unlocked(uuid) is
  'PPGA #15: the Survey''s gate — the learner''s OWN Post-Test response is submitted (the single-attempt stamp). The Satisfaction Survey follows the Post-Test (ADR-0002); never earlier.';
create policy ppg_survey_items on public.ppg_survey_instruments
  for select
  using (auth.role() = 'learner'
    and public.ppg_survey_unlocked(auth.uid()));

insert into public.ppg_survey_instruments (version, items)
  values (
    '2026.09.1',
    '[
      { "id": "item_1",
        "th": {"prompt": "คุณพอใจกับหลักสูตรนี้แค่ไหน?", "choices": {"A": "มาก", "B": "ปานกลาง", "C": "น้อย"}},
        "en": {"prompt": "How satisfied are you with this course?", "choices": {"A": "Very", "B": "Moderate", "C": "Little"}}
      },
      { "id": "item_2",
        "th": {"prompt": "แบบฝึกหัดปฏิบัติช่วยให้เรียนเก่งขึ้นไหม?", "choices": {"A": "ช่วยให้เก่งขึ้นมาก", "B": "พอช่วยได้", "C": "ไม่ช่วยเลย"}},
        "en": {"prompt": "Did the practical missions improve your skills?", "choices": {"A": "A lot", "B": "Somewhat", "C": "Not at all"}}
      }
    ]'::jsonb
  )
on conflict (version) do nothing;

create table public.ppg_survey_responses (
  learner_id uuid primary key references auth.users (id) on delete cascade,
  instrument_version text not null references public.ppg_survey_instruments (version) on delete restrict,
  language text not null,
  answers jsonb,
  autosave_state jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  constraint ppg_survey_language_check check (language in ('th', 'en'))
);

comment on table public.ppg_survey_responses is
  'PPGA #15: the Satisfaction-Survey response; one row per learner (the single-attempt PK); instrument version + language recorded per row (ADR-0002); autosave resumable; immutable once submitted. Grants NOTHING (ADR-0001) and carries no score — satisfaction is not an assessment.';
comment on column public.ppg_survey_responses.submitted_at is
  'The single-attempt stamp — NULL until the submit; the immutable trigger reads it.';

alter table public.ppg_survey_responses enable row level security;

create policy ppg_survey_responses_select on public.ppg_survey_responses
  for select
  using (
    (auth.role() = 'learner' and learner_id = auth.uid()
      and public.ppg_survey_unlocked(auth.uid()))
    or auth.role() = 'teacher'
    or auth.role() = 'admin'
  );

create policy ppg_survey_responses_insert on public.ppg_survey_responses
  for insert
  with check (
    auth.role() = 'learner'
    and learner_id = auth.uid()
    and public.ppg_survey_unlocked(auth.uid())
  );

create policy ppg_survey_responses_update on public.ppg_survey_responses
  for update
  using (
    (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
    or (auth.role() = 'admin')
  )
  with check (
    (auth.role() = 'learner' and learner_id = auth.uid() and submitted_at IS NULL)
    or (auth.role() = 'admin' and submitted_at IS NULL)
  );

-- DELETE: no policy is granted — the survey response cannot be deleted by a
-- client (append-only, ADR-0002).

create or replace function public.ppg_survey_immutable()
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

drop trigger if exists ppg_survey_immutable on public.ppg_survey_responses;
create trigger ppg_survey_immutable
  before update on public.ppg_survey_responses
  for each row
  execute function public.ppg_survey_immutable();

comment on trigger ppg_survey_immutable on public.ppg_survey_responses is
  'PPGA #15: the single-attempt + immutable-once-submitted row-level authority for the Survey (mirrors the Pre-/Post-Test triggers).';

create or replace function public.ppg_survey_upsert(p_autosave jsonb)
returns void
language sql
security invoker
as $$
  update public.ppg_survey_responses
     set autosave_state = coalesce(p_autosave, '{}'::jsonb)
   where learner_id = auth.uid()
     and submitted_at IS NULL;
$$;

revoke execute on function public.ppg_survey_upsert(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_survey_upsert(jsonb)
  to service_role, authenticated;

comment on function public.ppg_survey_upsert(jsonb) is
  'PPGA #15: the Survey autosave — the CALLER''s own row only (RLS + `submitted_at IS NULL`); a post-submit call reaches the immutable trigger, never a silent overwrite.';

create or replace function public.ppg_survey_submit(p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Gate 1: the caller is a learner.
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_survey_submit is learner-only (JWT role claim must be learner)';
  end if;

  -- Gate 2: the sequencing (ADR-0002): the Survey follows the Post-Test and
  -- NEVER earlier — the learner's OWN Post-Test submitted stamp is the gate.
  if not public.ppg_survey_unlocked(auth.uid()) then
    raise exception 'posttest_not_submitted: the Satisfaction Survey unlocks ONLY after the Post-Test is submitted';
  end if;

  -- The atomic stamp — the survey has no key and no score (satisfaction is
  -- not an assessment); the answers + the recorded version + language ride
  -- the row the learner inserted. NO XP, NO badge — a research instrument
  -- grants nothing (ADR-0001; nothing is inserted anywhere near the ledger).
  UPDATE public.ppg_survey_responses r
     set answers = p_answers,
         submitted_at = now()
   WHERE r.learner_id = auth.uid()
     and r.submitted_at IS NULL;
  if not FOUND then
    raise exception 'already_submitted_or_missing: the response is already submitted (single-attempt) or no row to submit; the second submit cannot find an un-submitted row';
  end if;
end;
$$;

revoke execute on function public.ppg_survey_submit(jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_survey_submit(jsonb)
  to service_role, authenticated;

comment on function public.ppg_survey_submit(jsonb) is
  'PPGA #15: the Survey submit-once — learner-only, unlocked ONLY by the learner''s OWN submitted Post-Test (`posttest_not_submitted` otherwise), the atomic `submitted_at` stamp; a second call reaches `already_submitted_or_missing`. Grants NOTHING — no XP, no badge (ADR-0001).';

-- The row starter (the Survey's twin of the Post-Test's): gated, once, the
-- CURRENT instrument version recorded server-side + the th|en taken language;
-- idempotent through the single-attempt PK.
create or replace function public.ppg_survey_start(p_language text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_version text;
begin
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_survey_start is learner-only (JWT role claim must be learner)';
  end if;
  if p_language is null or p_language not in ('th','en') then
    raise exception 'language_denied: the taken language is th|en ONLY';
  end if;
  if not public.ppg_survey_unlocked(auth.uid()) then
    raise exception 'posttest_not_submitted: the Satisfaction Survey unlocks ONLY after the Post-Test is submitted';
  end if;

  select i.version into v_version
    from public.ppg_survey_instruments i
   order by i.version desc
   limit 1;
  if v_version is null then
    raise exception 'instrument_missing: no seeded Survey instrument to start';
  end if;

  insert into public.ppg_survey_responses (learner_id, instrument_version, language)
    values (auth.uid(), v_version, p_language)
  on conflict (learner_id) do nothing;
end;
$$;

revoke execute on function public.ppg_survey_start(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_survey_start(text)
  to service_role, authenticated;

comment on function public.ppg_survey_start(text) is
  'PPGA #15: the Survey row starter — learner-only, unlock-gated (a second gate inside, beyond the INSERT policy), the CURRENT instrument version recorded server-side + the th|en taken language; idempotent (ON CONFLICT DO NOTHING — the single-attempt PK).';

