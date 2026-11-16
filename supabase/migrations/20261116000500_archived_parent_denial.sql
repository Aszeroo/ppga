-- ============================================================================
-- PPGA #88: learner-facing reads and submits deny an archived parent module.
--
-- #74 soft-archived the legacy `powerpoint-creation` course/modules, but the
-- legacy read paths still authorised on the LESSON's publication state and
-- the module unlock rule alone. A Learner could therefore type a direct URL
-- (`/course/module-01`, a legacy lesson path, a mission or practical path)
-- and read archived curriculum. This migration adds the missing parent
-- authority: a learner only reads/submits content whose parent module is
-- `publication_state = 'published'`.
--
-- Teachers and admins keep every archived row (history and research export).
-- Nothing is deleted or mutated: this migration only redefines read/submit
-- gates and their RLS policies. Active `chapter-NN` behaviour is unchanged
-- (the chapter modules are published).
--
-- The rule reads the PARENT MODULE's own publication state — the exact gate
-- #74 left out — not the parent course's `is_active` flag. The course-map
-- read keeps its own `is_active` filter for what a learner can discover.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The one shared authority: is the parent module published?
-- ----------------------------------------------------------------------------
create or replace function public.ppg_module_published(p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.ppg_modules m
     where m.module_key = p_module_key
       and m.publication_state = 'published'
  );
$$;

revoke execute on function public.ppg_module_published(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_published(text)
  to service_role, authenticated;

comment on function public.ppg_module_published(text) is
  'PPGA #88: the parent-module authority added after the #74 soft archive — a learner only reads/submits content whose parent module is publication_state = published. Teacher/admin paths bypass it; archived rows stay readable for history and export.';

-- ----------------------------------------------------------------------------
-- 2. Curriculum reads: the module detail and the lesson table policy.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_module_lessons(p_module_key text)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lesson_key', l.lesson_key,
        'module_key', l.module_key,
        'order_index', l.order_index,
        'title_th', l.title_th,
        'title_en', l.title_en,
        'what_learn_th', l.what_learn_th,
        'what_learn_en', l.what_learn_en,
        'why_th', l.why_th,
        'why_en', l.why_en,
        'body_th', l.body_th,
        'body_en', l.body_en,
        'what_next_th', l.what_next_th,
        'what_next_en', l.what_next_en,
        'publication_state', l.publication_state
      ) ORDER BY l.order_index
    )::jsonb,
    '[]'::jsonb
  )
  FROM public.ppg_lessons l
  JOIN public.ppg_modules m ON l.module_key = m.module_key
  WHERE l.module_key = p_module_key
    AND (
      auth.role() IN ('teacher', 'admin')
      OR (
        l.publication_state = 'published'
        AND public.ppg_module_published(m.module_key)
        AND public.ppg_learner_gated(auth.uid())
        AND public.ppg_module_unlocked(auth.uid(), m.module_key)
      )
    );
$$;

revoke execute on function public.ppg_module_lessons(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_lessons(text)
  to service_role, authenticated;

comment on function public.ppg_module_lessons(text) is
  'PPGA #9, hardened by #88: the module detail — lessons a SEE-ABLE module shows (published lesson + published parent module + gate + module open for a learner; all incl draft/arched for teacher/admin); a locked or archived module returns `[]` server-side, never a hidden UI.';

drop policy if exists ppg_lessons_select on public.ppg_lessons;
create policy ppg_lessons_select on public.ppg_lessons
  for select
  using (
    (auth.role() = 'learner'
     AND public.ppg_learner_gated(auth.uid())
     AND publication_state = 'published'
     AND public.ppg_module_published(module_key)
     AND public.ppg_module_unlocked(auth.uid(), module_key))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 3. Self-Check read/submit authority. `ppg_check_self_check` and
--    `ppg_self_check_questions` both ride this function, so one fix closes
--    the read, the answer-key RPC and the submit path.
-- ----------------------------------------------------------------------------
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
      and public.ppg_module_published(l.module_key)
      and public.ppg_module_unlocked(auth.uid(), l.module_key)
      and public.ppg_learner_gated(auth.uid())
  );
$$;

revoke execute on function public.ppg_self_check_visible(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_self_check_visible(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_self_check_visible(uuid, text) is
  'PPGA #10, hardened by #88: the Lesson''s own visibility the questions and the Self-Check submit ride (published lesson + published parent module + gate #8 + the module OPEN) — a locked/draft/arched Lesson is INVISIBLE server-side, never a hidden UI.';

-- ----------------------------------------------------------------------------
-- 4. CAI lesson player reads (steps + mini-check grading). Both authorise on
--    the lesson only, so they get the same parent-module gate.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_lesson_steps(p_lesson_key text)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lesson_key', s.lesson_key,
        'order_index', s.order_index,
        'kind', s.kind,
        'body_th', s.body_th,
        'body_en', s.body_en,
        'check',
          case when s.kind = 'check' then jsonb_build_object(
            'prompt_th', s.check_prompt_th,
            'prompt_en', s.check_prompt_en,
            'options', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'option_key', o.option_key,
                    'option_th', o.option_th,
                    'option_en', o.option_en
                  ) order by o.option_key
                )
                from public.ppg_lesson_step_options o
                where o.lesson_key = s.lesson_key
                  and o.step_order_index = s.order_index
              ),
              '[]'::jsonb
            )
          )
          else null
          end
      ) order by s.order_index
    )::jsonb,
    '[]'::jsonb
  )
  from public.ppg_lesson_steps s
  join public.ppg_lessons l on l.lesson_key = s.lesson_key
  where s.lesson_key = p_lesson_key
    and (
      auth.role() in ('teacher', 'admin')
      or (
        l.publication_state = 'published'
        and public.ppg_module_published(l.module_key)
        and public.ppg_learner_gated(auth.uid())
        and public.ppg_module_unlocked(auth.uid(), l.module_key)
      )
    );
$$;

revoke execute on function public.ppg_lesson_steps(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_lesson_steps(text)
  to service_role, authenticated;

comment on function public.ppg_lesson_steps(text) is
  'PPGA #75, hardened by #88: the steps a SEE-ABLE Lesson shows (published lesson + published parent module + gate + module open for a learner; all for teacher/admin). The jsonb never carries check_answer_key or check_explanation_*; options only.';

create or replace function public.ppg_grade_mini_check(
  p_lesson_key text,
  p_order_index integer,
  p_option_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_step record;
begin
  select s.check_answer_key, s.check_explanation_th, s.check_explanation_en
    into v_step
    from public.ppg_lesson_steps s
    join public.ppg_lessons l on l.lesson_key = s.lesson_key
   where s.lesson_key = p_lesson_key
     and s.order_index = p_order_index
     and s.kind = 'check'
     and (
       auth.role() in ('teacher', 'admin')
       or (
         l.publication_state = 'published'
         and public.ppg_module_published(l.module_key)
         and public.ppg_learner_gated(auth.uid())
         and public.ppg_module_unlocked(auth.uid(), l.module_key)
       )
     );

  if not found then
    raise exception 'check_not_found: no visible mini-check for lesson %, step %', p_lesson_key, p_order_index;
  end if;

  if not exists (
    select 1
      from public.ppg_lesson_step_options o
     where o.lesson_key = p_lesson_key
       and o.step_order_index = p_order_index
       and o.option_key = p_option_key
  ) then
    raise exception 'option_not_found: option % is not part of lesson %, step %', p_option_key, p_lesson_key, p_order_index;
  end if;

  -- Correctness + the explanation only. The answer key stays server-side.
  return jsonb_build_object(
    'correct', p_option_key = v_step.check_answer_key,
    'explanation_th', v_step.check_explanation_th,
    'explanation_en', v_step.check_explanation_en
  );
end;
$$;

revoke execute on function public.ppg_grade_mini_check(text, integer, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_grade_mini_check(text, integer, text)
  to service_role, authenticated;

comment on function public.ppg_grade_mini_check(text, integer, text) is
  'PPGA #75, hardened by #88: formative mini-check grading. Compares the chosen option server-side and returns correctness + explanation only — never the answer key, never a write, never XP or an unlock; an archived parent module yields check_not_found.';

-- ----------------------------------------------------------------------------
-- 5. Knowledge Mission history read. The mission read/submit already ride
--    `ppg_knowledge_mission_visible` (which checks the parent module), but
--    the caller's own attempt history was unfiltered.
-- ----------------------------------------------------------------------------
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
    AND auth.role() = 'learner'
    AND public.ppg_module_published(a.module_key);
$$;

revoke execute on function public.ppg_mission_history(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_mission_history(text)
  to service_role, authenticated;

comment on function public.ppg_mission_history(text) is
  'PPGA #11, hardened by #88: the Mission attempt history the attempt page shows — the CALLER''s own rows only, and only while the parent module is published. An archived parent returns `[]`; teacher/admin read history through their own surfaces.';

drop policy if exists ppg_mission_attempts_select on public.ppg_mission_attempts;
create policy ppg_mission_attempts_select on public.ppg_mission_attempts
  for select
  using ((auth.role() = 'learner'
          AND learner_id = auth.uid()
          AND public.ppg_module_published(module_key))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin'
  );

drop policy if exists ppg_self_check_events_select on public.ppg_self_check_events;
create policy ppg_self_check_events_select on public.ppg_self_check_events
  for select
  using ((auth.role() = 'learner'
          AND learner_id = auth.uid()
          AND public.ppg_module_published((
            select l.module_key
              from public.ppg_lessons l
             where l.lesson_key = ppg_self_check_events.lesson_key
          )))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 6. Practical Mission reads and submits. All practical modules belong to
--    the archived legacy spine, so a learner direct URL must arrive empty
--    and every write path must reject. Teacher/admin keep the rows.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_read_practical(p_module_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return to_jsonb(p)
    from public.ppg_practical_missions p
    where p.module_key = p_module_key
      and (
        auth.role() in ('teacher','admin')
        or (
          auth.role() = 'learner'
          and public.ppg_learner_gated(auth.uid())
          and public.ppg_module_published(p.module_key)
        )
      );
end;
$$;

revoke execute on function public.ppg_read_practical(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_read_practical(text)
  to authenticator;

comment on function public.ppg_read_practical(text) is
  'PPGA #13, hardened by #88: the practical Mission row a SEE-ABLE parent module shows (gate + published parent module for a learner; all for teacher/admin). An archived parent returns NULL — the page shows the not-visible state, never a hidden form.';

create or replace function public.ppg_insert_submission(
  p_learner_id uuid,
  p_mission_id text,
  p_submission_seq integer,
  p_storage_path text,
  p_file_magic text,
  p_file_size bigint,
  p_reflection text
) returns setof ppg_submission_status
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'learner' or auth.uid() <> p_learner_id then
    raise exception 'denied_caller: the caller''s own uid NEVER inserts a stranger''s submission';
  end if;
  if not public.ppg_module_published(p_mission_id) then
    raise exception 'mission_not_visible: the parent module % is archived/draft server-side — no submission runs on it (never a hidden UI)', p_mission_id;
  end if;
  if p_file_magic not in ('pptx','ppt') then
    raise exception 'magic_byte_rejected: the file signature NEVER is .pptx/.ppt (round %1$2s)',
      p_submission_seq;
  end if;
  if p_file_size < 1 or p_file_size > 25000000 then
    raise exception 'submission_size_denied: 25 MB max, never an oversize smuggle (round %1$2s)',
      p_submission_seq;
  end if;
  if p_storage_path not like 'submissions/' || p_learner_id || '/' || p_mission_id || '/' || p_submission_seq then
    raise exception 'path_scheme_denied: submissions/{learnerId}/{missionId}/{submissionId} ONLY (round %1$2s)',
      p_submission_seq;
  end if;
  insert into public.ppg_submissions (learner_id, mission_id, submission_seq,
    storage_path, file_magic, file_size, reflection, status)
    values (p_learner_id, p_mission_id, p_submission_seq,
      p_storage_path, p_file_magic, p_file_size, p_reflection, 'in_progress');
  return query
    select status from public.ppg_submissions
    where learner_id = p_learner_id
      and mission_id = p_mission_id
      and submission_seq = p_submission_seq;
end;
$$;

revoke execute on function public.ppg_insert_submission(uuid,text,integer,text,text,bigint,text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_insert_submission(uuid,text,integer,text,text,bigint,text)
  to authenticator;

create or replace function public.ppg_submission_history(p_module_key text)
returns setof public.ppg_submissions
language plpgsql security definer set search_path = public as $$
begin
  return query
    select s.* from public.ppg_submissions s
    where s.mission_id = p_module_key
      and (
        auth.role() in ('teacher','admin')
        or (
          auth.role() = 'learner'
          and s.learner_id = auth.uid()
          and public.ppg_module_published(s.mission_id)
        )
      )
    order by s.submission_seq asc;
end;
$$;

revoke execute on function public.ppg_submission_history(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_submission_history(text)
  to authenticator;

create or replace function public.ppg_signed_url_for(
  p_module_key text,
  p_submission_seq integer,
  p_expiry_secs integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  select s.storage_path into v_path
    from public.ppg_submissions s
    where s.mission_id = p_module_key
      and s.submission_seq = p_submission_seq
      and (
        auth.role() in ('teacher','admin')
        or (
          auth.role() = 'learner'
          and s.learner_id = auth.uid()
          and public.ppg_module_published(s.mission_id)
        )
      );
  if v_path is null then
    raise exception 'denied_or_missing: no own submission row for this learner/round (round %1$2s)',
      p_submission_seq;
  end if;
  return jsonb_build_object(
    'url', format('https://bucket.invalid/objects/%s?token=%s&expires=%s',
      v_path, auth.role()::text || auth.uid()::text, coalesce(p_expiry_secs, 60)),
    'expires_in', coalesce(p_expiry_secs, 60)
  );
end;
$$;

revoke execute on function public.ppg_signed_url_for(text,integer,integer)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_signed_url_for(text,integer,integer)
  to authenticator;

drop policy if exists ppg_submissions_select on public.ppg_submissions;
create policy ppg_submissions_select on public.ppg_submissions
  for select
  using ((auth.role() = 'learner'
          AND learner_id = auth.uid()
          AND public.ppg_module_published(mission_id))
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin'
  );

create or replace function public.ppg_set_submission_status(
  p_learner_id   uuid,
  p_mission_id   text,
  p_submission_seq integer,
  p_new_status   ppg_submission_status
) returns setof ppg_submission_status
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old ppg_submission_status;
begin
  if auth.role() in ('teacher','admin') and
     p_learner_id <> v_uid and
     current_setting('ppg.rerun', true) is null then
    raise exception 'denied_role: a teacher/admin reads the review verdict, NEVER sets the status of a learner''s row (outside the review''s own definer RPC)';
  end if;
  if p_learner_id <> v_uid then
    if auth.role() = 'learner' then
      raise exception 'denied_caller: the caller''s own uid NEVER sets a stranger''s submission status';
    end if;
    -- the teacher/admin speaks past here ONLY under the review's own
    -- definer flag (ppg.rerun); a stranger's smuggle NEVER reaches the read.
  end if;
  if auth.role() = 'learner' and not public.ppg_module_published(p_mission_id) then
    raise exception 'mission_not_visible: the parent module % is archived/draft server-side — no submission runs on it (never a hidden UI)', p_mission_id;
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
  perform set_config('ppg.transition', 'on', true);
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

comment on function public.ppg_set_submission_status(uuid,text,integer,ppg_submission_status) is
  'PPGA #14, hardened by #88: the lifecycle moves a learner own row only while the parent module is published; an archived parent reaches mission_not_visible. The teacher/admin review path (ppg.rerun) keeps its authority.';
