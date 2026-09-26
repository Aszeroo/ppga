import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { readLeaderboardViaRpc } from '../../../lib/sup/leaderboard'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'

/**
 * Ticket #12 XP leaderboard page: the ranked table — rank + full_name +
 * Level + total_xp of ALL Learners (the `ppg_xp_leaderboard` RPC — the
 * deterministic rank the DATABASE speaks: XP desc, name asc, stable id
 * asc; a 0-XP Learner shows Level 1, 0 XP, never a missing row) + the
 * CALLER's own row highlighted WITH the "N XP to take #R" line (the
 * XP-to-next-rank the rank above minus own; the top Learner gets null —
 * no one above them, `leaderboard.topNote`). The ADR-0001 rule: rubric
 * scores, knowledge scores, the pre/post results NEVER appear (the RPC's
 * output shape is rank/name/level/total_xp ONLY — no ever a browser
 * learns another learner's score); Prizes stay offline (no winner state
 * anywhere in the app). Visible to ALL Learners (the EXECUTE grant IS
 * the RLS; the pre-test gate never gates this screen — a locked-content
 * Learner still sees the ranking). The own-row highlight is the
 * success-Badge's text+aria-label, never colour-alone. Loading/empty/
 * error states (`leaderboard.states.*`) have their own copy in
 * `messages`; the link back is the dashboard. `force-dynamic` because
 * the page reads through the session JWT.
 */
export const dynamic = 'force-dynamic'

async function LeaderTable() {
  const t = useTranslations('leaderboard')
  const state = await readLeaderboardViaRpc()

  return (
    <section aria-label={t('tableLabel')}>
      {state.status === 'ok' && state.rows
        ? state.rows.map((row) => (
          <section
            key={row.rank}
            aria-label={`${t('rank')} ${row.rank} — ${row.full_name}: ${t('level')} ${row.level}, ${t('xp')} ${row.total_xp}`}
          >
            <Card
              heading={`${t('rank')} ${row.rank} — ${row.full_name}`}
              body={`${t('level')} ${row.level} · ${t('xp')} ${row.total_xp}`}
              status="available"
            />
            {state.ownRank === row.rank ? <Badge text={t('yourRow')} tone="success" /> : null}
            {state.ownRank === row.rank && state.xpToNextRank === null ? (
              <p>{t('topNote')}</p>
            ) : null}
            {state.ownRank === row.rank && typeof state.xpToNextRank === 'number' ? (
              <p>
                {t('gap', { n: String(state.xpToNextRank), r: String(row.rank - 1) })}
              </p>
            ) : null}
          </section>
        ))
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/">{t('linkDashboard')}</Link>
      </p>
    </section>
  )
}

export default function LeaderboardPage() {
  const t = useTranslations('leaderboard')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LeaderTable />
    </Suspense>
  )
}
