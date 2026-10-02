"use client"

import { Suspense } from 'react'

import { Link } from '../../../lib/i18n/routing'
import { useTranslations } from 'next-intl'

import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { MenuWrap } from '../../../components/MenuWrap'
import { ProgressBar } from '../../../components/ProgressBar'
import { StageMap } from '../../../components/StageMap'
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
  const tNav = useTranslations('nav')
  const tShell = useTranslations('shell')
  const tCourse = useTranslations('course')

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

        {/**
         * PPGA #41 stage 3: the Course Map's stage-road primitives demoed
         * live — the ordered `.ppg-stage-map` of `.ppg-stage-node`s in all
         * three states (a cleared node with its mark, the open frontier node
         * with the `data-ppg-stage-current` marker + next chip, a locked node
         * with the stripes + `aria-disabled` and NO link). The demo carries
         * the real `course.states.*` copy; the hrefs are inert `/course`
         * routes (the live map links each stage's own module).
         */}
        <section>
          <h2 className="ppg-heading ppg-heading-text" style={{ fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}>
            {t('stageMap.heading')}
          </h2>
          <StageMap
            mapLabel={tCourse('mapLabel')}
            stages={[
              {
                moduleKey: 'demo-01',
                orderIndex: 1,
                title: t('stageMap.stage1'),
                summary: t('card.body'),
                state: 'cleared',
                stateCopy: tCourse('states.cleared'),
                href: '/course',
              },
              {
                moduleKey: 'demo-02',
                orderIndex: 2,
                title: t('stageMap.stage2'),
                summary: t('card.body'),
                state: 'open',
                stateCopy: tCourse('states.open'),
                isNext: true,
                nextCopy: tCourse('currentStage'),
                href: '/course',
              },
              {
                moduleKey: 'demo-03',
                orderIndex: 3,
                title: t('stageMap.stage3'),
                summary: t('card.body'),
                state: 'locked',
                stateCopy: tCourse('states.locked'),
              },
            ]}
          />
        </section>

        {/**
         * PPGA #41 stages 1–2: the Shell's new primitives demoed live — the
         * role-gated nav item face (`.ppg-nav-item`) + the accessible mobile
         * collapse (`MenuWrap`: the `#ppg-menu-toggle` button carries
         * `aria-expanded`, keyboard-operable with the token focus ring; the
         * items hide on small screens until it opens — never colour-only).
         * The demo items are inert spans (the real nav links the role list
         * server-side — this is the design-system demo).
         */}
        <section>
          <nav aria-label={tShell('navLabel')} id="ppg-nav-menu-demo">
            <MenuWrap
              menuId="ppg-nav-menu-demo"
              toggleId="ppg-menu-toggle-demo"
              labels={{
                menuLabel: tShell('menuLabel'),
                openLabel: tShell('menuOpenLabel'),
                closeLabel: tShell('menuCollapseLabel'),
              }}
            >
              {(['home', 'course', 'badges', 'leaderboard', 'profile'] as const).map((key) => (
                <span
                  key={key}
                  className="ppg-nav-item"
                  style={{
                    display: 'inline-block',
                    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
                    color: 'var(--ppg-fg-heading)',
                    padding: 'var(--ppg-space-2) var(--ppg-space-3)',
                    borderWidth: 'var(--ppg-border-2)',
                    borderColor: 'var(--ppg-blue-300)',
                    borderStyle: 'solid',
                    boxShadow: 'var(--ppg-shadow-pixel-1)',
                    backgroundColor: 'var(--ppg-state-available-bg)',
                  }}
                >
                  {tNav(key)}
                </span>
              ))}
            </MenuWrap>
          </nav>
        </section>

        <section>
          <Link href="/health">{t('healthLink')}</Link>
        </section>
      </main>
    </Suspense>
  )
}
