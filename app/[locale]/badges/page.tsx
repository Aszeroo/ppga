import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readBadgeGalleryViaRpc } from '../../../lib/sup/missions'
import { BadgeCard } from '../../../components/BadgeCard'
import { Badge } from '../../../components/Badge'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #11 Badge gallery, #54 V3 dressing (presentation only — the RPC
 * reads, the earned/locked logic, the award-row semantics and the copy
 * namespaces are UNCHANGED): the CALLER's earned/locked states from the
 * `ppg_badge_gallery` RPC, each card wearing the gallery's `#s-badges`
 * idiom — the earned card's gold border, the locked card's dashed locked
 * border + the grayscale icon, the criteria shown in BOTH states (the
 * state is the card's `data-ppg-state` + the StatusPill/Badge copy+icon
 * markers beside, never the colour alone), and the count chips (All /
 * Earned / Locked) over the REAL badge rows. Earned = a real award row;
 * LOCKED = no award yet. `force-dynamic` because the page reads through the
 * session JWT. Every state (`badge.title`, `badge.intro`, `badge.criteria`,
 * `badge.earned/locked`, `badge.states.*`, `badge.linkMap`,
 * `badge.fallbackSuspense`) has its own copy in `messages`; the NEW copy of
 * the V3 dressing (`badge.gallerySub`, `badge.tagAll/Earned/Locked`) rides
 * the same file in BOTH locales.
 */
export const dynamic = 'force-dynamic'

// The gallery's own icon mapping for the badge taxonomy (presentation only:
// an earned badge is named by its real label, the pixel icon rides the key
// family the design's `#s-badges` cards pair with — never a fabricated award).
const ICON_BY_KEY: Record<string, string> = {
  first_steps: '⭐',
  mission_ready: '🎯',
  module_01_mission: '🥇',
  module_02_mission: '🥇',
  module_03_mission: '🥇',
  module_04_mission: '🥇',
  module_05_mission: '🥇',
  module_06_mission: '🥇',
  module_07_mission: '🥇',
  module_08_mission: '🥇',
  module_09_mission: '🥇',
  module_10_mission: '🥇',
  module_11_mission: '🥇',
  final_boss: '🏆',
  level_5: '👑',
  course_complete: '🎨',
}

async function GalleryList() {
  const t = await getTranslations('badge')
  const locale = await getLocale()
  const state = await readBadgeGalleryViaRpc()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const iconFor = (key: string) => ICON_BY_KEY[key] ?? '🏅'
  const rows = state.badges?.sort((a, b) => a.badge_key.localeCompare(b.badge_key)) ?? []
  const earnedCount = rows.filter((row) => row.earned).length
  const lockedCount = rows.length - earnedCount
  return (
    <section aria-label={t('title')} className="ppg-page-wrap">
      {state.status === 'ok' && rows.length ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 'var(--ppg-space-3)',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              className="ppg-heading ppg-heading-text"
              style={{
                fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)',
                color: 'var(--ppg-pink-300)',
                fontSize: '28px',
                fontWeight: 800,
              }}
            >
              {t('title')}
            </h1>
            <p style={{ color: 'var(--ppg-muted)' }} className="ppg-card-text">
              {t('gallerySub')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
            <Badge text={`${t('tagAll')} ${rows.length}`} tone="neutral" />
            <Badge text={`${t('tagEarned')} ${earnedCount}`} tone="success" />
            <Badge text={`${t('tagLocked')} ${lockedCount}`} tone="locked" />
          </div>
        </div>
      ) : null}

      <div className="ppg-hub-grid">
        {state.status === 'ok'
          ? rows.map((row) => (
            <section
              key={row.badge_key}
              aria-label={`${pick(row.label_th, row.label_en)} — ${pick(row.criteria_th, row.criteria_en)}`}
            >
              <BadgeCard
                heading={pick(row.label_th, row.label_en)}
                body={
                  row.earned
                    ? `${t('criteria')}: ${pick(row.criteria_th, row.criteria_en)}`
                    : `🔒 ${pick(row.criteria_th, row.criteria_en)}`
                }
                status={row.earned ? 'available' : 'locked'}
                icon={iconFor(row.badge_key)}
              />
              {row.earned
                ? (
                  <p>
                    <StatusPill tone="success" label={t('earned')} />
                    <Badge text={`${t('earnedBadge')} ${row.event_ref ?? ''}`} tone="success" />
                  </p>
                )
                : (
                  <p>
                    <StatusPill tone="locked" label={t('locked')} />
                    <Badge text={t('lockedBadge')} tone="locked" />
                  </p>
                )}
            </section>
          ))
          : null}
      </div>

      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default async function BadgeGalleryPage() {
  const t = await getTranslations('badge')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <GalleryList />
    </Suspense>
  )
}