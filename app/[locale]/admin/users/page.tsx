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
      {/* Ticket #8 consent: the admin sets the paper-consent flag offline (no
        in-app consent flow exists anywhere) — the same native-form pattern
        the role-change's control rides so the keyboard reaches it. The
        RPC's gate + profiles' RLS speak: a learner/teacher smuggle the
        POST as `permission_denied`, never a silently-0-row UPDATE of
        someone else's consent flag. One call = one UPDATE + one audit
        INSERT (action `consent`, details old/new consent). */}
      <form
        data-ppg-admin-form="consent"
        aria-label={t('users.setConsent')}
        method="POST"
        action="/api/admin/consent"
      >
        <label htmlFor="admin_consent_target_id">{t('users.target')}</label>
        <input id="admin_consent_target_id" name="target_id" required pattern="^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{32}$" />
        <label htmlFor="admin_consent_flag">{t('users.consentFlag')}</label>
        <select id="admin_consent_flag" name="consent" required>
          <option value="true">{t('states.consentTrue')}</option>
          <option value="false">{t('states.consentFalse')}</option>
        </select>
        <button type="submit">{t('users.submit')}</button>
      </form>
      {/* Ticket #8 unlock-override: the admin unlocks ONE learner past the
        gate for an exception — every override is audited (ADR-0002). The
        RPC's gate + the audit's append-only policies speak: a learner/
        teacher smuggle the POST as `permission_denied`, never a silent
        write. One call = one UPDATE + one audit INSERT (action
        `prettest_unlock_override`, details old/new override). */}
      <form
        data-ppg-admin-form="override"
        aria-label={t('users.unlockOverride')}
        method="POST"
        action="/api/admin/override"
      >
        <label htmlFor="admin_override_target_id">{t('users.target')}</label>
        <input id="admin_override_target_id" name="target_id" required pattern="^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{32}$" />
        <button type="submit">{t('users.unlockSubmit')}</button>
      </form>
      <p>
        <Link href="/admin/audit">{t('users.linkAuditOverride')}</Link>
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
