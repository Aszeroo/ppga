"use client"

import { Suspense } from 'react'

import { Link } from '../../../lib/i18n/routing'
import { useTranslations } from 'next-intl'

import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { ProgressBar } from '../../../components/ProgressBar'
import { StatusPill } from '../../../components/StatusPill'
import { XPBar } from '../../../components/XPBar'

/**
 * Ticket #5 component gallery: every primitive from `components/` is demoed
 * live in the active language (`gallery.*` keys exist in `th.json` +
 * `en.json`) so the pixel design system is demoable in both. The buttons
 * carry the `available / locked / warning / error` state variants — a state
 * is announced by its `aria-label` text + the stripe/`aria-disabled`, never
 * by the colour alone — and the XP/progress bars carry the heading-role
 * `--font-ta16bit` numerals so the single-token swap point is visible on the
 * page, not only in `app/globals.css`.
 *
 * No ad-hoc colour here: the page's body role comes from `app/globals.css`
 * (`body { font-family: var(--font-mitr) }`) and the components are the ones
 * carrying the tokens. The `Link` keeps the locale prefix on the health link
 * (the explicit `/en` switch works everywhere). The `:root` token block in
 * `app/globals.css` is the single place the palette is defined; this page
 * consumes it via the component props only.
 */
export default function GalleryPage() {
  const t = useTranslations('gallery')

  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        <section>
          <h1 className="ppg-heading ppg-heading-text" style={{ fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}>
            {t('title')}
          </h1>
          <p className="ppg-card-text">{t('intro')}</p>
        </section>

        <section>
          <Button label={t('button.available')} status="available" tone="primary" />
          <Button label={t('button.locked')} status="locked" />
          <Button label={t('button.warning')} status="warning" tone="accent" />
          <Button label={t('button.error')} status="error" tone="danger" />
        </section>

        <section>
          <Card heading={t('card.heading')} body={t('card.body')} />
          <Card heading={t('card.lockedHeading')} body={t('card.lockedBody')} status="locked" />
        </section>

        <section>
          <Badge text={t('badge.success')} tone="success" />
          <Badge text={t('badge.warning')} tone="warning" />
          <Badge text={t('badge.error')} tone="error" />
          <Badge text={t('badge.locked')} tone="locked" />
          <Badge text={t('badge.neutral')} tone="neutral" />
        </section>

        <section>
          <StatusPill label={t('pill.success')} tone="success" />
          <StatusPill label={t('pill.warning')} tone="warning" />
          <StatusPill label={t('pill.error')} tone="error" />
          <StatusPill label={t('pill.locked')} tone="locked" />
        </section>

        <section>
          <ProgressBar value={68} />
          <XPBar xp={138} level={2} />
        </section>

        <section>
          <Link href="/health">{t('healthLink')}</Link>
        </section>
      </main>
    </Suspense>
  )
}
