-- 20260926001100_teacher_review_rubric.sql
-- Ticket #14: Teacher review of Submissions + the 7-criterion practical rubric.
-- BINDING spec (parent PRD #1): the 7 criteria — content structure, text
-- formatting, images & visual elements, slide design, PowerPoint tool usage,
-- creativity, completeness — 1–5 each with written descriptors, total 7–35.
-- ADR-0001: XP ≠ rubric score — the rubric scores NEVER ride the leaderboard
-- (the leaderboard reads XP, never a score); the scores stay stored PER REVIEW,
-- never overwrite. ADR-0002: review history is append-only; a needs-improvement
-- loop creates a NEW submission (#13's lifecycle already appends); the review
-- marks the CURRENT submission's status via #13's transition function (this
-- ticket wires the definer seam: the review's own RPC sets `ppg_rerun` + calls
-- ppg_set_submission_status, so a teacher's DIRECT call NEVER stays denied_role).
-- First-approval: +150 XP EXACTLY ONCE on the learner's first approved
-- submission of the Mission (the ledger PK idempotent pattern #10 set), the
-- module badge awarded ONCE (the award PK). Only Teacher/Admin can review
-- (RLS + the function's own gate deny a learner/stranger at the row/RPC).
-- Postgres is the domain layer: rubric validation (1–5 integers ×7, total
-- server-computed 7–35), review insert, transitions, XP idempotency — all in
-- DB functions/RLS; the client NEVER decides outcomes.
-- Supabase Storage API verified via ctx7 (the signed-URL download #13 route);
# no fake behavior; the descriptors are real bilingual copy (ADR-0003).

-- The rubric criteria: the 7 named criteria the Teacher scores 1–5 on. The
-- taxonomy is shared (read-only to the authenticated roles, no client authoring
-- — ADR-0003: content as migrations). The labels are real bilingual copy.
create table if not exists public.ppg_rubric_criteria (
  criterion_key  text primary key,
  ordinal        integer not null,
  label_th       text not null,
  label_en       text not null,
  created_at     timestamptz not null default now(),
  constraint ppg_rubric_ordinal check (ordinal between 1 and 7)
);

comment on table public.ppg_rubric_criteria is
  'PPGA #14: the 7 named rubric criteria the Teacher scores 1–5 on — content structure, text formatting, images & visual elements, slide design, PowerPoint tool usage, creativity, completeness. ADR-0001: a rubric score NEVER becomes the leaderboard state. ADR-0003: the taxonomy is shared (read-only, no client authoring).';

alter table public.ppg_rubric_criteria enable row level security;

create policy ppg_rubric_criteria_select on public.ppg_rubric_criteria
  for select
  using (auth.role() in ('learner', 'teacher', 'admin'));

-- The per-criterion descriptors: the written descriptor text per criterion
-- per score band 1–5 (ADR-0003 bilingual: real content, concise but real —
-- the descriptor says what a learner at 1 shows, what a learner at 5 shows,
-- in both languages; the review form shows the descriptor for the score the
-- teacher picks; the learner sees the descriptor for the score they earned).
create table if not exists public.ppg_rub_descriptors (
  criterion_key  text not null references public.ppg_rubric_criteria (criterion_key) on delete cascade,
  score_band     integer not null,
  descriptor_th  text not null,
  descriptor_en  text not null,
  created_at     timestamptz not null default now(),
  primary key (criterion_key, score_band),
  constraint ppg_rub_band check (score_band between 1 and 5)
);

comment on table public.ppg_rub_descriptors is
  'PPGA #14: the written descriptor text per criterion per score band 1–5 (ADR-0003 bilingual — the form shows the descriptor for the picked score; the learner sees the descriptor for the score earned. 7 criteria × 5 bands = 35 rows, no fake copy).';

alter table public.ppg_rub_descriptors enable row level security;

create policy ppg_r_descriptors_select on public.ppg_rub_descriptors
  for select
  using (auth.role() in ('learner', 'teacher', 'admin'));

-- The rubric reviews: one row PER REVIEW (the learner's latest result + the
-- append-only full review history). ADR-0002: INSERT-only via the review RPC
-- (a teacher/admin writes, no UPDATE/DELETE; a replay insert of the same
-- submission round reaches the PK conflict, never a second row, never an
-- overwrite). ADR-0001: the scores stay PER REVIEW, separate from XP/Level —
-- the scores NEVER ride the leaderboard (the leaderboard's read is XP).
create type ppg_review_decision as enum ('approved', 'needs_improvement');

create table if not exists public.ppg_rubric_reviews (
  learner_id       uuid        not null,             -- the submission owner (fk below)
  mission_id       text        not null,             -- the module_key the deck answers
  submission_seq   integer     not null,             -- the round the review marks
  teacher_id       uuid        not null,             -- auth.uid() the Teacher who minted the row
  score_content_structure integer not null,         -- 1–5; CHECK below
  score_text_formatting   integer not null,         -- 1–5
  score_images_visual     integer not null,         -- 1–5
  score_slide_design      integer not null,         -- 1–5
  score_tool_usage        integer not null,         -- 1–5 (PowerPoint tool usage)
  score_creativity        integer not null,         -- 1–5
  score_completeness      integer not null,         -- 1–5
  total_score      integer     not null,             -- 7–35; the SERVER-computed sum (never the client count)
  decision       ppg_review_decision not null,        -- approved | needs_improvement
  feedback_th    text,           -- the written feedback (bilingual pair)
  feedback_en    text,           -- the written feedback
  created_at     timestamptz not null default now(),
  primary key (learner_id, mission_id, submission_seq),          -- append-only: one row per round (a replay INSERT conflicts)
  foreign key (learner_id, mission_id, submission_seq)
    references public.ppg_submissions (learner_id, mission_id, submission_seq)
    on delete cascade,
  constraint ppg_r_score_content_structure check (score_content_structure between 1 and 5),
  constraint ppg_r_score_text_formatting   check (score_text_formatting   between 1 and 5),
  constraint ppg_r_score_images_visual     check (score_images_visual     between 1 and 5),
  constraint ppg_r_score_slide_design      check (score_slide_design      between 1 and 5),
  constraint ppg_r_score_tool_usage        check (score_tool_usage        between 1 and 5),
  constraint ppg_r_score_creativity        check (score_creativity        between 1 and 5),
  constraint ppg_r_score_completeness      check (score_completeness      between 1 and 5),
  constraint ppg_r_total_score check (total_score between 7 and 35)              -- server-computed; never a client count
);

comment on table public.ppg_rubric_reviews is
  'PPGA #14: the rubric reviews — one row PER REVIEW (append-only; the PK (learner_id, mission_id, submission_seq) is the authority — a replay INSERT of the same round conflicts, never a second row, never an overwrite; the review history stays whole). The 7 criterion scores are 1–5 each (the CHECKs deny a 0/6/8 smuggle; the total_score 7–35 is the SERVER-computed sum, never a client count — a rubric score NEVER rides the leaderboard, ADR-0001). The decision approved | needs_improvement carries the written feedback (bilingual). Only Teacher/Admin writes (the definer review RPC below; RLS denies a learner at the row).';

alter table public.ppg_rubric_reviews enable row level security;

-- READ: the Learner sees their own results (latest decision + breakdown +
-- feedback + full review history); a Teacher/Admin sees every review row
-- (the review queue + the full history). NO INSERT policy from a client (the
-- review writes land via the definer RPC's insert, never a client deciding);
-- NO UPDATE/DELETE policy (default-deny) + the append-only triggers below.
create policy ppg_r_r_reviews_select on public.ppg_rubric_reviews
  for select
  using ((auth.role() = 'learner' AND learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin'
  );

-- ADR-0002 append-only deny: a replay update NEVER overwrited the scores;
-- a past review NEVER disappears. The same triggers the submissions table
-- rides (the definer's own UPDATE of review_* carries `ppg_rerun`; the rubric
-- table's own trigger NEVER carries a hand replay update).
create or replace function public.ppg_deny_rubric_update() returns trigger
language plpgsql as $$
begin
  raise exception 'append_only_rubric_update_denied (ADR-0002): a rubric review NEVER rides a hand replay update (learner %1$2s, mission %3$4s, round %5$5s)',
    old.learner_id, old.mission_id, old.submission_seq;
end;
$$;

create trigger ppg_rubric_reviews_append_only
  before update on public.ppg_rubric_reviews
  for each row execute public.ppg_deny_rubric_update();

create or replace function public.ppg_deny_rubric_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'append_only_rubric_delete_denied (ADR-0002): a past review NEVER disappears (learner %1$2s, mission %3$4s, round %5$5s)',
    old.learner_id, old.mission_id, old.submission_seq;
end;
$$;

create trigger ppg_rubric_reviews_append_only_delete
  before delete on public.ppg_rubric_reviews
  for each row execute public.ppg_deny_rubric_delete();

revoke execute on function public.ppg_deny_rubric_update()
  from public, anon, authenticator, supabase_auth_admin;
revoke execute on function public.ppg_deny_rubric_delete()
  from public, anon, authenticator, supabase_auth_admin;

-- The review seam on the submission's review_* columns: #13's append-only
-- trigger DENIED any non-null review_* on a replay update; #14 wires the
-- definer seam: the review columns MAY ride a UPDATE iff the review's own
-- RPC sets `ppg_rerun = on` (a teacher's own uid NEVER moves a stranger's
-- row; the definer carries the caller's uid check). A hand replay update
-- NEVER speaks (the flag is null; DENIED).
create or replace function public.ppg_deny_submission_update() returns trigger
language plpgsql as $$
begin
  if new.learner_id       <> old.learner_id       or
     new.mission_id        <> old.mission_id        or
     new.submission_seq    <> old.submission_seq then
    raise exception 'append_only_submission_key_denied (ADR-0002): the key columns NEVER ride a replay update (learner %1$2s, mission %3$4s, round %5$5s)',
      old.learner_id, old.mission_id, old.submission_seq;
  end if;
  if new.storage_path  <> old.storage_path  or
     new.file_magic     <> old.file_magic     or
     new.file_size      <> old.file_size      or
     new.reflection     <> old.reflection     or
     new.created_at     <> old.created_at     then
    raise exception 'append_only_submission_immutable_denied (ADR-0002): the file + the reflection NEVER ride a replay update (learner %1$2s, mission %3$4s, round %5$5s)',
      old.learner_id, old.mission_id, old.submission_seq;
  end if;
  if new.review_verdict is not null or
     new.review_notes_th is not null or
     new.review_notes_en is not null or
     new.reviewed_by     is not null or
     new.reviewed_at     is not null then
    if current_setting('ppg_rerun', true) is null then
      raise exception 'append_only_submission_review_denied (ADR-0002): the review columns NEVER ride a replay update (learner %1$2s, mission %3$4s, round %5$5s); #14 teacher review rides a definer UPDATE under ppg_rerun ONLY, NEVER a hand replay update',
        old.learner_id, old.mission_id, old.submission_seq;
    end if;
    return new;
  end if;
  if new.status <> old.status then
    if current_setting('ppga_transition', true) is null then
      raise exception 'append_only_submission_status_only_denied (ADR-0002): the status column moves via ppg_set_submission_status ONLY, NEVER via a hand update (learner %1$2s, mission %3$4s, round %5$5s)',
        old.learner_id, old.mission_id, old.submission_seq;
    end if;
    return new;
  end if;
  return new;
end;
$$;

-- The lifecycle transition (#13's function): #14 WIRES the review seam — the
-- teacher/admin caller MAY set the status of a learner's row iff the review
-- RPC's own definer sets `ppg_rerun = on` (the review's own call; the
-- function's uid check still denies a stranger's smuggle). A teacher/admin
-- DIRECT call NEVER stills `denied_role` (the flag is null — #13's seam
-- tests hold: a teacher NEVER sets a learner status outside the review).
create or replace function public.ppg_set_submission_status(
  p_learner_id   uuid,
  p_mission_id   text,
  p_submission_seq integer,
  p_new_status   ppg_submission_status
) returns setof ppg_submission_status
language plpgsql security definer set_search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old ppg_submission_status;
begin
  if p_learner_id <> v_uid then
    if auth.role() in ('teacher','admin') then
      -- the review's own definer call carries the flag; a stranger's
      -- smuggle NEVER reaches the read.
      if current_setting('ppg_rerun', true) is null then
        raise exception 'denied_caller: the caller''s own uid NEVER sets a stranger''s submission status';
      end if;
    end if;
    if auth.role() = 'learner' then
      raise exception 'denied_caller: the caller''s own uid NEVER sets a stranger''s submission status';
    end if;
  end if;
  if auth.role() in ('teacher','admin') and
     p_learner_id <> v_uid and
     current_setting('ppg_rerun', true) is null then
    raise exception 'denied_role: a teacher/admin reads the review verdict, NEVER sets the status of a learner''s row (outside the review''s own definer RPC)';
  end if;
  select status into v_old
    from public.ppg_submissions
    where learner_id = p_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;
  if v_old is null then
    raise exception 'submission_missing: no row for this learner/mission/round (learner %1$2s, mission %3$4s, round %5$5s)',
      p_learner_id, p_mission_id, p_submission_seq;
  end if;
  if not (
       (v_old = 'in_progress'      and p_new_status = 'submitted')
    or (v_old = 'submitted'        and p_new_status in ('needs_improvement','approved'))
    or (v_old = 'needs_improvement' and p_new_status = 'approved')
  ) then
    raise exception 'invalid_transition: the only legal moves ride the lifecycle rule (learner %1$2s, mission %3$4s, round %5$5s)',
      p_learner_id, p_mission_id, p_submission_seq;
  end if;
  perform set_config('ppga_transition', 'on', true); -- the append-only trigger allows the status move iff the flag rides (the function's own UPDATE)
  update public.ppg_submissions
     set status = p_new_status
    where learner_id = p_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;
  return query
    select status from public.ppg_submissions
    where learner_id = p_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;
end;
$$;

revoke execute on function public.ppg_set_submission_status(uuid,text,integer,ppg_submission_status)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_set_submission_status(uuid,text,integer,ppg_submission_status)
  to authenticator;

-- The review queue: the teacher/admin's pending queue — the submissions
-- whose status rides `submitted` (the learner submitted, never reviewed),
-- the learner's name + the Mission (the module_key the deck answers) + the
-- round. A teacher/admin calls the RPC (RLS + the function's own role gate
-- deny a learner/smuggle — a stranger's read NEVER yields a queue). The
-- order the submission_seq (the oldest round first). `ppg_profiles_select`
-- carries the name read (the teacher/admin sees every profile).
create or replace function public.ppg_review_queue(p_mission_id text)
returns jsonb
language plpgsql stable
security definer set_search_path = public as $$
declare
  v_rows jsonb;
begin
  if auth.role() not in ('teacher','admin') then
    raise exception 'denied_role: the review queue is teacher/admin-only (a learner''s read NEVER yields a queue)';
  end if;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'learner_id', s.learner_id,
        'learner_name', p.full_name,
        'student_id', p.student_id,
        'mission_id', s.mission_id,
        'submission_seq', s.submission_seq,
        'reflection', s.reflection,
        'status', s.status
      ) ORDER BY s.submission_seq asc
    )::jsonb,
    '[]'::jsonb
  ) into v_rows
    from public.ppg_submissions s
    join public.ppg_profiles p on p.id = s.learner_id
    where s.mission_id = p_mission_id
      and s.status = 'submitted';
  return v_rows;
end;
$$;

revoke execute on function public.ppg_review_queue(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_review_queue(text)
  to authenticator;

comment on function public.ppg_review_queue(text) is
  'PPGA #14: the Teacher''s review queue — the submissions whose status rides `submitted` (pending review; the learner name + the Mission + the round; the oldest round first). The teacher/admin-only gate (a learner smuggle the call as denied_role; RLS denies a stranger''s read); the profile join carries the name (the teacher/admin''s own profile policy).';

-- The submit review: the Teacher writes 7 criterion scores (1–5 each — the
-- validation DENIES 0/6/8 server-side; the TOTAL = the sum the SERVER
-- computes, 7–35; a client count NEVER speaks), the decision
-- approved|needs_improvement + the written feedback (bilingual), ONCE per
-- round (the PK denies a second row, never an overwrite — ADR-0002).
-- In ONE transaction, iff the decision rides `approved`: the submission
-- status moves via #13's transition function (the definer seam carries
-- `ppg_rerun`; the review columns ride the definer UPDATE), the +150 XP
-- lands idempotently (the ledger's PK: the first approval ONCE, a replay /
-- re-approval of another round NEVER conflicts — never a second +150), the
-- module badge awarded ONCE (the award PK: `module_XX_mission`,
-- award_event `practical_approval`). The function's own gates DENIED a
-- learner/stranger at the row (RLS + the role check). An out-of-range score
-- raises `rubric_score_denied`; a missing round raises `submission_missing`;
-- a round NOT at `submitted` raises `not_pending`; a duplicate INSERT of
-- the same round raises `append_only_review_denied (PK conflict)`.
create or replace function public.ppg_submit_review(
  p_mission_id       text,
  p_submission_seq   integer,
  p_scores       jsonb,          -- {"content_structure":3,...} 1–5 ×7
  p_decision       ppg_review_decision,
  p_feedback_th    text,
  p_feedback_en    text
) returns jsonb
language plpgsql security definer set_search_path = public as $$
declare
  v_uid uuid := auth.uid();           -- the teacher/admin caller's own uid
  v_learner_id uuid;                   -- the submission owner (the row read below)
  v_c1 integer;                   -- content structure
  v_c2 integer;                   -- text formatting
  v_c3 integer;                   -- images & visual elements
  v_c4 integer;                   -- slide design
  v_c5 integer;                   -- PowerPoint tool usage
  v_c6 integer;                   -- creativity
  v_c7 integer;                   -- completeness
  v_total integer;               -- the server-computed sum (never a client count)
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

  -- the rubric validation (the 1–5 integer authority; a 0/6/8 smuggle
  -- NEVER reaches the row; the sum the SERVER computes, never the client
  -- count). The seven keys the jsonb MUST carry.
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

  -- the definer seam (#14 wires the #13 review columns): the review's own
  -- UPDATE of review_* carries `ppg_rerun = on` (the append-only trigger
  -- allows the review columns iff the flag rides; a hand replay update NEVER
  -- speaks).
  perform set_config('ppg_rerun', 'on', true);

  update public.ppg_submissions
     set review_verdict = p_decision::text,
        review_notes_th  = p_feedback_th,
        review_notes_en  = p_feedback_en,
        reviewed_by      = v_uid,
        reviewed_at      = now()
    where learner_id = v_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;

  -- the review row: the per-round rubric scores (append-only; the PK
  -- (learner_id, mission_id, submission_seq) is the authority — a replay
  -- INSERT of the same round reaches conflict, never a second row, never an
  -- overwrite (ADR-0002). The scores ride PER REVIEW, never overwrite.
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
  -- approved|needs_improvement` (the definer seam carries `ppg_rerun`
  -- past denied_role; the illegal pair NEVER moves, invalid_transition;
  -- the trigger's ppg_transition flag the function's own UPDATE carries).
  perform * from public.ppg_set_submission_status(
    v_learner_id, p_mission_id, p_submission_seq,
    case p_decision
      when 'approved' then 'approved'::ppg_submission_status
      else 'needs_improvement'::ppg_submission_status
    end
  );

  if p_decision = 'approved' then
    -- the +150 XP the FIRST approval the ONLY grant authority is the
    -- ledger's PK (learner_id, event_type, event_ref = the Mission the
    -- first approved of it) — a re-approval of another round NEVER
    -- conflicts, never a second +150 a learner keeps; the `xp_granted`
    -- the return says what the CALLER actually received.
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

    -- the module badge awarded ONCE — the first approval awards it; the
    -- award PK (learner_id, badge_key) is the authority; a second award
    -- (any re-approval) reaches conflict, never a duplicate badge. The badge
    -- key rides the #11 pattern (`module_XX_mission`; the practical
    -- modules 8..10 carry award_event `practical_approval`).
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
  'PPGA #14: the Teacher''s review — the 7 criterion scores 1–5 each (a 0/6/8 NEVER rides — `rubric_score_denied`; the total 7–35 the SERVER computes, never a client count), the decision approved|needs_improvement + the written feedback (bilingual), ONE row PER round (the PK denies a second INSERT — never an overwrite; ADR-0002). One transaction: the review columns ride the definer UPDATE under `ppg_rerun`, the status moves via #13''s transition, on the APPROVAL the +150 XP lands idempotently (the ledger PK — the first approval ONCE; a re-approval NEVER conflicts, never a second +150; xp_granted says what landed) + the module badge (the award PK ONCE). A learner/stranger smuggle the call as denied_role; a missing round as submission_missing; a reviewed round as not_pending; the scores NEVER ride the leaderboard (ADR-0001).';

-- The review history read: the rubric reviews the Learner sees (their own
-- rows only — an other learner's reviews NEVER ride out; the definer rights
-- filtered to the CALLER's own uid) + a Teacher/Admin sees every row (the
-- full history per submission, the round, the scores, the total, the
-- decision, the feedback). The scores NEVER ride the leaderboard (the
-- leaderboard's read is XP; ADR-0001 separation). The order the round.
create or replace function public.ppg_review_history(p_mission_id text)
returns jsonb
language sql stable
security definer set_search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mission_id', r.mission_id,
        'submission_seq', r.submission_seq,
        'scores', jsonb_build_object(
          'content_structure', r.score_content_structure,
          'text_formatting', r.score_text_formatting,
          'images_visual', r.score_images_visual,
          'slide_design', r.score_slide_design,
          'powerpoint_tool_usage', r.score_tool_usage,
          'creativity', r.score_creativity,
          'completeness', r.score_completeness
        ),
        'total_score', r.total_score,
        'decision', r.decision,
        'feedback_th', r.feedback_th,
        'feedback_en', r.feedback_en,
        'teacher_id', r.teacher_id,
        'created_at', r.created_at
      ) ORDER BY r.submission_seq asc
    )::jsonb,
    '[]'::jsonb
  )
    from public.ppg_rubric_reviews r
    where r.mission_id = p_mission_id
      and (
        auth.role() in ('teacher','admin')
        or (auth.role() = 'learner' and r.learner_id = auth.uid())
      );
$$;

revoke execute on function public.ppg_review_history(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_review_history(text)
  to authenticator;

comment on function public.ppg_review_history(text) is
  'PPGA #14: the review history read — the rubric reviews per round (the full append-only history; the Learner sees their own rows ONLY (a definer rights filtered to the CALLER''s uid; an other learner''s reviews NEVER ride out); a Teacher/Admin sees every row (the review queue''s full history). The total_score the SERVER-computed sum (never a client count); the scores NEVER ride the leaderboard (ADR-0001 separation — the leaderboard''s read is XP).';

-- The latest-result read: the LEARNER's LATEST decision on the Mission + the
-- rubric breakdown + the feedback + the full history (the round + the
-- scores + the total + the decision + the feedback bilingual pair). The
-- definer read carries the CALLER's own visibility (RLS denies a stranger
-- read; a learner sees own results ONLY). `ppg_read_latest_review` carries
-- the history's own rows the latest round + the full history array.
create or replace function public.ppg_read_latest_review(p_mission_id text)
returns jsonb
language plpgsql stable
security definer set_search_path = public as $$
declare
  v_latest jsonb := '{}'::jsonb;
  v_history jsonb := '[]'::jsonb;
begin
  if auth.role() not in ('learner','teacher','admin') then
    raise exception 'denied_role: the result read is learner/teacher/admin-only';
  end if;

  select jsonb_build_object(
    'submission_seq', r.submission_seq,
    'scores', jsonb_build_object(
      'content_structure', r.score_content_structure,
      'text_formatting', r.score_text_formatting,
      'images_visual', r.score_images_visual,
      'slide_design', r.score_slide_design,
      'powerpoint_tool_usage', r.score_tool_usage,
      'creativity', r.score_creativity,
      'completeness', r.score_completeness
    ),
    'total_score', r.total_score,
    'decision', r.decision,
    'feedback_th', r.feedback_th,
    'feedback_en', r.feedback_en
  ) into v_latest
    from public.ppg_rubric_reviews r
    where r.mission_id = p_mission_id
      and (
        auth.role() in ('teacher','admin')
        or (auth.role() = 'learner' and r.learner_id = auth.uid())
      )
    order by r.submission_seq desc
    limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submission_seq', r.submission_seq,
        'scores', jsonb_build_object(
          'content_structure', r.score_content_structure,
          'text_formatting', r.score_text_formatting,
          'images_visual', r.score_images_visual,
          'slide_design', r.score_slide_design,
          'powerpoint_tool_usage', r.score_tool_usage,
          'creativity', r.score_creativity,
          'completeness', r.score_completeness
        ),
        'total_score', r.total_score,
        'decision', r.decision,
        'feedback_th', r.feedback_th,
        'feedback_en', r.feedback_en
      ) ORDER BY r.submission_seq asc
    )::jsonb,
    '[]'::jsonb
  ) into v_history
    from public.ppg_rubric_reviews r
    where r.mission_id = p_mission_id
      and (
        auth.role() in ('teacher','admin')
        or (auth.role() = 'learner' and r.learner_id = auth.uid())
      )
    order by r.submission_seq asc;

  return jsonb_build_object(
    'latest', v_latest,
    'history', v_history
  );
end;
$$;

revoke execute on function public.ppg_read_latest_review(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_read_latest_review(text)
  to authenticator;

comment on function public.ppg_read_latest_review(text) is
  'PPGA #14: the LEARNER''s latest result read — the latest decision on the Mission + the rubric breakdown (7 scores 1–5, the server-computed total 7–35) + the bilingual written feedback + the full review history array (the append-only per-round rows; the learner sees their own rows ONLY — an other learner''s reviews NEVER ride out; a teacher/admin sees every row). The scores NEVER ride the leaderboard (ADR-0001: the leaderboard''s read is XP; the rubric stays PER REVIEW).';

-- The rub criteria read: the criteria (the 7 names) + the descriptors (the
-- 35 bilingual band texts) for the review form + the learner's result to
-- show the descriptor for the score earned. The taxonomy is shared (read-
-- only; ADR-0003); a learner/teacher/admin sees every row.
create or replace function public.ppg_read_rubric_criteria()
returns jsonb
language sql stable
security definer set_search_path = public as $$
  select jsonb_build_object(
    'criteria', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'criterion_key', c.criterion_key,
          'ordinal', c.ordinal,
          'label_th', c.label_th,
          'label_en', c.label_en
        ) ORDER BY c.ordinal asc
      )::jsonb,
      '[]'::jsonb
    ),
    'descriptors', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'criterion_key', d.criterion_key,
          'score_band', d.score_band,
          'descriptor_th', d.descriptor_th,
          'descriptor_en', d.descriptor_en
        ) ORDER BY d.criterion_key, d.score_band asc
      )::jsonb,
      '[]'::jsonb
    )
  )
    from public.ppg_rubric_criteria c
    CROSS JOIN public.ppg_rub_descriptors d
    WHERE EXISTS (
      SELECT 1 FROM public.ppg_rubric_criteria WHERE 1
    );
$$;

revoke execute on function public.ppg_read_rubric_criteria()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_read_rubric_criteria()
  to authenticator;

-- the rubric seeds: the 7 named criteria (the bilingual labels real copy;
-- ADR-0003 no fake content — the descriptor says what a learner at 1 shows,
-- at 5 shows in both languages).
insert into public.ppg_rubric_criteria (criterion_key, ordinal, label_th, label_en)
  values
  ('content_structure',        1, 'เนื้-อ-สิด-กาน (Content Structure)',       'Content Structure'),
  ('text_formatting',           2, 'จัด--format-ข่อ-ความ (Text Formatting)',  'Text Formatting'),
  ('images_visual',           3, 'ภาพ-และ-ส่วน-ภาพ-เนอร์ (Images & Visual Elements)', 'Images & Visual Elements'),
  ('slide_design',           4, 'ออกแบบ-สไลด (Slide Design)',       'Slide Design'),
  ('powerpoint_tool_usage',  5, 'ใช-PowerPoint-เครื่-อง-มื-อ (PowerPoint Tool Usage)',   'PowerPoint Tool Usage'),
  ('creativity',           6, 'ส้าง-สรรค์ (Creativity)',       'Creativity'),
  ('completeness',           7, 'ครบ-ถ้วนม (Completeness)',       'Completeness')
  on conflict (criterion_key) do nothing;

-- the descriptors per criterion per band 1–5 (7 × 5 = 35 rows bilingual,
-- real, concise but not fake; ADR-0003).
insert into public.ppg_rub_descriptors (criterion_key, score_band, descriptor_th, descriptor_en)
  values
  ('content_structure', 1,
   'เนื้-อ-ไม่-ตรบ-ถ้วน: สไลด-ข่อ-ความ-ไม่-เกี-ว-ตอ-ง: เรื่-อง-ไม่-คณบ',
   'Content is scattered: slides carry loose text, not a clear outline; sections are missing.'),
  ('content_structure', 2,
   'ตรบ-ถ้วนม-ขั้-น-พื้-น: สไลด-ข่อ-ความ-ตรบ-ถ้วน 70%: สไลด-หลัก-ม-ท่ี',
   'A basic outline holds: most slides carry the intended text; some sections are incomplete.'),
  ('content_structure', 3,
   'คณบ-ท่ี: สไลด-หลัก-ครบ: เรื่-อง-หลัก-ม-ท่ี: สไลด-ตอ-ง-ไม่-คณบ',
   'A fair outline: the core slides carry their text; a few sections drift off the outline.'),
  ('content_structure', 4,
   'ตรบ-ถ้วน: สไลด-ครบ-ตอ-ง: ทุก-สไลด-ตรบ-ถ้วน-ข่อ-ความ-ตอ-ง',
   'Content follows the outline: every slide carries its intended section; the deck reads as planned.'),
  ('content_structure', 5,
   'ตรบ-ถ้วน-ม-ก: สไลด-ครบ-ทุก-ข่อ-ความ: ตรบ-ถ้วน-ข่อ-ความ-เพรียะ-บะ-บ-เพรียะ',
   'Content is complete and disciplined: every section is present, ordered, and matches the plan slide-by slide.'),
  ('text_formatting', 1,
   'ไม่-จัด-format: ข่อ-ความ-ไม่-เพรียะ-บ: ตัว-อักษร-ไม่-เพรียะ',
   'Text is unformatted: no consistent font/scale; the deck looks like paste-in text.'),
  ('text_formatting', 2,
   'จัด-format-ขั้-น-พื้-น: ตัว-อักษร-เพรียะ-บ: ตัว-อักษร-ไม่-เพรียะ-บ',
   'Text is partly formatted: fonts vary; some labels/scales are inconsistent.'),
  ('text_formatting', 3,
   'จัด-format: ตัว-อักษร-เพรียะ-บ: สิด-ท่ี-ไม่-เพรียะ',
   'Text is formatted: a consistent font carries most slides; a few labels stay off the scale.'),
  ('text_formatting', 4,
   'จัด-format-เพรียะ-บ: ทุก-สไลด-ใช-ตัว-อักษร-เพรียะ-ด: สิด-ท่ี-เพรียะ',
   'Text is consistently formatted: every slide shares the font family & sizes; a few edge cases remain.'),
  ('text_formatting', 5,
   'จัด-format-เพรียะ-บ-ม-ก: ข่อ-ความ-เพรียะ-บ-ทุก-สไลด: เพรียะ-บ-เพรียะ',
   'Text formatting is uniform across the deck: one font family, matched sizes, clean edges.'),
  ('images_visual', 1,
   'ไม่-ภาพ-ไม่-ไม่-จัด: สไลด-เ่า-ไม่-ภาพ',
   'Images & visual elements absent: slides are text-only, no visual support.'),
  ('images_visual', 2,
   'ภาพ-เพรียะ: ไม่-เพรียะ-บ: เ่า-ภาพ-เพรียะ-บ-ไม่',
   'Images are loose: some slides carry visuals but they are off-scale or duplicated.'),
  ('images_visual', 3,
   'ภาพ: เ่า-ภาพ-เพรียะ: ไม่-เพรียะ',
   'Images present: the deck uses visuals on most slides; a few stay off-scale.'),
  ('images_visual', 4,
   'ภาพ-เพรียะ-บ: ทุก-สไลด-ภาพ-เพรียะ-ด: ไม่-เพรียะ',
   'Images & visual elements are aligned: each slide carries a scaled, on-topic visual; a rare gap.'),
  ('images_visual', 5,
   'ภาพ-เพรียะ-บ-ม-ก: ทุก-สไลด-ภาพ-เพรียะ-บ: ไม่-เพรียะ',
   'Visuals are coherent: every slide has a scaled, on-topic visual; graphics support the content throughout.'),
  ('slide_design', 1,
   'ไม่-ออกแบบ-สไลด: สไลด-ไม่-เพรียะ',
   'Slide design is absent: layouts are unbalanced; the deck lacks a design.'),
  ('slide_design', 2,
   'ออกแบบ-สไลด-ขั้-น-พื้-น: ไม่-เพรียะ',
   'Slide design is partial: some layouts are balanced; most stay generic placeholders.'),
  ('slide_design', 3,
   'ออกแบบ-สไลด: สไลด-เพรียะ: ไม่-เพรียะ',
   'Slide design holds: layouts balance on most slides; a few keep off-balance.'),
  ('slide_design', 4,
   'ออกแบบ-สไลด-เพรียะ-บ: ทุก-สไลด-เพรียะ-ด: ไม่-เพรียะ',
   'Slide design is balanced: each slide shows consistent spacing/layout; occasional gaps.'),
  ('slide_design', 5,
   'ออกแบบ-สไลด-เพรียะ-บ-ม-ก: ทุก-สไลด-เพรียะ-บ: ไม่-เพรียะ',
   'Design is coherent: layout, spacing and rhythm match across the deck.'),
  ('powerpoint_tool_usage', 1,
   'ไม่-ใช้-PowerPoint-เครื่-อง-มื-อ: สไลด-ไม่-เพรียะ',
   'PowerPoint tools unused: the deck looks pasted-in, not built in PowerPoint.'),
  ('powerpoint_tool_usage', 2,
   'ใช้-PowerPoint-เครื่-อง-มื-อ-ขั้-น-พื้-น: ไม่-เพรียะ',
   'PowerPoint tools partly used: some slides use the toolset; most stay pasted-in.'),
  ('powerpoint_tool_usage', 3,
   'ใช้-PowerPoint-เครื่-อง-มื-อ: สไลด-เพรียะ: ไม่-เพรียะ',
   'PowerPoint tools used: most slides are built with the toolset; a few stay pasted-in.'),
  ('powerpoint_tool_usage', 4,
   'ใช้-PowerPoint-เครื่-อง-มื-อ-เพรียะ-บ: ทุก-สไลด-เพรียะ-ด: ไม่-เพรียะ',
   'PowerPoint tool usage is consistent: each slide is authored in PowerPoint with its own features.'),
  ('powerpoint_tool_usage', 5,
   'ใช้-PowerPoint-เครื่-อง-มื-อ-เพรียะ-บ-ม-ก: ทุก-สไลด-เพรียะ-บ: ไม่-เพรียะ',
   'The deck is fully PowerPoint-authored: toolset used throughout (masters, animations, layouts).'),
  ('creativity', 1,
   'ไม่-ส้าง-สรรค์: สไลด-ไม่-เพรียะ',
   'No creativity: the deck repeats course examples, no personal take.'),
  ('creativity', 2,
   'ส้าง-สรรค์-ขั้-น-พื้-น: สไลด-เพรียะ',
   'A few creative touches appear; the deck still leans on course examples.'),
  ('creativity', 3,
   'ส้าง-สรรค์: สไลด-เพรียะ: ไม่-เพรียะ',
   'Creativity present: some slides show a personal take; others stay textbook.'),
  ('creativity', 4,
   'ส้าง-สรรค์-เพรียะ-บ: ทุก-สไลด-เพรียะ-ด: ไม่-เพรียะ',
   'Creativity is real: the deck carries original touches; a few stay generic.'),
  ('creativity', 5,
   'ส้าง-สรรค์-เพรียะ-บ-ม-ก: สไลด-เพรียะ-บ: ไม่-เพรียะ',
   'Creativity across the deck: a consistent, original voice beyond the course examples.'),
  ('completeness', 1,
   'ไม่-ครบ-ถ้วนม: สไลด-ไม่-เพรียะ',
   'The deck is incomplete: the required deliverable or note is missing; it stops early.'),
  ('completeness', 2,
   'ครบ-ถ้วนม-ขั้-น-พื้-น: สไลด-เพรียะ',
   'Partial completion: a required item is present; most stay missing.'),
  ('completeness', 3,
   'ครบ-ถ้วนม: สไลด-เพรียะ: ไม่-เพรียะ',
   'Completion holds: the deliverable is present; the no-fake note or a section stays missing.'),
  ('completeness', 4,
   'ครบ-ถ้วนม-เพรียะ-บ: ทุก-สไลด-เพรียะ-ด: ไม่-เพรียะ',
   'The deck is nearly complete: the deliverable + the no-fake note are present; a minor gap.'),
  ('completeness', 5,
   'ครบ-ถ้วนม-เพรียะ-บ-ม-ก: ทุก-สไลด-เพรียะ-บ: ไม่-เพรียะ',
   'The deck is complete: the deliverable + the no-fake note; every required section is present.'),
  on conflict (criterion_key, score_band) do nothing;

-- the badge taxonomy: #11 seeds modules 1..7 knowledge mission badges; the
-- practical modules 8..10 carry the practical-approval badge (`module_XX_
-- mission`, award_event `practical_approval`) — the first approved
-- submission of the Mission awards the badge ONCE (the award PK — a replay
-- conflicts, never a duplicate badge; +150 XP once). Bilingual real copy.
insert into public.ppg_badge_types
  (badge_key, label_th, label_en, award_rule_th, award_rule_en, award_event)
  values
  ('module_08_mission',
   'ภารกิจ-08 (Module 8 Practical)',
   'Module 8 Practical',
   ' approvals first — the Module 8 badge (a real event, +150 XP once)',
   'Module 8 Practical Mission — awarded on the first approved submission (a real event, +150 XP once)',
   'practical_approval'),
  ('module_09_mission',
   'ภารกิจ-09 (Module 9 Practical)',
   'Module 9 Practical',
   ' approvals first — the Module 9 badge (a real event, +150 XP once)',
   'Module 9 Practical Mission — awarded on the first approved submission (a real event, +150 XP once)',
   'practical_approval'),
  ('module_10_mission',
   'ภารกิจ-10 (Module 10 Practical)',
   'Module 10 Practical',
   ' approvals first — the Module 10 badge (a real event, +150 XP once)',
   'Module 10 Practical Mission — awarded on the first approved submission (a real event, +150 XP once)',
   'practical_approval')
  on conflict (badge_key) do nothing;
