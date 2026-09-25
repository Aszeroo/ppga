import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { readOwnProfile } from '../../../lib/sup/profile'

/**
 * Ticket #3 profile page: name + role + the remembered locale only (Level/XP
 * arrive later). It reads the Postgres with the learner's own JWT so RLS is the
 * real authority — an empty result is "unauthorized/empty", never a blank
 * screen; every state has its own copy. `force-dynamic` because `next/headers`
 * cookies are read here and `next build` must never pre-render a snapshot of
 * someone's profile.
 *
 * Ticket #4: the state copy moves into messages (`profile.states.ok`,
 * `profile.states.empty`, `profile.states.error`,
 * `profile.states.unauthorized`, `profile.states.notConfigured`,
 * `profile.links`, `profile.fallbackSuspense`) — so every state of the page
 * speaks the selected language, and the missing-key fallback chain speaks when
 * a state's copy is not carried by either locale.
 */
export const dynamic = 'force-dynamic'

async function ProfileContent() {
  const t = useTranslations('profile')
  const state = await readOwnProfile()
  return (
    <section>
      {state.status === 'ok' ? (
        <p>
          {state.row?.full_name} ({state.row?.role}) · {state.row?.locale} — {t('heading')}
        </p>
      ) : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/change-password">{t('links')}</Link> ·{' '}
        <Link href="/logout">{t('links')}</Link> ·{' '}
        <Link href="/login">{t('links')}</Link>
      </p>
    </section>
  )
}

export default function ProfilePage() {
  const t = useTranslations('profile')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <ProfileContent />
    </Suspense>
  )
}
