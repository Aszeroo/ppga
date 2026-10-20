import { readXpSummaryViaRpc } from '../lib/sup/xp'

import { getTranslations } from 'next-intl/server'

/**
 * Ticket #51: the V3 HUD chips — the gallery's `.xp` gold XP chip + `.lv` LV
 * chip (the `XPHud` keeps the #10/#41 data spine verbatim): the Level/XP
 * values are the `ppg_xp_summary` read — the learner's own XP ledger DERIVED
 * (total = the SUM; level = floor(total/100)+1; xp-to-next = level*100 -
 * total) — no fake numbers (the state is the ledger's read, never a client
 * count). The `header.progress` copy line keeps the real
 * `xp / xpToNext` numbers at every width (story #9: the learner never loses
 * bearings; the responsive sweep reads exactly this copy).
 *
 * The V3 design sheet's HUD is chip-only (the progress bar + the earned-badge
 * chips ride the dashboard cards — stage #52); the header's chips + the copy
 * line keep the REAL state with the same loading/empty/error copy
 * (`header.states.*`). The `⭐` + `XP` + `LV` are the design sheet's literal
 * marks (the `lv`/`xp` allowlist in `scripts/validate-thai.py`); the
 * announcement stays the full `header.level` label on the chip.
 *
 * The LV chip's `ppg-ring` pulse + the strip pixels ride `app/globals.css`
 * (tokens only — zeroed under `prefers-reduced-motion`); state is never
 * colour-alone: every chip carries its text + the ARIA label.
 */
export async function XPHud() {
  const t = await getTranslations('header')
  const summary = await readXpSummaryViaRpc()
  const xp = summary.totalXp ?? 0
  const level = summary.level ?? 1
  return (
    <section aria-label={t('label')} className="ppg-hud">
      {summary.status === 'ok' ? (
        <>
          <span className="ppg-xp-chip">
            <span aria-hidden="true">⭐</span> {xp} {t('xpUnit')}
          </span>
          <span className="ppg-level-chip" role="img" aria-label={`${t('level')} ${level}`}>
            <i className="ppg-level-chip-label">{t('levelChip')}</i>
            <b className="ppg-level-chip-number">{level}</b>
          </span>
          <span className="ppg-hud-progress">
            {t('progress')} {xp} / {summary.xpToNext ?? 100}
          </span>
        </>
      ) : null}
      {summary.status === 'not-configured' ? <span>{t('states.notConfigured')} {summary.detail}</span> : null}
      {summary.status === 'unauthorized' ? <span>{t('states.unauthorized')} {summary.detail}</span> : null}
      {summary.status === 'error' ? <span>{t('states.error')} {summary.detail}</span> : null}
    </section>
  )
}
