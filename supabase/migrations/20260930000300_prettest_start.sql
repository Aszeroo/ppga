-- PPGA #18 (production verification): the Pre-Test row starter — the missing
-- sibling of #15's `ppg_posttest_start` / `ppg_survey_start`. #8 shipped the
-- submit function requiring an EXISTING response row (its own error message
-- points at "ppg_prettest_upsert's insert path" — an insert path the
-- UPDATE-only upsert never had), so no learner could EVER create their row
-- and every UI submit died at `response_missing`: the live journey blocked
-- at its very first instrument. The starter mirrors the #15 starters:
-- learner-only, consent-gated (the same gate the submit re-raises — the
-- override is the admin's absentee bypass PAST the gate, never a pre-test
-- record), the CURRENT instrument version recorded server-side + the th|en
-- taken language; idempotent (ON CONFLICT DO NOTHING — the single-attempt PK).

create or replace function public.ppg_prettest_start(p_language text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_version text;
  v_consent boolean;
begin
  -- Gate 1: the caller is a learner (the JWT's role claim; a teacher/admin
  -- smuggling the start reaches `permission_denied` — never a staff row in
  -- the research instrument).
  if auth.role() != 'learner' then
    raise exception 'permission_denied: ppg_prettest_start is learner-only (JWT role claim must be learner)';
  end if;

  if p_language is null or p_language not in ('th','en') then
    raise exception 'language_denied: the taken language is th|en ONLY';
  end if;

  -- Gate 2 mirrors the submit's own gate: consent first — the flag lives in
  -- the learner's own profile row under their own SELECT (RLS); an
  -- unconsented learner never starts the instrument (the respectful
  -- explanation is the UI's state, never a silent start).
  SELECT p.consent
    INTO v_consent
    FROM public.ppg_profiles p
   WHERE p.id = auth.uid() AND p.consent;
  if not FOUND then
    raise exception 'consent_not_yet: the consent flag is unset; the Pre-Test is blocked (the respectful explanation is the UI''s state, never a silent start)';
  end if;

  select i.version into v_version
    from public.ppg_pretest_instruments i
   order by i.version desc
   limit 1;
  if v_version is null then
    raise exception 'instrument_missing: no seeded Pre-Test instrument to start';
  end if;

  insert into public.ppg_pretest_responses (learner_id, instrument_version, language)
    values (auth.uid(), v_version, p_language)
  on conflict (learner_id) do nothing;
end;
$$;

revoke execute on function public.ppg_prettest_start(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_prettest_start(text)
  to service_role, authenticated;

comment on function public.ppg_prettest_start(text) is
  'PPGA #18: the Pre-Test row starter — the #15-starter pattern for the #8 instrument; learner-only, consent-gated, the CURRENT instrument version recorded server-side + the th|en taken language; idempotent (ON CONFLICT DO NOTHING — the single-attempt PK).';
