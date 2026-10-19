import { readXpSummaryViaRpc } from '../lib/sup/xp'

import { getTranslations } from 'next-intl/server'

import { XPBar } from './XPBar'
import { ProgressBar } from './ProgressBar'
import { Badge } from './Badge'

/**
 * Ticket #10 header, PPGA #41 stage 1: the component was misnamed `Header`
 * while it is the gamified HUD's XP/Level/Badge display — the issue's
 * Solution names it as the HUD bar's player display. It is renamed here to
 * `XPHud` per the issue's Implementation Decision ("the existing XP/Level/
 * Badge display component, renamed to a clear name such as XPHud"); the
 * `header` message namespace and all `header.*` keys stay unchanged — a
 * component-name change, never a copy-key change (the journey's `t` reads
 * `header.label`, `header.level`, `header.progress`, `header.badge` verbatim).
 *
 * Ticket #10 header: the real Level/XP/progress the gamified spine shows.
 * The XP/Level/progress are the `ppg_xp_summary` read — the learner's own
 * XP ledger DERIVED (total = the SUM; level = floor(total/100)+1;
 * xp-to-next = level*100 - total; progress = remainder/100) — no fake
 * numbers (the state is the ledger's read, never a client count; the
 * client never decides what Level a learner holds). The earned badges ride
 * the awards (a real achievement's record: the First Steps badge lands on
 * the first Self-Check pass event, never a fake award). The definer's
 * rights are FILTERED to the CALLER's own rows — an other learner's XP/
 * Level never appears. Loading/empty/error states (`header.states.*`)
 * have their own copy in `messages`; the numeral + bar roles reuse the
 * gallery's XP/progress primitives (`XPBar`, `ProgressBar`) so a
 * single-token swap re-tunes the digits once.
 */
export async function XPHud() {
  const t = await getTranslations('header')
  const summary = await readXpSummaryViaRpc()
  const xp = summary.totalXp ?? 0
  const level = summary.level ?? 1
  const progress = summary.progressPct ?? 0
  return (
    <section aria-label={t('label')}>
      {summary.status === 'ok' ? (
        <>
          <span>{t('level')} {level}</span>
          <XPBar xp={xp} level={level} />
          <ProgressBar value={progress} />
          <span>{t('progress')} {xp} / {summary.xpToNext ?? 100}</span>
          {summary.badges?.map((b) => (
            <Badge key={b.badge_key} text={`${t('badge')} ${b.badge_key}`} tone="success" />
          ))}
        </>
      ) : null}
      {summary.status === 'not-configured' ? <span>{t('states.notConfigured')} {summary.detail}</span> : null}
      {summary.status === 'unauthorized' ? <span>{t('states.unauthorized')} {summary.detail}</span> : null}
      {summary.status === 'error' ? <span>{t('states.error')} {summary.detail}</span> : null}
    </section>
  )
}