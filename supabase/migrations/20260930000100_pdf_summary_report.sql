-- Ticket #17 PDF summary report: the Admin/Teacher PDF download reads its
-- ENTIRE payload from ONE security-definer RPC — `ppg_pdf_summary()` — that
-- derives every number the report prints IN THE DATABASE (Postgres is the
-- domain layer; the Next.js layer only renders the bytes): cohort-level
-- Pre-Test/Post-Test means, the rubric score distributions (per-criterion
-- 1–5 tallies + the total-score bands + the decision tally), and the
-- Satisfaction-Survey tallies per item per choice, plus EXACTLY ONE audit
-- event on the SAME call (ADR-0002: every export run is accountable —
-- actor_id = who, action 'pdf_summary' + details = what, created_at = when;
-- the vocabulary mirrors #16's 'research_export' on the same append-only
-- stream). A learner who smuggles the call gets a hard `permission_denied`
-- (the function's own JWT gate — the same authority as #16), never a
-- stats-shaped empty; the empty cohort is a NORMAL result (count 0, mean
-- NULL — never a NaN, never a crash) and is STILL audited.

-- ---------------------------------------------------------------------------
-- The report-data RPC — one call: gate → statistics → one audit INSERT.
-- ---------------------------------------------------------------------------
create or replace function public.ppg_pdf_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
  v_pretest jsonb;
  v_posttest jsonb;
  v_rubric jsonb;
  v_satisfaction jsonb;
  v_pre_n integer;
  v_post_n integer;
  v_rub_n integer;
  v_sat_n integer;
begin
  -- Gate: the role. Teacher/Admin only — the JWT's role claim is the
  -- authority (never a Postgres role); a learner/stranger gets
  -- `permission_denied`. coalesce() so a MISSING role claim can never slip
  -- the `not in` (NULL is not TRUE in plpgsql IF). #16's pattern exactly.
  if coalesce(auth.role(), '') not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_pdf_summary is teacher/admin-only (the JWT role claim is the authority)';
  end if;

  -- The cohort: every learner profile (the SAME population #16's extract
  -- ships — the report speaks about the very participants the export runs).
  select count(*) into v_count
    from public.ppg_profiles where role = 'learner';

  -- Pre-Test: the submitted-only mean/min/max (an autosaved draft has no
  -- score and never pollutes the mean). round(avg,2) is THE mean the PDF
  -- prints — the renderer never recomputes anything (a number the report
  -- shows is a number the database produced). Empty: count 0, mean NULL
  -- (json null → the renderer prints an em dash — never a NaN).
  select count(*),
         jsonb_build_object(
           'submitted_count', count(*),
           'mean', round(avg(score), 2),
           'min', min(score),
           'max', max(score))
    into v_pre_n, v_pretest
    from public.ppg_pretest_responses
   where submitted_at is not null;

  -- Post-Test: the same shape (#15's instrument; the pre/post comparison is
  -- the whole point of the research tables).
  select count(*),
         jsonb_build_object(
           'submitted_count', count(*),
           'mean', round(avg(score), 2),
           'min', min(score),
           'max', max(score))
    into v_post_n, v_posttest
    from public.ppg_posttest_responses
   where submitted_at is not null;

  -- Rubric: EVERY distribution the report draws —
  --   * the 7 criteria (each: how many reviews scored it 1/2/3/4/5 + the
  --     mean; the bilingual labels ride ppg_rubric_criteria so the report's
  --     criterion names are the seeded ones, not a renderer copy),
  --   * the total-score bands 7–13 / 14–20 / 21–27 / 28–35 (the 7×1–5 /
  --     total 7–35 rubric divided in quartiles — the headline distribution),
  --   * the decision tally (approved | needs_improvement).
  -- Every aggregate rides the WHOLE append-only review stream. Empty: the
  -- per-criterion arrays still ride (all counts 0, mean NULL) — the table
  -- prints its seven named rows, never an empty hole.
  select count(*),
         jsonb_build_object(
           'review_count', count(*),
           'total_mean', round(avg(total_score), 2),
           'decisions', jsonb_build_object(
             'approved',           count(*) filter (where decision = 'approved'),
             'needs_improvement',  count(*) filter (where decision = 'needs_improvement')),
           'total_distribution', jsonb_build_object(
             '7-13',   count(*) filter (where total_score between 7  and 13),
             '14-20',  count(*) filter (where total_score between 14 and 20),
             '21-27',  count(*) filter (where total_score between 21 and 27),
             '28-35',  count(*) filter (where total_score between 28 and 35)),
           'criteria', (
             select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'ordinal',   b.ord,
                   'criterion', b.key,
                   'label_th',  coalesce(lb.label_th, b.key),
                   'label_en',  coalesce(lb.label_en, b.key),
                   'reviews',   b.n,
                   'mean',      round(b.avg_score, 2),
                   'counts',    b.counts)
                 order by b.ord),
               '[]'::jsonb)
             from (
               select 1 as ord, 'content_structure' as key,
                      count(r.score_content_structure) as n,
                      avg(r.score_content_structure)   as avg_score,
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_content_structure = 1),
                        '2', count(*) filter (where r.score_content_structure = 2),
                        '3', count(*) filter (where r.score_content_structure = 3),
                        '4', count(*) filter (where r.score_content_structure = 4),
                        '5', count(*) filter (where r.score_content_structure = 5)) as counts
                 from public.ppg_rubric_reviews r
               union all
               select 2, 'text_formatting',
                      count(r.score_text_formatting),
                      avg(r.score_text_formatting),
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_text_formatting = 1),
                        '2', count(*) filter (where r.score_text_formatting = 2),
                        '3', count(*) filter (where r.score_text_formatting = 3),
                        '4', count(*) filter (where r.score_text_formatting = 4),
                        '5', count(*) filter (where r.score_text_formatting = 5))
                 from public.ppg_rubric_reviews r
               union all
               select 3, 'images_visual',
                      count(r.score_images_visual),
                      avg(r.score_images_visual),
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_images_visual = 1),
                        '2', count(*) filter (where r.score_images_visual = 2),
                        '3', count(*) filter (where r.score_images_visual = 3),
                        '4', count(*) filter (where r.score_images_visual = 4),
                        '5', count(*) filter (where r.score_images_visual = 5))
                 from public.ppg_rubric_reviews r
               union all
               select 4, 'slide_design',
                      count(r.score_slide_design),
                      avg(r.score_slide_design),
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_slide_design = 1),
                        '2', count(*) filter (where r.score_slide_design = 2),
                        '3', count(*) filter (where r.score_slide_design = 3),
                        '4', count(*) filter (where r.score_slide_design = 4),
                        '5', count(*) filter (where r.score_slide_design = 5))
                 from public.ppg_rubric_reviews r
               union all
               select 5, 'powerpoint_tool_usage',
                      count(r.score_tool_usage),
                      avg(r.score_tool_usage),
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_tool_usage = 1),
                        '2', count(*) filter (where r.score_tool_usage = 2),
                        '3', count(*) filter (where r.score_tool_usage = 3),
                        '4', count(*) filter (where r.score_tool_usage = 4),
                        '5', count(*) filter (where r.score_tool_usage = 5))
                 from public.ppg_rubric_reviews r
               union all
               select 6, 'creativity',
                      count(r.score_creativity),
                      avg(r.score_creativity),
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_creativity = 1),
                        '2', count(*) filter (where r.score_creativity = 2),
                        '3', count(*) filter (where r.score_creativity = 3),
                        '4', count(*) filter (where r.score_creativity = 4),
                        '5', count(*) filter (where r.score_creativity = 5))
                 from public.ppg_rubric_reviews r
               union all
               select 7, 'completeness',
                      count(r.score_completeness),
                      avg(r.score_completeness),
                      jsonb_build_object(
                        '1', count(*) filter (where r.score_completeness = 1),
                        '2', count(*) filter (where r.score_completeness = 2),
                        '3', count(*) filter (where r.score_completeness = 3),
                        '4', count(*) filter (where r.score_completeness = 4),
                        '5', count(*) filter (where r.score_completeness = 5))
                 from public.ppg_rubric_reviews r
             ) b
             left join public.ppg_rubric_criteria lb on lb.criterion_key = b.key
           ))
    into v_rub_n, v_rubric
    from public.ppg_rubric_reviews;
  -- Satisfaction: the tally per survey item per choice (the survey has NO
  -- answer key — satisfaction has no right answer, so it is tallied, never
  -- averaged). The answers' jsonb rides jsonb_each_text (submitted-only).
  -- Empty: items = [] — the renderer prints its graceful 'no responses' line.
  select count(*),
         jsonb_build_object(
           'submitted_count', count(*),
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('item', s.item, 'tallies', s.tallies)
                              order by s.item)
             from (
               select x.item,
                      jsonb_object_agg(x.choice, x.n) as tallies
               from (
                 select j.key as item, j.value as choice, count(*) as n
                   from public.ppg_survey_responses r
                   cross join lateral jsonb_each_text(r.answers) j
                  where r.submitted_at is not null
                    and r.answers is not null
                  group by j.key, j.value
               ) x
               group by x.item
             ) s),
             '[]'::jsonb))
    into v_sat_n, v_satisfaction
    from public.ppg_survey_responses
   where submitted_at is not null;

  -- Exactly ONE audit event, SAME transaction, SAME call — who (actor_id),
  -- what (action 'pdf_summary' — the #16 'research_export' vocabulary on the
  -- same append-only stream, ADR-0002 — + the participant/instrument counts
  -- the report carried), when (created_at = now(), pinned to this
  -- transaction). The empty-cohort run is audited too: opening the data is
  -- still the access event.
  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  values (
    auth.uid(),
    'pdf_summary',
    'cohort',
    'all_participants',
    jsonb_build_object(
      'report', 'cohort_summary',
      'participant_count', v_count,
      'pretest_submitted', v_pre_n,
      'posttest_submitted', v_post_n,
      'rubric_review_count', v_rub_n,
      'survey_submitted', v_sat_n
    ),
    now()
  );

  return jsonb_build_object(
    'generated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'participant_count', v_count,
    'pretest', v_pretest,
    'posttest', v_posttest,
    'rubric', v_rubric,
    'satisfaction', v_satisfaction
  );
end;
$$;

revoke execute on function public.ppg_pdf_summary()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_pdf_summary()
  to authenticated, service_role;

comment on function public.ppg_pdf_summary() is
  'PPGA #17: the PDF summary report''s data — ONE call: JWT role gate (a learner gets permission_denied), the cohort statistics the printable report ships (Pre-Test/Post-Test means + min/max, the rubric per-criterion 1–5 distributions + total-score bands + decision tally with the seeded bilingual criterion labels, the satisfaction tallies per item per choice), and EXACTLY ONE audit event on the same call (action pdf_summary, who/what/when, ADR-0002). The empty cohort is a normal result (counts 0, means NULL — never a NaN), still audited.';
