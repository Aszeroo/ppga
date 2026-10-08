import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readLeaderboardViaRpc } from '../../../lib/sup/leaderboard'
import { Badge } from '../../../components/Badge'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #12 XP leaderboard page, #54 V3 dressing (presentation only — the
 * RPC reads, the rank/Level/XP shape, the own-row semantics and the ADR-0001
 * "scores never appear" rule are UNCHANGED): the ranked table wearing the
 * gallery's `#s-board` frame — the podium (the gold/silver/bronze column
 * over the REAL rank 1..3 rows only, the pixel avatar circle beside) + the
 * rank-row list (the gold numeral rank tile + the LV chip + the XP figure)
 * with the CALLER's own row in the pink highlight (the `data-ppg-own` marker
 * + the success Badge's/StatusPill's copy — state never colour alone). The
 * XP-to-next-rank line stays (the rank above minus own; the top Learner
 * null). Rubric/knowledge/pre/post results NEVER appear (the RPC's shape is
 * rank/name/level/total_xp ONLY). `force-dynamic` because the page reads
 * through the session JWT. `leaderboard.states.*`, `leaderboard.rank/level/
 * xp/yourRow/topNote/gap/linkDashboard/fallbackSuspense` ride `messages`;
 * the NEW copy (`leaderboard.weekSub`) rides the same file in BOTH locales.
 */
export const dynamic = 'force-dynamic'

async function LeaderTable() {
  const t = await getTranslations('leaderboard')
  const state = await readLeaderboardViaRpc()
  const rows = state.rows ?? []
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  return (
    <section aria-label={t('tableLabel')} className="ppg-page-wrap">
      {state.status === 'ok' && rows.length ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--ppg-space-3)',
          }}
        >
          <h1
            className="ppg-heading ppg-heading-text"
            style={{
              fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)',
              color: 'var(--ppg-pink-300)',
              fontSize: '28px',
              fontWeight: 800,
            }}
          >
            {t('tableLabel')}
          </h1>
          <p style={{ color: 'var(--ppg-muted)' }} className="ppg-card-text">
            {t('weekSub')}
          </p>
        </div>
      ) : null}

      {podium.length ? (
        <div className="ppg-podium" aria-label={t('tableLabel')}>
          {podium.map((row, i) => (
            <div
              className="ppg-pod"
              data-ppg-pod-position={String(i + 1)}
              key={row.rank}
              aria-label={`${t('rank')} ${row.rank} — ${row.full_name}: ${t('level')} ${row.level}, ${t('xp')} ${row.total_xp}`}
            >
              <span className="ppg-pod-avatar" aria-hidden="true">
                🧑‍🎓
              </span>
              <span>{row.full_name}</span>
              <span style={{ fontWeight: 800 }}>
                {row.total_xp} {t('xp')}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {rest.length ? (
        <div className="ppg-board-list">
          {rest.map((row) => (
            <div
              className="ppg-board-item"
              data-ppg-own={state.ownRank === row.rank ? 'true' : undefined}
              key={row.rank}
              aria-label={`${t('rank')} ${row.rank} — ${row.full_name}: ${t('level')} ${row.level}, ${t('xp')} ${row.total_xp}`}
            >
              <span className="ppg-xp-numeral ppg-stage-numeral" aria-hidden="true">
                {row.rank}
              </span>
              <span style={{ flex: 1, fontWeight: 700 }}>{row.full_name}</span>
              <Badge text={`LV ${row.level}`} tone="success" />
              <span style={{ fontWeight: 800 }}>
                {row.total_xp} {t('xp')}
              </span>
              {state.ownRank === row.rank ? <StatusPill tone="success" label={t('yourRow')} /> : null}
              {state.ownRank === row.rank && state.xpToNextRank === null ? (
                <p>{t('topNote')}</p>
              ) : null}
              {state.ownRank === row.rank && typeof state.xpToNextRank === 'number' ? (
                <p>
                  {t('gap', { n: String(state.xpToNextRank), r: String(row.rank - 1) })}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link className="ppg-link" href="/">{t('linkDashboard')}</Link>
      </p>
    </section>
  )
}

export default async function LeaderboardPage() {
  const t = await getTranslations('leaderboard')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LeaderTable />
    </Suspense>
  )
}