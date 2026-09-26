import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'

/**
 * Ticket #12 XP leaderboard server module: the rank + full_name + Level +
 * XP for all Learners (the DATABASE's `ppg_xp_leaderboard` — the
 * deterministic tie-break the XP desc, name asc, stable id asc speaks; the
 * CALLER's own row WITH the XP-to-next-rank (the rank above minus own; the
 * top Learner gets null — no one above them to overtake; a non-Learner
 * CALLER reaches the nulls), the ADR-0001 rules hold here: the output
 * shape is rank + name + Level + XP ONLY — rubric/knowledge/pre-test/
 * post-test/score/winner/prize fields NEVER ride out (the RPC never selects
 * `ppg_prettest_attempts`, the `ppg_self_check_events` grade, the
 * `ppg_mission_scores` — no ever a browser learns another learner's score)
 * . The visible-to-all rule: the EXECUTE grant IS the RLS — any
 * authenticated learner/teacher/admin reads the board (the pre-test gate
 * NEVER gates this screen; a locked-content Learner still sees the ranking).
 * The browser never reaches the service-role key; every call carries the
 * request's user JWT. Missing env yields `not-configured` so the app shows
 * the state, never crashes.
 */
export interface LeaderboardRow {
  rank: number
  full_name: string
  level: number
  total_xp: number
}

export interface LeaderboardState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'unauthorized'
    | 'not-configured'
  detail?: string
  rows?: Array<LeaderboardRow>
  /** The CALLER's own rank (null = not on the board; the top Learner is 1). */
  ownRank?: number | null
  ownTotalXp?: number | null
  ownLevel?: number | null
  ownFullName?: string | null
  /**
   * The XP-to-next-rank (the rank above minus own). Null = the design's
   * choice at the top (no one above you) or a non-Learner CALLER.
   */
  xpToNextRank?: number | null
}

/**
 * The session client factory for a leaderboard call. The user's JWT (from
 * the request's cookie jar) is the only authority; we do NOT use the
 * service-role key (it bypasses RLS). Missing env yields `null` so the
 * caller shows "not-configured" instead of crashing. The jar is resolved
 * before the (sync) storage callback is built (`next/headers` is async).
 */
async function createSupaSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url || !anonKey) return null

  const jar = await cookies()
  return createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      storage: {
        isServer: true as const,
        getItem: (key: string) => jar.get(key)?.value ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  })
}

/**
 * The XP leaderboard read: the rank + full_name + Level + XP of ALL
 * Learners (the RPC's jsonb — the learner-visible shape; an other learner's
 * NAME/Level/XP IS the ADR's intended content, the score fields NEVER).
 * The CALLER's own row + the XP-to-next-rank ride the scalars (a top
 * Learner's `xp_to_next_rank` is null — no one above them to catch; a
 * non-Learner CALLER's own_* ride null too). `empty` = no Learner rows
 * server-side (the board never seeded); `error`/`denied`/`unauthorized`
 * ride the RPC's own error text. No fake behavior (the state is the
 * ledger's read, never a client count; the rank the DATABASE speaks).
 */
export async function readLeaderboardViaRpc(): Promise<LeaderboardState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_xp_leaderboard', {} as never)

  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes('permission_denied')) return { status: 'denied', detail: error.message }
    if (m.includes('violates row-level security')) return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const shape = data as {
    rows?: Array<LeaderboardRow>
    own_rank?: number | null
    own_total_xp?: number | null
    own_level?: number | null
    own_full_name?: string | null
    xp_to_next_rank?: number | null
  }

  if (!shape || !Array.isArray(shape.rows) || shape.rows.length === 0)
    return { status: 'empty', detail: 'no learner rows server-side (the board never seeded)' }

  return {
    status: 'ok',
    rows: shape.rows,
    ownRank: shape.own_rank ?? null,
    ownTotalXp: shape.own_total_xp ?? null,
    ownLevel: shape.own_level ?? null,
    ownFullName: shape.own_full_name ?? null,
    xpToNextRank: shape.xp_to_next_rank ?? null,
  }
}
