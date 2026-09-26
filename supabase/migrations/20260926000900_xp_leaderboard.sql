-- Ticket #12 the XP leaderboard: the rank + name + Level + XP of ALL Learners
-- (the row-number the deterministic tie-break the XP desc, name asc, stable
-- id asc speaks) + the CALLER's own row WITH the XP-to-next-rank (the rank
-- above minus own; the top learner gets NULL — nobody above them to catch).
-- The ADR-0001 rules hold here: the leaderboard shows rank + name + Level +
-- XP ONLY — rubric scores, knowledge scores, the pre/post results NEVER
-- appear; Prizes stay OFFLINE (no winner/prize state anywhere in the app);
-- XP ≠ any score (the ledger's SUM is the ONLY gamification currency). The
-- definer's rights READ the profiles + the ledger all (the leaderboard is
-- the aggregate the ADR shows to ALL Learners — every learner sees the
-- ranking, an other learner's name/Level/XP is the ADR's intended content)
-- but the RPC's output shape is learner-visible ONLY: rank, full_name,
-- level, total_xp per row; own_rank, own_total_xp, own_level, own_full_name,
-- xp_to_next_rank per CALLER — no score/rubric/knowledge/pretest/posttest/
-- winner fields ever ride out.
--
-- The visible-to-all rule: the EXECUTE grant IS the RLS this ticket speaks —
-- any authenticated learner/teacher/admin may read the leaderboard (the
-- grant to authenticated, not a table SELECT the learner's own JWT denies);
-- the pre-test gate NEVER gates this screen (the leaderboard is the XP
-- visibility, not the locked content); a teacher/admin CALLER whose profile
-- role is not 'learner' reaches the rows WITH their own_rank/own_* NULL (
-- they are not a Learner row on the board).
--
-- The Prizes stay offline: the RPC's output carries NO `winner`, NO
-- `prize`, NO `final_project` winner state — a practical approval is a
-- ledger row (its XP rides the SUM like any grant), never a winner.

create or replace function public.ppg_xp_leaderboard()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  -- The ledger's SUM for every LEARNER (no XP yet → LEFT JOIN's COALESCE 0;
  -- the leaderboard shows ALL Learners, a not-yet-active Learner is 0 XP,
  -- Level 1, never a missing row). A teacher/admin profile is NOT a Learner
  -- row (the role filter — their XP never appears on the board either).
  with v_ledger as (
    select
      p.id AS learner_id,
      coalesce(sum(x.amount)::int, 0::int) AS total_xp
      from public.ppg_profiles p
      left join public.ppg_xp_ledger x on x.learner_id = p.id
      where p.role = 'learner'::public.ppg_role
      group by p.id
  ),
  -- The deterministic rank: XP desc, full_name asc, learner_id asc — a
  -- tie at XP breaks by name then the stable uuid (no ever flip-flip-
  -- flip-ordering). `row_number()` (the unique rank, the tie-break makes
  -- deterministic — not `dense_rank()` (the would re-tie ranks and re-
  -- introduce the flip the ticket denies).
  v_ranked as (
    select
      row_number() over (
        order by v_ledger.total_xp desc,
        p.full_name asc,
        v_ledger.learner_id asc
      ) AS rank,
      v_ledger.learner_id,
      p.full_name,
      floor(v_ledger.total_xp / 100::float)::int + 1 AS level,
      v_ledger.total_xp
      from v_ledger
      join public.ppg_profiles p on p.id = v_ledger.learner_id
  ),
  -- The CALLER's own row + the XP-to-next-rank (the rank above — the row
  -- with rank = own rank - 1 — minus own). The top learner (rank 1) gets
  -- NULL (the design choice: no one above them to overtake; the UI shows
  -- "no one above you", never a 0 XP fake gap). A CALLER not on the board
  -- (role not learner) reaches the NULLs (their own_rank/own_* never ride
  -- out). The LEFT JOIN (the would keep the row even at the top where no
  -- above row joins).
  v_own as (
    select
      r.rank,
      r.level,
      r.full_name,
      r.total_xp,
      (ab.total_xp - r.total_xp)::int AS xp_to_next_rank
      from v_ranked r
      left join v_ranked ab on ab.rank = r.rank - 1
      where r.learner_id = auth.uid()
  ),
  -- The learner-visible shape (the aggregate + the CALLER's scalars): the
  -- scalar subqueries are 0-or-1-row (v_own is at most one row — the uuid
  -- is unique) so the NULLs ride out for an off-board CALLER. The JSON
  -- keys ONLY: rows (rank, full_name, level, total_xp), own_rank,
  -- own_total_xp, own_level, own_full_name, xp_to_next_rank — no score/
  -- rubric/knowledge/pretest/posttest/winner/prize fields ever built.
  v_shape as (
    select
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'rank', r.rank,
              'full_name', r.full_name,
              'level', r.level,
              'total_xp', r.total_xp
            ) ORDER BY r.rank
          )::jsonb,
          '[]'::jsonb
        )
        from v_ranked r
      ) AS rows,
      (select rank from v_own) AS own_rank,
      (select total_xp from v_own) AS own_total_xp,
      (select level from v_own) AS own_level,
      (select full_name from v_own) AS own_full_name,
      (select xp_to_next_rank from v_own) AS xp_to_next_rank
  )
  select jsonb_build_object(
    'rows', v_shape.rows,
    'own_rank', v_shape.own_rank,
    'own_total_xp', v_shape.own_total_xp,
    'own_level', v_shape.own_level,
    'own_full_name', v_shape.own_full_name,
    'xp_to_next_rank', v_shape.xp_to_next_rank
  )
  from v_shape;
$$;

revoke execute on function public.ppg_xp_leaderboard()
  from public, anon, authenticator, supabase_auth_admin;

grant execute on function public.ppg_xp_leaderboard()
  to service_role, authenticated;

comment on function public.ppg_xp_leaderboard() is
  'PPGA #12: the XP leaderboard (ADR-0001) — rank + full_name + Level + total_xp of ALL Learners (the deterministic rank: XP desc, name asc, stable id asc; a 0-XP Learner shows Level 1, 0 XP) + the CALLER''s own row WITH the xp_to_next_rank (the rank above minus own; the top Learner gets NULL — the design''s choice, no one above them; a non-Learner CALLER gets the NULLs). The visible-to-all rule the EXECUTE grant IS the RLS (any authenticated learner/teacher/admin reads; the pre-test gate never gates this). The output shape ONLY rank/name/level/total_xp + own_* — rubric/knowledge/pretest/posttest/score/winner/prize fields NEVER appear; Prizes stay offline.';
