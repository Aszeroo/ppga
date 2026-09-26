import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../../lib/i18n/routing'

import { readAuditViaTable, type AuditState } from '../../../../lib/sup/admin'

/**
 * Ticket #6 audit view: the admin console's event stream, latest first, with
 * the `role_change` event's `{old_role|new_role}` details parseable for #56's
 * inspect. `force-dynamic` because the page reads the audit stream with the
 * request's session JWT — `next build` must never pre-render someone else's
 * audit log. A teacher/learner who reaches the pathname is denied by the
 * `ppg_audit_events_select` policy at RLS (the table grants no read to them),
 * never a blank screen or a UI-only hide; every state
 * (`admin.states.{ok|empty|error|denied|unauthorized|notConfigured}`) has its
 * own copy in `messages`.
 *
 * The design system: the stream's rows ride `Card` + `StatusPill` faces in
 * the console's later iteration; this v1 ships the stream + the loading/
 * empty/error states as the page's own, `fallbackSuspense` carries the
 * suspense's own copy (no blank screen).
 */
export const dynamic = 'force-dynamic'

async function AuditStream() {
  const t = useTranslations('admin')
  const state = await readAuditViaTable(50)
  return (
    <section aria-label={t('audit.stream')}>
      {state.status === 'ok' ? (
        state.events?.map((event: NonNullable<AuditState['events']>[0]) => (
          <p key={event.id}>
            {event.created_at} — {event.action} {event.target_type}/{
              event.target_id
            } ({JSON.stringify(event.details)})
          </p>
        ))
      ) : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/admin/users">{t('audit.linkUsers')}</Link>
      </p>
    </section>
  )
}

export default function AdminAuditPage() {
  const t = useTranslations('admin')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <AuditStream />
    </Suspense>
  )
}
