import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../../lib/i18n/routing'

import { listUsersViaRpc, type UsersState } from '../../../../lib/sup/admin'

/**
 * Ticket #6 user list: the admin console's roster (the student-ID handle +
 * full name + the role, paginated page-20) and the role-change control.
 * `force-dynamic` because the page reads the roster through the RPC with the
 * request's session JWT — `next build` must never pre-render someone else's
 * roster. A teacher/learner who reaches the pathname is denied by the RPC's
 * gate + profiles' RLS, never a blank screen or a UI-only hide; every state
 * (`admin.users.list`, `admin.states.{ok|empty|error|denied|unauthorized|
 * notConfigured}`) has its own copy in `messages`.
 *
 * The design system: the row states ride `Card` + `StatusPill` faces in the
 * console's later iteration; this v1 ships the roster + the form's native
 * elements so the keyboard reaches the control (login page's pattern).
 */
export const dynamic = 'force-dynamic'

async function UsersList() {
  const t = useTranslations('admin')
  const state = await listUsersViaRpc(0)
  return (
    <section aria-label={t('users.list')}>
      {state.status === 'ok' ? (
        state.rows?.map((row: NonNullable<UsersState['rows']>[0]) => (
          <p key={row.id}>
            {row.student_id} — {row.full_name} ({row.role})
          </p>
        ))
      ) : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function RoleChangeControl() {
  const t = useTranslations('admin')
  return (
    <section>
      <form
        data-ppg-admin-form="role-change"
        aria-label={t('users.changeRole')}
        method="POST"
        action="/api/admin/role"
      >
        <label htmlFor="admin_target_id">{t('users.target')}</label>
        <input id="admin_target_id" name="target_id" required pattern="^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{32}$" />
        <label htmlFor="admin_new_role">{t('users.newRole')}</label>
        <select id="admin_new_role" name="new_role" required>
          <option value="learner">{t('roles.learner')}</option>
          <option value="teacher">{t('roles.teacher')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
        <button type="submit">{t('users.submit')}</button>
      </form>
      <p>
        <Link href="/admin/audit">{t('users.linkAudit')}</Link>
      </p>
      <p>
        <Link href="/admin/provisioning">{t('provisioning.linkProvision')}</Link>
      </p>
    </section>
  )
}

export default function AdminUsersPage() {
  const t = useTranslations('admin')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <UsersList />
      <RoleChangeControl />
    </Suspense>
  )
}
