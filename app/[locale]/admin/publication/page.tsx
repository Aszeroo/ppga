import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../../lib/i18n/routing'

import { readCourseMapViaRpc } from '../../../../lib/sup/curriculum'

/**
 * Ticket #9 publication console: the admin's map (every module incl
 * draft/arched, the lock states the rule computes) + the publication toggle
 * control. `force-dynamic` because the page reads the map through the RPC
 * with the request's session JWT — `next build` must never pre-render
 * someone else's console. A teacher/learner who reaches the pathname is
 * denied by the toggle RPC's gate (the map read is learner/teacher/admin
 * too), never a blank screen or a UI-only hide; every state
 * (`admin.publication.list`, `admin.publication.toggle`,
 * `admin.states.*`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function PublicationList() {
  const t = useTranslations('admin')
  const locale = useLocale()
  const state = await readCourseMapViaRpc()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('publication.list')}>
      {state.status === 'ok'
        ? state.modules
          ?.sort((a, b) => a.order_index - b.order_index)
          .map((row) => (
            <p key={row.module_key}>
              {row.order_index}. {pick(row.title_th, row.title_en)} — {row.publication_state ?? 'draft'} / {row.lock_state}
            </p>
          ))
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function PublicationToggleControl() {
  const t = useTranslations('admin')
  return (
    <section>
      {/* Ticket #9 publication toggle: the ADMIN's only authoring surface in
        v1 (ADR-0003 — content as migrations, the UI toggles what already
        exists, in one with the #8 consent/override native-form pattern the
        keyboard reaches). The RPC's gate + the audit's append-only policies
        speak: a learner/teacher smuggle the POST as `permission_denied`,
        never a silent write. One call = one UPDATE + one audit INSERT
        (action `publication`, details old/new state). */}
      <form
        data-ppg-admin-form="publication"
        aria-label={t('publication.toggle')}
        method="POST"
        action="/api/curriculum/publication"
      >
        <label htmlFor="admin_publication_key">{t('publication.targetKey')}</label>
        <input
          id="admin_publication_key"
          name="target_key"
          required
          pattern="^(module-\d{2})|(module-\d{2}-lesson-\d{2})$"
        />
        <label htmlFor="admin_publication_state">{t('publication.newState')}</label>
        <select id="admin_publication_state" name="new_state" required>
          <option value="draft">{t('publication.draft')}</option>
          <option value="published">{t('publication.published')}</option>
          <option value="archived">{t('publication.archived')}</option>
        </select>
        <button type="submit">{t('users.submit')}</button>
      </form>
      <p>
        <Link href="/admin/audit">{t('users.linkAudit')}</Link>
      </p>
    </section>
  )
}

export default function AdminPublicationPage() {
  const t = useTranslations('admin')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <PublicationList />
      <PublicationToggleControl />
    </Suspense>
  )
}
