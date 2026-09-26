import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { readBadgeGalleryViaRpc } from '../../../lib/sup/missions'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #11 Badge gallery: every badge + the CALLER's earned/locked
 * state WITH its bilingual criteria text shown in BOTH states (the
 * `ppg_badge_gallery` RPC — the earned/locked is the CALLER's own awards
 * read under the definer's rights, an other learner's earned-state
 * never rides out). Earned = the award row exists (a real achievement's
 * record, never a fake award); LOCKED = no award yet (the criteria stay
 * VISIBLE anyway — the state is announced by the text + the
 * StatusPill's/Badge's aria-label, never by the colour alone).
 * `force-dynamic` because the page reads through the session JWT. Every
 * state (`badge.title`, `badge.intro`, `badge.critera`,
 * `badge.earned/locked`, `badge.states.*`, `badge.linkMap`,
 * `badge.fallbackSuspense`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function GalleryList() {
  const t = useTranslations('badge')
  const locale = useLocale()
  const state = await readBadgeGalleryViaRpc()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('title')}>
      {state.status === 'ok' && state.badges
        ? state.badges
          .sort((a, b) => a.badge_key.localeCompare(b.badge_key))
          .map((row) => (
            <section
              key={row.badge_key}
              aria-label={`${pick(row.label_th, row.label_en)} — ${pick(row.criteria_th, row.criteria_en)}`}
            >
              <Card
                heading={pick(row.label_th, row.label_en)}
                body={`${t('criteria')}: ${pick(row.criteria_th, row.criteria_en)}`}
                status={row.earned ? 'available' : 'locked'}
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
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default function BadgeGalleryPage() {
  const t = useTranslations('badge')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <GalleryList />
    </Suspense>
  )
}
