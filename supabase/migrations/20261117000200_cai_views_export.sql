-- ============================================================================
-- PPGA #86: the research export follows the CAI assessment model.
--
-- The CAI course (PRD #72, ADR-0005) measures:
--   * a global 50-item research Pre-Test paired with the 50-item Final Test
--     (both instrument versions preserved verbatim),
--   * each of the nine chapters' parallel pre/post forms (scores + attempts),
--   * one Knowledge Mission per chapter (attempt history + completion),
--   * the satisfaction survey.
--
-- Practical Missions, file submissions and rubric scoring are LEGACY (#85):
-- their data stays readable for cohort history, but the extract marks those
-- columns with a `legacy_` prefix and adds an explicit `legacy_practical_fields`
-- marker column. Nothing is silently dropped.
--
-- The RPC keeps #16's shape: teacher/admin gate, csv|xlsx|sql format gate, the
-- one-row-per-participant extract, exactly one audit event on the same call,
-- and the restorable SQL dump. PPGA #86 only widens the extract.
-- ============================================================================

create or replace function public.ppg_research_export(p_format text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
  v_columns jsonb := '[
    "student_id", "full_name",
    "pretest_instrument_version", "pretest_language", "pretest_score", "pretest_submitted_at",
    "posttest_instrument_version", "posttest_language", "posttest_score",
    "posttest_best_score", "posttest_attempts", "posttest_submitted_at",
    "chapter_test_results", "mission_results",
    "satisfaction_instrument_version", "satisfaction_language",
    "satisfaction_answers", "satisfaction_submitted_at",
    "legacy_practical_fields",
    "legacy_rubric_review_count", "legacy_rubric_latest_mission",
    "legacy_rubric_latest_round", "legacy_rubric_latest_total",
    "legacy_rubric_latest_decision"
  ]'::jsonb;
  v_count integer;
  v_dump text;
begin
  if coalesce(auth.role(), '') not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_research_export is teacher/admin-only (the JWT role claim is the authority)';
  end if;

  if p_format is null or p_format not in ('csv', 'xlsx', 'sql') then
    raise exception 'export_format_denied: p_format must be csv | xlsx | sql (the PDF report is issue #17)';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', p.student_id,
        'full_name', p.full_name,
        'pretest_instrument_version', pre.instrument_version,
        'pretest_language', pre.language,
        'pretest_score', pre.score,
        'pretest_submitted_at',
          to_char(pre.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        -- The Final Test: ppg_posttest_responses is attempt 1 (the research
        -- measure and its version); the retry stream only adds attempts.
        'posttest_instrument_version', post.instrument_version,
        'posttest_language', post.language,
        'posttest_score', post.score,
        'posttest_best_score', ft.best_score,
        'posttest_attempts', coalesce(ft.attempts, 0),
        'posttest_submitted_at',
          to_char(post.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        -- The per-chapter parallel forms: one entry per chapter/phase with
        -- attempts, first/best/last scores and the item count.
        'chapter_test_results', coalesce(ch.results, '[]'::jsonb),
        -- Mission completion + append-only attempt history.
        'mission_results', jsonb_build_object(
          'completed_module_keys', coalesce(mc.completed, '[]'::jsonb),
          'attempts', coalesce(ma.attempts, '[]'::jsonb)
        ),
        'satisfaction_instrument_version', sur.instrument_version,
        'satisfaction_language', sur.language,
        'satisfaction_answers', sur.answers,
        'satisfaction_submitted_at',
          to_char(sur.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        -- The retired worksheet/rubric columns are kept, but clearly marked.
        'legacy_practical_fields',
          'legacy: practical worksheets + rubric scoring retired by the CAI course (ADR-0005); values preserved for cohort history',
        'legacy_rubric_review_count', coalesce(rub.review_count, 0),
        'legacy_rubric_latest_mission', rub.mission_id,
        'legacy_rubric_latest_round', rub.submission_seq,
        'legacy_rubric_latest_total', rub.total_score,
        'legacy_rubric_latest_decision', rub.decision
      )
      order by p.student_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.ppg_profiles p
  left join public.ppg_pretest_responses pre on pre.learner_id = p.id
  left join public.ppg_posttest_responses post on post.learner_id = p.id
  left join public.ppg_survey_responses sur on sur.learner_id = p.id
  left join lateral (
    select count(*)::int as attempts, max(score) as best_score
      from (
        select score from public.ppg_posttest_responses r
         where r.learner_id = p.id and r.submitted_at is not null
        union all
        select score from public.ppg_posttest_retry_attempts ra
         where ra.learner_id = p.id and ra.submitted_at is not null
      ) s
  ) ft on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'chapter_key', x.chapter_key,
          'phase', x.phase,
          'attempts', x.attempts,
          'first_score', x.first_score,
          'best_score', x.best_score,
          'last_score', x.last_score,
          'item_count', x.item_count
        ) order by x.chapter_key, case x.phase when 'pre' then 0 else 1 end
      ),
      '[]'::jsonb
    ) as results
    from (
      select a.chapter_key,
             a.phase,
             count(*)::int as attempts,
             max(a.score) filter (where a.attempt_seq = 1) as first_score,
             max(a.score) as best_score,
             (array_agg(a.score order by a.attempt_seq desc))[1] as last_score,
             max(a.item_count) as item_count
        from public.ppg_chapter_test_attempts a
       where a.learner_id = p.id
       group by a.chapter_key, a.phase
    ) x
  ) ch on true
  left join lateral (
    select coalesce(jsonb_agg(m.module_key order by m.module_key), '[]'::jsonb) as completed
      from public.ppg_module_missions m
     where m.learner_id = p.id
       and m.status = 'complete'
       and m.module_key like 'chapter-%'
  ) mc on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'module_key', ma.module_key,
          'attempt_seq', ma.attempt_seq,
          'outcome', ma.outcome,
          'score_pct', ma.score_pct,
          'created_at', to_char(ma.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ) order by ma.module_key, ma.attempt_seq
      ),
      '[]'::jsonb
    ) as attempts
      from public.ppg_mission_attempts ma
     where ma.learner_id = p.id
  ) ma on true
  left join lateral (
    select r.total_score,
           r.decision::text as decision,
           r.mission_id,
           r.submission_seq,
           (select count(*)
              from public.ppg_rubric_reviews r0
             where r0.learner_id = p.id) as review_count
      from public.ppg_rubric_reviews r
     where r.learner_id = p.id
     order by r.created_at desc, r.mission_id asc, r.submission_seq desc
     limit 1
  ) rub on true
  where p.role = 'learner';

  select jsonb_array_length(v_rows) into v_count;

  if p_format = 'sql' then
    select
      '-- PPGA research export (issue #16, widened by #86): restorable dump of the research tables' || E'\n' ||
      '-- Practical worksheets + rubric scoring are LEGACY (retired by ADR-0005); their' || E'\n' ||
      '-- rows stay in the dump for history but are marked as legacy in this header.' || E'\n' ||
      '-- Single transaction; every INSERT carries ON CONFLICT DO NOTHING, so a' || E'\n' ||
      '-- re-run is a no-op, never a duplicate. Restore target: a database whose' || E'\n' ||
      '-- schema and auth.users accounts ALREADY EXIST (the accounts themselves are' || E'\n' ||
      '-- not part of the dump — only the learner profiles and the research tables).' || E'\n' ||
      '-- ppg_audit_events is NEVER dumped: the audit stream is append-only (ADR-0002).' || E'\n' ||
      'BEGIN;' || E'\n' ||
      '-- ppg_profiles (learner identity rows)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_profiles (id, student_id, full_name, role, locale, consent, prettest_unlocked_override, created_at) VALUES (' ||
          quote_nullable(t.id::text) || ', ' ||
          quote_nullable(t.student_id) || ', ' ||
          quote_nullable(t.full_name) || ', ' ||
          quote_nullable(t.role::text) || ', ' ||
          quote_nullable(t.locale::text) || ', ' ||
          coalesce(t.consent::text, 'NULL') || ', ' ||
          coalesce(t.prettest_unlocked_override::text, 'NULL') || ', ' ||
          quote_nullable(to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (id) DO NOTHING;',
          E'\n' order by t.student_id)
          from public.ppg_profiles t
         where t.role = 'learner'),
        '-- (0 rows)') || E'\n' ||
      '-- ppg_pretest_responses (global research pre-test)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_pretest_responses (learner_id, instrument_version, language, answers, autosave_state, score, submitted_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.instrument_version) || ', ' ||
          quote_nullable(t.language) || ', ' ||
          quote_nullable(t.answers::text) || ', ' ||
          quote_nullable(t.autosave_state::text) || ', ' ||
          coalesce(t.score::text, 'NULL') || ', ' ||
          quote_nullable(to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id) DO NOTHING;',
          E'\n' order by t.learner_id)
          from public.ppg_pretest_responses t),
        '-- (0 rows)') || E'\n' ||
      '-- ppg_posttest_responses (Final Test attempt 1 — the research measure)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_posttest_responses (learner_id, instrument_version, language, answers, autosave_state, score, submitted_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.instrument_version) || ', ' ||
          quote_nullable(t.language) || ', ' ||
          quote_nullable(t.answers::text) || ', ' ||
          quote_nullable(t.autosave_state::text) || ', ' ||
          coalesce(t.score::text, 'NULL') || ', ' ||
          quote_nullable(to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id) DO NOTHING;',
          E'\n' order by t.learner_id)
          from public.ppg_posttest_responses t),
        '-- (0 rows)') || E'\n' ||
      '-- ppg_posttest_retry_attempts (Final Test attempts 2+)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_posttest_retry_attempts (learner_id, attempt_no, instrument_version, language, answers, autosave_state, score, started_at, submitted_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          coalesce(t.attempt_no::text, 'NULL') || ', ' ||
          quote_nullable(t.instrument_version) || ', ' ||
          quote_nullable(t.language) || ', ' ||
          quote_nullable(t.answers::text) || ', ' ||
          quote_nullable(t.autosave_state::text) || ', ' ||
          coalesce(t.score::text, 'NULL') || ', ' ||
          quote_nullable(to_char(t.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || ', ' ||
          quote_nullable(to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id, attempt_no) DO NOTHING;',
          E'\n' order by t.learner_id, t.attempt_no)
          from public.ppg_posttest_retry_attempts t),
        '-- (0 rows)') || E'\n' ||
      '-- ppg_chapter_test_attempts (per-chapter pre/post forms)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_chapter_test_attempts (learner_id, chapter_key, phase, attempt_seq, language, answers, score, item_count, submitted_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.chapter_key) || ', ' ||
          quote_nullable(t.phase) || ', ' ||
          coalesce(t.attempt_seq::text, 'NULL') || ', ' ||
          quote_nullable(t.language) || ', ' ||
          quote_nullable(t.answers::text) || ', ' ||
          coalesce(t.score::text, 'NULL') || ', ' ||
          coalesce(t.item_count::text, 'NULL') || ', ' ||
          quote_nullable(to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id, chapter_key, phase, attempt_seq) DO NOTHING;',
          E'\n' order by t.learner_id, t.chapter_key, t.phase, t.attempt_seq)
          from public.ppg_chapter_test_attempts t),
        '-- (0 rows)') || E'\n' ||
      '-- ppg_mission_attempts (Knowledge Mission history)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_mission_attempts (learner_id, module_key, attempt_seq, outcome, score_pct, created_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.module_key) || ', ' ||
          coalesce(t.attempt_seq::text, 'NULL') || ', ' ||
          quote_nullable(t.outcome) || ', ' ||
          coalesce(t.score_pct::text, 'NULL') || ', ' ||
          quote_nullable(to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id, module_key, attempt_seq) DO NOTHING;',
          E'\n' order by t.learner_id, t.module_key, t.attempt_seq)
          from public.ppg_mission_attempts t),
        '-- (0 rows)') || E'\n' ||
      '-- ppg_survey_responses (satisfaction)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_survey_responses (learner_id, instrument_version, language, answers, autosave_state, submitted_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.instrument_version) || ', ' ||
          quote_nullable(t.language) || ', ' ||
          quote_nullable(t.answers::text) || ', ' ||
          quote_nullable(t.autosave_state::text) || ', ' ||
          quote_nullable(to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id) DO NOTHING;',
          E'\n' order by t.learner_id)
          from public.ppg_survey_responses t),
        '-- (0 rows)') || E'\n' ||
      '-- LEGACY: ppg_submissions (before the reviews'' FK)' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_submissions (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status, review_verdict, review_notes_th, review_notes_en, reviewed_by, reviewed_at, created_at, updated_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.mission_id) || ', ' ||
          coalesce(t.submission_seq::text, 'NULL') || ', ' ||
          quote_nullable(t.storage_path) || ', ' ||
          quote_nullable(t.file_magic) || ', ' ||
          coalesce(t.file_size::text, 'NULL') || ', ' ||
          quote_nullable(t.reflection) || ', ' ||
          quote_nullable(t.status::text) || ', ' ||
          quote_nullable(t.review_verdict) || ', ' ||
          quote_nullable(t.review_notes_th) || ', ' ||
          quote_nullable(t.review_notes_en) || ', ' ||
          quote_nullable(t.reviewed_by::text) || ', ' ||
          quote_nullable(to_char(t.reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || ', ' ||
          quote_nullable(to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || ', ' ||
          quote_nullable(to_char(t.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id, mission_id, submission_seq) DO NOTHING;',
          E'\n' order by t.learner_id, t.mission_id, t.submission_seq)
          from public.ppg_submissions t),
        '-- (0 rows)') || E'\n' ||
      '-- LEGACY: ppg_rubric_reviews' || E'\n' ||
      coalesce((
        select string_agg(
          'INSERT INTO public.ppg_rubric_reviews (learner_id, mission_id, submission_seq, teacher_id, score_content_structure, score_text_formatting, score_images_visual, score_slide_design, score_tool_usage, score_creativity, score_completeness, total_score, decision, feedback_th, feedback_en, created_at) VALUES (' ||
          quote_nullable(t.learner_id::text) || ', ' ||
          quote_nullable(t.mission_id) || ', ' ||
          coalesce(t.submission_seq::text, 'NULL') || ', ' ||
          quote_nullable(t.teacher_id::text) || ', ' ||
          coalesce(t.score_content_structure::text, 'NULL') || ', ' ||
          coalesce(t.score_text_formatting::text, 'NULL') || ', ' ||
          coalesce(t.score_images_visual::text, 'NULL') || ', ' ||
          coalesce(t.score_slide_design::text, 'NULL') || ', ' ||
          coalesce(t.score_tool_usage::text, 'NULL') || ', ' ||
          coalesce(t.score_creativity::text, 'NULL') || ', ' ||
          coalesce(t.score_completeness::text, 'NULL') || ', ' ||
          coalesce(t.total_score::text, 'NULL') || ', ' ||
          quote_nullable(t.decision::text) || ', ' ||
          quote_nullable(t.feedback_th) || ', ' ||
          quote_nullable(t.feedback_en) || ', ' ||
          quote_nullable(to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ||
          ') ON CONFLICT (learner_id, mission_id, submission_seq) DO NOTHING;',
          E'\n' order by t.learner_id, t.mission_id, t.submission_seq)
          from public.ppg_rubric_reviews t),
        '-- (0 rows)') || E'\n' ||
      'COMMIT;'
    into v_dump;
  end if;

  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'research_export',
    'cohort',
    'all_participants',
    jsonb_build_object('format', p_format, 'participant_count', v_count),
    now()
  );

  return jsonb_build_object(
    'format', p_format,
    'participant_count', v_count,
    'columns', v_columns,
    'rows', v_rows,
    'sql_dump', to_jsonb(v_dump)
  );
end;
$$;

revoke execute on function public.ppg_research_export(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_research_export(text)
  to authenticated, service_role;

comment on function public.ppg_research_export(text) is
  'PPGA #16 widened by #86: the teacher/admin research export — global Pre-Test + Final Test (first/best/attempts, versions preserved), per-chapter pre/post scores + attempts, Knowledge Mission results, satisfaction, and the LEGACY practical/rubric fields kept but prefixed legacy_ with an explicit marker column. One audit event per run.';

-- The preview adds the CAI instruments' counts; the legacy rubric/submission
-- counts stay visible but are labelled legacy on the page.
create or replace function public.ppg_research_export_preview()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_research_export_preview is teacher/admin-only (the JWT role claim is the authority)';
  end if;

  return jsonb_build_object(
    'participant_count', (select count(*) from public.ppg_profiles where role = 'learner'),
    'pretest_submitted', (select count(*) from public.ppg_pretest_responses where submitted_at is not null),
    'posttest_submitted', (select count(*) from public.ppg_posttest_responses where submitted_at is not null),
    'survey_submitted', (select count(*) from public.ppg_survey_responses where submitted_at is not null),
    'chapter_pretest_submitted', (select count(*) from public.ppg_chapter_test_attempts where phase = 'pre'),
    'chapter_posttest_submitted', (select count(*) from public.ppg_chapter_test_attempts where phase = 'post'),
    'mission_attempt_count', (select count(*) from public.ppg_mission_attempts),
    'rubric_review_count', (select count(*) from public.ppg_rubric_reviews),
    'submission_count', (select count(*) from public.ppg_submissions)
  );
end;
$$;

revoke execute on function public.ppg_research_export_preview()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_research_export_preview()
  to authenticated, service_role;

comment on function public.ppg_research_export_preview() is
  'PPGA #16 widened by #86: the Export page''s state read — participant count, the global Pre-Test / Final Test / survey submissions, chapter pre/post attempt counts, Mission attempts, and the legacy rubric/submission counts (teacher/admin only, no audit).';
