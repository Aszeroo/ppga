import { Suspense } from 'react'

import { readOwnProfile } from '../../lib/sup/profile'

/**
 * Ticket #3 profile page: name + role only (Level/XP arrive later). It reads
 * the Postgres with the learner's own JWT so RLS is the real authority — an
 * empty result is "unauthorized/empty", never a blank screen; every state has
 * its own copy. `force-dynamic` because `next/headers` cookies are read here
 * and `next build` must never pre-render a snapshot of someone's profile.
 */
export const dynamic = 'force-dynamic'

async function ProfileContent() {
  const state = await readOwnProfile()
  return (
    <section>
      {state.status === 'ok' ? (
        <p>
          {state.row?.full_name} ({state.row?.role}) — /profile
        </p>
      ) : null}
      {state.status === 'empty' ? <p>No profile row: {state.detail}</p> : null}
      {state.status === 'error' ? <p>Error: {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>Sign in first: {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{state.detail}</p> : null}
      <p>
        <a href="/change-password">Change password</a> ·{' '}
        <a href="/logout">Logout</a> ·{' '}
        <a href="/login">Login</a>
      </p>
    </section>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div>Reading your profile…</div>}>
      <ProfileContent />
    </Suspense>
  )
}
