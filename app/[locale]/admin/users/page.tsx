import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { listUsersViaRpc, type UsersState } from '../../../../lib/sup/admin'
import { Badge } from '../../../../components/Badge'

/**
 * Ticket #6 user list, #55 V3 utilitarian dressing (presentation only — the
 * RPC reads, the native forms and their fields/patterns/actions are
 * BYTE-IDENTICAL): the admin console's roster wearing the gallery's `#a-users`
 * frame — the heading block + the roster table (the student-ID handle + full
 * name, the role as the copy+chip Badge — state never colour alone) + the
 * role-change, consent and unlock-override panels. `force-dynamic` because
 * the page reads the roster through the RPC with the request's session JWT —
 * `next build` must never pre-render someone else's roster. A teacher/learner
 * who reaches the pathname is denied by the RPC's gate + profiles' RLS, never
 * a blank screen or a UI-only hide; every state (`admin.users.list`,
 * `admin.states.*`) has its own copy in `messages`.
 *
 * The design system: the roster rides the shipped `.ppg-table` console face,
 * the panels the `.ppg-work-card` face, the fields the `.ppg-input` face.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
async function UsersList() {
  const t = await getTranslations('admin')
  const state = await listUsersViaRpc(0)
  return (
    <section aria-label={t('users.list')} className="ppg-work-card">
      <h2 className="ppg-list-title">{t('users.list')}</h2>
      {state.status === 'ok' ? (
        <div className="ppg-table-wrap">
          <table className="ppg-table">
            <thead>
              <tr>
                <th scope="col">{t('users.colUser')}</th>
                <th scope="col">{t('users.colRole')}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows?.map((row: NonNullable<UsersState['rows']>[0]) => (
                <tr key={row.id}>
                  <td>
                    {row.student_id} — {row.full_name}
                  </td>
                  <td>
                    <Badge
                      tone="neutral"
                      text={
                        row.role === 'teacher'
                          ? t('roles.teacher')
                          : row.role === 'admin'
                            ? t('roles.admin')
                            : t('roles.learner')
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {state.status === 'empty' ? <p className="ppg-state-line">{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p className="ppg-state-line">{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p className="ppg-state-line">{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function RoleChangeControl() {
  const t = await getTranslations('admin')
  // PPGA #18 (finding #6, second site): the uuid `pattern` as shipped demanded
  // `[0-9a-f]{32}` as the LAST segment — no real uuid has 32 trailing hex
  // digits, so the admin's target_id NEVER passed the browser's constraint
  // validation, the native form submit silently never fired, and the consent
  // POST never happened (the journey hung on the missing response). The shape
  // is the standard 8-4-4-4-12 now; the RPC's own uuid cast stays the
  // authority server-side, unchanged.
  return (
    <>
      <section className="ppg-work-card">
        <h2 className="ppg-list-title">{t('users.changeRole')}</h2>
        <form
          data-ppg-admin-form="role-change"
          className="ppg-work-form"
          aria-label={t('users.changeRole')}
          method="POST"
          action="/api/admin/role"
        >
          <label className="ppg-field-label" htmlFor="admin_target_id">{t('users.target')}</label>
          <input className="ppg-input" id="admin_target_id" name="target_id" required pattern="^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" />
          <label className="ppg-field-label" htmlFor="admin_new_role">{t('users.newRole')}</label>
          <select className="ppg-input" id="admin_new_role" name="new_role" required>
            <option value="learner">{t('roles.learner')}</option>
            <option value="teacher">{t('roles.teacher')}</option>
            <option value="admin">{t('roles.admin')}</option>
          </select>
          <button className="ppg-btn-secondary" type="submit">{t('users.submit')}</button>
        </form>
        <p>
          <Link className="ppg-link" href="/admin/audit">{t('users.linkAudit')}</Link>
        </p>
        <p>
          <Link className="ppg-link" href="/admin/provisioning">{t('provisioning.linkProvision')}</Link>
        </p>
      </section>
      {/* Ticket #8 consent: the admin sets the paper-consent flag offline (no
        in-app consent flow exists anywhere) — the same native-form pattern
        the role-change's control rides so the keyboard reaches it. The
        RPC's gate + profiles' RLS speak: a learner/teacher smuggle the
        POST as `permission_denied`, never a silently-0-row UPDATE of
        someone else's consent flag. One call = one UPDATE + one audit
        INSERT (action `consent`, details old/new consent). */}
      <section className="ppg-work-card">
        <h2 className="ppg-list-title">{t('users.setConsent')}</h2>
        <form
          data-ppg-admin-form="consent"
          className="ppg-work-form"
          aria-label={t('users.setConsent')}
          method="POST"
          action="/api/admin/consent"
        >
          <label className="ppg-field-label" htmlFor="admin_consent_target_id">{t('users.target')}</label>
          <input className="ppg-input" id="admin_consent_target_id" name="target_id" required pattern="^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" />
          <label className="ppg-field-label" htmlFor="admin_consent_flag">{t('users.consentFlag')}</label>
          <select className="ppg-input" id="admin_consent_flag" name="consent" required>
            <option value="true">{t('states.consentTrue')}</option>
            <option value="false">{t('states.consentFalse')}</option>
          </select>
          <button className="ppg-btn-secondary" type="submit">{t('users.submit')}</button>
        </form>
      </section>
      {/* Ticket #8 unlock-override: the admin unlocks ONE learner past the
        gate for an exception — every override is audited (ADR-0002). The
        RPC's gate + the audit's append-only policies speak: a learner/
        teacher smuggle the POST as `permission_denied`, never a silent
        write. One call = one UPDATE + one audit INSERT (action
        `prettest_unlock_override`, details old/new override). */}
      <section className="ppg-work-card">
        <h2 className="ppg-list-title">{t('users.unlockOverride')}</h2>
        <form
          data-ppg-admin-form="override"
          className="ppg-work-form"
          aria-label={t('users.unlockOverride')}
          method="POST"
          action="/api/admin/override"
        >
          <label className="ppg-field-label" htmlFor="admin_override_target_id">{t('users.target')}</label>
          <input className="ppg-input" id="admin_override_target_id" name="target_id" required pattern="^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" />
          <button className="ppg-btn-secondary" type="submit">{t('users.unlockSubmit')}</button>
        </form>
        <p>
          <Link className="ppg-link" href="/admin/audit">{t('users.linkAuditOverride')}</Link>
        </p>
        {/* Ticket #16: the research export page (Admin/Teacher) — the audited
          CSV/XLSX/SQL downloads live there, denied to a learner by the
          database's own gate. */}
        <p>
          <Link className="ppg-link" href="/admin/export">{t('export.linkExport')}</Link>
        </p>
      </section>
    </>
  )
}

export default async function AdminUsersPage() {
  const t = await getTranslations('admin')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <div className="ppg-work-head">
          <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('users.title')}</h1>
          <p className="ppg-work-head-sub">{t('users.sub')}</p>
        </div>
        <UsersList />
        <RoleChangeControl />
      </div>
    </Suspense>
  )
}
