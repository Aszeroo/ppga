import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { readAuditViaTable, type AuditState } from '../../../../lib/sup/admin'

/**
 * Ticket #6 audit view, #55 V3 utilitarian dressing (presentation only — the
 * table read, the row shape and the audit's append-only authority are
 * UNCHANGED): the admin console's event stream, latest first, wearing the
 * gallery's `#a-audit` frame — the heading block + the shipped console table
 * (time / action / target / details; `<th scope>` head, the REAL `details`
 * JSON — no invented severity vocabulary, the events carry none). The
 * `role_change` event's `{old_role|new_role}` details stay parseable for #56's
 * inspect. `force-dynamic` because the page reads the audit stream with the
 * request's session JWT — `next build` must never pre-render someone else's
 * audit log. A teacher/learner who reaches the pathname is denied by the
 * `ppg_audit_events_select` policy at RLS (the table grants no read to them),
 * never a blank screen or a UI-only hide; every state
 * (`admin.states.{ok|empty|error|denied|unauthorized|notConfigured}`) has its
 * own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function AuditStream() {
  const t = await getTranslations('admin')
  const state = await readAuditViaTable(50)
  return (
    <div className="ppg-page-wrap">
      <div className="ppg-work-head">
        <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('audit.title')}</h1>
      </div>
      <section aria-label={t('audit.stream')} className="ppg-work-card">
        {state.status === 'ok' ? (
          <div className="ppg-table-wrap">
            <table className="ppg-table">
              <thead>
                <tr>
                  <th scope="col">{t('audit.colTime')}</th>
                  <th scope="col">{t('audit.colAction')}</th>
                  <th scope="col">{t('audit.colTarget')}</th>
                  <th scope="col">{t('audit.colDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {state.events?.map((event: NonNullable<AuditState['events']>[0]) => (
                  <tr key={event.id}>
                    <td>{event.created_at}</td>
                    <td>{event.action}</td>
                    <td>
                      {event.target_type}/{event.target_id}
                    </td>
                    <td>{JSON.stringify(event.details)}</td>
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
        <p>
          <Link className="ppg-link" href="/admin/users">{t('audit.linkUsers')}</Link>
        </p>
      </section>
    </div>
  )
}

export default async function AdminAuditPage() {
  const t = await getTranslations('admin')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <AuditStream />
    </Suspense>
  )
}
