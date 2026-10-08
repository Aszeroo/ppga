import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readOwnProfile } from '../../../lib/sup/profile'
import { Badge } from '../../../components/Badge'

/**
 * Ticket #3 profile page, #54 V3 dressing (presentation only — the read,
 * the RLS authority, the state machine and the copy namespaces are
 * UNCHANGED): the learner's own row wearing the gallery's `#s-profile`
 * frame — the gradient avatar circle, the name + the real `student_id`
 * beside the enrollment line, the role chip (the Shell's own role icon +
 * the Shell's verbatim role label, state/icon + text together) and the
 * account card carrying the shipped links. The design's XP/level/badge
 * STAT TILES never render: `readOwnProfile` reads name/role/locale only and
 * no XP/award read exists on this page — invented numbers would fabricate
 * data (the null-guard rule), so the hero carries only the REAL row.
 * `force-dynamic` because `next/headers` cookies are read here and
 * `next build` must never pre-render a snapshot of someone's profile.
 *
 * Ticket #4: the state copy moves into messages (`profile.states.ok`,
 * `profile.states.empty`, `profile.states.error`,
 * `profile.states.unauthorized`, `profile.states.notConfigured`,
 * `profile.links`, `profile.fallbackSuspense`) — so every state of the page
 * speaks the selected language, and the missing-key fallback chain speaks when
 * a state's copy is not carried by either locale. The V3 dressing's NEW copy
 * (`profile.heroTitle/enrolled/editLabel`) rides the same file in BOTH locales.
 */
export const dynamic = 'force-dynamic'

/* The Shell's own role presentation (icon + the verbatim `shell` copy key)
   — presentation mapping only, never a new label. */
const ROLE_ICON: Record<'learner' | 'teacher' | 'admin', string> = {
  learner: '🎓',
  teacher: '🧑‍🏫',
  admin: '🛡️',
}
const ROLE_COPY: Record<'learner' | 'teacher' | 'admin', 'userLearner' | 'userTeacher' | 'userAdmin'> = {
  learner: 'userLearner',
  teacher: 'userTeacher',
  admin: 'userAdmin',
}

async function ProfileContent() {
  const t = await getTranslations('profile')
  const ts = await getTranslations('shell')
  const state = await readOwnProfile()
  const row = state.row
  return (
    <section aria-label={t('heading')} className="ppg-page-wrap">
      {state.status === 'ok' && row ? (
        <div className="ppg-profile-hero">
          <span className="ppg-profile-avatar" aria-hidden="true">
            🧑‍🎓
          </span>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)',
                color: 'var(--ppg-ink)',
                fontSize: '24px',
                fontWeight: 800,
              }}
            >
              {row.full_name || t('heroTitle')}
            </h1>
            <p className="ppg-card-text">
              {t('heroTitle')} · {t('enrolled')} — {row.student_id}
            </p>
            <p style={{ display: 'flex', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
              <Badge
                text={`${ROLE_ICON[row.role]} ${ts(ROLE_COPY[row.role])}`}
                tone="neutral"
              />
              <Badge text={`🌐 ${row.locale}`} tone="neutral" />
            </p>
          </div>
        </div>
      ) : null}
      {state.status === 'ok' ? (
        <div className="ppg-status-card ppg-strip-top">
          <h2 className="ppg-status-card-title">{t('editLabel')}</h2>
          <p className="ppg-hero-cta-row">
            <Link className="ppg-cta" href="/change-password">{t('links')}</Link>
          </p>
          <p className="ppg-hero-cta-row">
            <Link className="ppg-link" href="/logout">{t('links')}</Link>
            {' · '}
            <Link className="ppg-link" href="/login">{t('links')}</Link>
          </p>
        </div>
      ) : null}
      {state.status === 'empty' ? <p className="ppg-state-line">{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p className="ppg-state-line">{t('states.error')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

export default async function ProfilePage() {
  const t = await getTranslations('profile')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <ProfileContent />
    </Suspense>
  )
}
