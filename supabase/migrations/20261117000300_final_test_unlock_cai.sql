-- ============================================================================
-- PPGA #86: the Final Test unlocks on the CAI rule.
--
-- #15 gated `ppg_posttest_unlocked` on `module-11` (the retired Practical Final
-- Project) being `complete`. #85 removed the Practical worksheets, so no
-- learner can ever write that completion and the Final Test was unreachable —
-- the CAI loop could not finish.
--
-- The rule is now: all nine chapters cleared. `ppg_chapter_unlocks` records the
-- NEXT chapter a passing post-test opens (chapter-02 after chapter-01, …
-- chapter-10 after chapter-09), so a learner who cleared N chapters owns N
-- distinct `chapter-NN` rows. Nine distinct rows (chapter-02..chapter-10)
-- means every one of the nine chapters passed.
--
-- The legacy `module-11` completion stays as a fallback for historical
-- learners who finished the Practical Final Project before #85. Nothing else
-- changes: same signature, SECURITY DEFINER, search_path, and grants.
-- ============================================================================

create or replace function public.ppg_posttest_unlocked(p_learner uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    -- Legacy (#15): the Teacher approved the Practical Final Project.
    select 1
      from public.ppg_module_missions mi
    where mi.learner_id = p_learner
      and mi.module_key = 'module-11'
      and mi.status = 'complete'
  )
  or (
    -- CAI (#86): all nine chapters cleared. The unlock record is the next
    -- chapter a post-test opened, so nine distinct rows == nine passes.
    select count(distinct u.chapter_key)
      from public.ppg_chapter_unlocks u
    where u.learner_id = p_learner
      and u.chapter_key ~ '^chapter-[0-9]{2}$'
  ) >= 9;
$$;

revoke execute on function public.ppg_posttest_unlocked(uuid)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_posttest_unlocked(uuid)
  to service_role, authenticated;

comment on function public.ppg_posttest_unlocked(uuid) is
  'PPGA #86 (widened from #15): the Final Test''s gate. Unlocks when the learner has cleared all nine chapters — nine distinct `chapter-NN` rows in ppg_chapter_unlocks (the next-chapter unlock record the 70% post-test writes) — OR, for historical learners, when the legacy `module-11` Practical Final Project Mission is `complete`. The Post-Test is never reachable earlier (ADR-0002).';
