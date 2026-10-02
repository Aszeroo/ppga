-- PPGA #18 (both-language journeys in one invocation, finding #5): the review
-- RPC resolved the submission by (mission_id, submission_seq) ALONE — a pair
-- that is unique only WITHIN one learner (the submission PK is
-- (learner_id, mission_id, submission_seq)). With two learners at the same
-- round (the `th` and the `en` journey in one `playwright test` invocation,
-- and any two real learners who both submit round 1 of the same practical),
-- the `select ... into` picked an ARBITRARY row: the second teacher's review
-- ran on the first learner's already-approved round (`not_pending`) while the
-- owner's own row stayed `submitted` forever. The optional p_learner_id
-- scopes the row read; a NULL caller keeps the legacy resolution (the seam
-- tests' positional 6-arg calls). The write path already rode the resolved
-- v_learner_id (learner_id, mission_id, submission_seq) — unchanged.
-- The 6-arg overload is DROPPED, not kept: two same-named functions (the
-- legacy 6-arg + this 7-arg with a DEFAULT) make EVERY PostgREST RPC call
-- ambiguous (`Could not choose the best candidate function`), and the
-- `select ... into` in the legacy body is the exact bug being fixed.

DROP FUNCTION IF EXISTS public.ppg_submit_review(
  text, integer, jsonb, ppg_review_decision, text, text
);

CREATE OR REPLACE FUNCTION public.ppg_submit_review(
  p_mission_id       text,
  p_submission_seq   integer,
  p_scores           jsonb,
  p_decision         ppg_review_decision,
  p_feedback_th      text,
  p_feedback_en      text,
  p_learner_id       uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and s.submission_seq = p_submission_seq
      and (p_learner_id is null or s.learner_id = p_learner_id);
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
  -- approved|needs_improvement` (the definer seam carries `ppg.rerun` past
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
$function$;
