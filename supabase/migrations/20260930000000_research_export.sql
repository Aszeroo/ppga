-- Ticket #16 research export: the Admin/Teacher Export page reads the research
-- tables (Pre-Test, Post-Test, rubric reviews, Satisfaction Survey, with the
-- real student identity per the spec decision) through ONE security-definer
-- RPC — `ppg_research_export(p_format)` — that derives the one-row-per-
-- participant extract in the DATABASE (Postgres is the domain layer; the
-- Next.js layer only streams the bytes), validates the format at the gate
-- (csv | xlsx | sql — the PDF report is #17, NEVER this RPC), and writes
-- EXACTLY ONE audit event on the SAME call (ADR-0002: every export run is
-- accountable — actor_id = who, action + details = what, created_at = when).
-- A learner who smuggles the call gets a hard `permission_denied` (the
-- function's own JWT gate — the same authority as #6's admin RPCs), never a
-- silently-0-row roster; the empty-cohort case is a NORMAL result (0 rows,
-- still audited), never an error.
--
-- The SQL format is a RESTORABLE transaction script assembled in the database:
-- one BEGIN/COMMIT over INSERT statements (quote_nullable-escaped, so any
-- quote/newline/Thai byte rides safely) for the learner identity rows + the
-- five research tables, every INSERT carrying ON CONFLICT DO NOTHING so
-- re-running the dump is a no-op, never a duplicate. The rows are ordered by
-- their own keys for a deterministic, diffable file.

-- ---------------------------------------------------------------------------
-- The extract RPC — one call: gate → extract → (SQL dump) → one audit INSERT.
-- ---------------------------------------------------------------------------
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
    "posttest_instrument_version", "posttest_language", "posttest_score", "posttest_submitted_at",
    "rubric_review_count", "rubric_latest_mission", "rubric_latest_round",
    "rubric_latest_total", "rubric_latest_decision",
    "satisfaction_instrument_version", "satisfaction_language",
    "satisfaction_answers", "satisfaction_submitted_at"
  ]'::jsonb;
  v_count integer;
  v_dump text;
begin
  -- Gate 1: the role. Teacher/Admin only — the JWT's role claim is the
  -- authority (never a Postgres role); a learner/stranger gets `permission_denied`,
  -- never a roster-shaped empty a smuggle could pass. coalesce() so a MISSING
  -- role claim can never slip the `not in` (NULL is not TRUE in plpgsql IF).
  if coalesce(auth.role(), '') not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_research_export is teacher/admin-only (the JWT role claim is the authority)';
  end if;

  -- Gate 2: the format. csv | xlsx | sql ONLY — the PDF report is issue #17
  -- and NEVER lives here (out of scope; the DB refuses even a smuggled 'pdf').
  if p_format is null or p_format not in ('csv', 'xlsx', 'sql') then
    raise exception 'export_format_denied: p_format must be csv | xlsx | sql (the PDF report is issue #17)';
  end if;

  -- The extract: ONE row per participant (every learner profile — a learner
  -- without responses still rides the row with NULLs: partial + empty cohorts
  -- are NORMAL results, never errors). The identity columns (student_id,
  -- full_name) are the real ones per the spec decision; the rubric columns
  -- carry the LATEST review's total/decision (append-only history rides the
  -- SQL dump). Timestamps leave as UTC ISO 8601 — the export file must not
  -- depend on the reader's timezone.
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
        'posttest_instrument_version', post.instrument_version,
        'posttest_language', post.language,
        'posttest_score', post.score,
        'posttest_submitted_at',
          to_char(post.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'rubric_review_count', coalesce(rub.review_count, 0),
        'rubric_latest_mission', rub.mission_id,
        'rubric_latest_round', rub.submission_seq,
        'rubric_latest_total', rub.total_score,
        'rubric_latest_decision', rub.decision,
        'satisfaction_instrument_version', sur.instrument_version,
        'satisfaction_language', sur.language,
        'satisfaction_answers', sur.answers,
        'satisfaction_submitted_at',
          to_char(sur.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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

  -- The SQL format: a restorable transaction script, assembled HERE (the
  -- derivation stays in the domain layer; Next only streams the text).
  -- quote_nullable makes every value a safe literal (quotes, newlines, Thai);
  -- ON CONFLICT DO NOTHING keeps a re-run a no-op; the submissions table rides
  -- BEFORE the reviews (the reviews' FK), the learner profiles FIRST (identity).
  if p_format = 'sql' then
    select
      '-- PPGA research export (issue #16): restorable dump of the research tables' || E'\n' ||
      '-- Single transaction; every INSERT carries ON CONFLICT DO NOTHING, so a' || E'\n' ||
      '-- re-run is a no-op, never a duplicate. Restore target: a database whose' || E'\n' ||
      '-- schema and auth.users accounts ALREADY EXIST (the accounts themselves are' || E'\n' ||
      '-- not part of the dump — only the learner profiles and the five research' || E'\n' ||
      '-- tables). ppg_audit_events is NEVER dumped: the audit stream is' || E'\n' ||
      '-- append-only (ADR-0002) and belongs to the source database.' || E'\n' ||
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
      '-- ppg_pretest_responses' || E'\n' ||
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
      '-- ppg_posttest_responses' || E'\n' ||
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
      '-- ppg_survey_responses' || E'\n' ||
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
      '-- ppg_submissions (before the reviews — the reviews'' FK)' || E'\n' ||
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
      '-- ppg_rubric_reviews' || E'\n' ||
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

  -- Exactly ONE audit event, SAME transaction, SAME call — who (actor_id),
  -- what (action + the format + the participant count), when (created_at).
  -- The empty-cohort run is audited too (participant_count = 0): an export
  -- that found nothing is STILL a data-access event.
  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'research_export',
    'cohort',
    'all_participants',
    jsonb_build_object(
      'format', p_format,
      'participant_count', v_count
    ),
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
  'PPGA #16: the Admin/Teacher research export — ONE call: JWT role gate (a learner gets permission_denied), format gate (csv | xlsx | sql — the PDF is #17), the one-row-per-participant extract (Pre-Test, Post-Test, rubric totals, satisfaction, real student identity), the restorable SQL dump (single transaction, ON CONFLICT DO NOTHING) when format=sql, and EXACTLY ONE audit event on the same call (who/what/when, ADR-0002). The empty cohort is a normal 0-row result, still audited.';

-- ---------------------------------------------------------------------------
-- The preview RPC — the Export PAGE's state read (participants + how many
-- responses each instrument holds). Same teacher/admin gate, but NO audit: a
-- page view is not an export RUN; only ppg_research_export (the download) is.
-- ---------------------------------------------------------------------------
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
  'PPGA #16: the Export page''s state read (participant + per-instrument counts) — teacher/admin-only, NO audit (a page view is not an export run; ppg_research_export is).';

-- ---------------------------------------------------------------------------
-- #16 UNBLOCKER — the export's downloads ride the SESSION client (PostgREST),
-- and PostgREST switches the query role with the JWT's role claim
-- (`SET LOCAL ROLE <claim>`). The platform's whole RLS design speaks the
-- CLAIM through auth.role() (the seeds store 'admin'/'teacher'/'learner' in
-- auth.users.role for exactly that), but no DB roles carried those names,
-- so EVERY session-JWT call a staff (or learner) account made died with
-- 22023 `role "admin" does not exist` BEFORE any policy or function ran —
-- the Export downloads (and the console's own reads) could never stream.
-- The fix lives in the domain layer: NOLOGIN INHERIT roles named after the
-- claims, each carrying `authenticated`'s privileges by membership. Nothing
-- about the AUTHORITY changes — RLS still decides through auth.role()/
-- auth.uid() on the claim, the roles are not loggable and gain no rights
-- beyond what an authenticated session already holds; they only give
-- PostgREST a legal role to switch into. (Seam tests are unaffected: they
-- ride `authenticated` + claims, exactly as before.)
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'admin') then
    create role admin nologin inherit; -- claim-named: SET LOCAL ROLE admin works
  end if;
  if not exists (select 1 from pg_roles where rolname = 'teacher') then
    create role teacher nologin inherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'learner') then
    create role learner nologin inherit;
  end if;
end;
$$;

-- authenticated's grants (schema usage + the research tables + the RPC
-- execute below) ride the membership — INHERIT, never a re-grant of rights.
grant authenticated to admin, teacher, learner;

comment on role admin is
  'PPGA #16: PostgREST switch-target for the admin JWT claim; NOLOGIN, carries authenticated''s grants by membership; RLS still speaks the claim.';
comment on role teacher is
  'PPGA #16: PostgREST switch-target for the teacher JWT claim; NOLOGIN, carries authenticated''s grants by membership.';
comment on role learner is
  'PPGA #16: PostgREST switch-target for the learner JWT claim; NOLOGIN, carries authenticated''s grants by membership.';

-- PostgREST's connection role switches INTO the claim-named roles — the same
-- membership `authenticated`/`anon` already carry for the switch itself
-- (pg_auth_members: authenticator can SET LOCAL ROLE authenticated; now the
-- staff/learner claims too). The switch gains nothing beyond the roles' own
-- authenticated-level membership above.
grant admin, teacher, learner to authenticator;
