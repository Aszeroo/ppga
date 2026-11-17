-- ============================================================================
-- PPGA #85: retire the Practical Mission worksheets from the learner and
-- teacher journey.
--
-- The CAI course (PRD #72, ADR-0005) runs on chapters, pre/post tests,
-- lessons, mini-checks and Knowledge Missions. Practical Missions,
-- submissions and rubric scoring are legacy. Their code, tables, private
-- storage bucket, submissions and rubric history all STAY (append-only,
-- ADR-0002); only the learner-facing rows are archived so they can no longer
-- be displayed or unlock a worksheet.
--
-- This migration is NON-DESTRUCTIVE: it adds one nullable column, marks the
-- existing seeded rows archived, and redefines two read gates. No row, no
-- storage object and no historical rubric review is deleted or moved.
-- Teachers and admins keep reading the archived rows for history/export.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The archive stamp. NULL = an active (displayable) practical Mission.
--    Every row seeded by #13 and #15 is stamped here, and new inserts default
--    to NULL only when they are deliberately authored into an active course.
-- ----------------------------------------------------------------------------
alter table public.ppg_practical_missions
  add column if not exists archived_at timestamptz;

update public.ppg_practical_missions
   set archived_at = now()
 where archived_at is null;

comment on column public.ppg_practical_missions.archived_at is
  'PPGA #85: NULL = displayable practical Mission; a stamp retires the worksheet from the learner journey. Historical submissions and rubric rows are never deleted (ADR-0002/0005).';

-- ----------------------------------------------------------------------------
-- 2. Learner table reads: an archived practical Mission is invisible. Teacher
--    and admin reads keep the archived rows (history and research export).
-- ----------------------------------------------------------------------------
drop policy if exists ppg_practical_missions_select on public.ppg_practical_missions;

create policy ppg_practical_missions_select on public.ppg_practical_missions
  for select
  using (
    (auth.role() = 'learner' and archived_at is null)
    or auth.role() = 'teacher'
    or auth.role() = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 3. The practical reader: a learner sees no archived row; teacher/admin keep
--    the full history view. This replaces the #88 definition (which already
--    denied archived PARENT modules) and adds the mission's own archive stamp.
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
          and p.archived_at is null
        )
      );
end;
$$;

revoke execute on function public.ppg_read_practical(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_read_practical(text)
  to authenticator;

comment on function public.ppg_read_practical(text) is
  'PPGA #13, hardened by #88 and retired by #85: the practical Mission row a SEE-ABLE parent module shows. A learner sees no archived practical Mission (and never an archived parent module); teacher/admin keep the archived rows for history. The page shows an unavailable state, never a hidden form.';
