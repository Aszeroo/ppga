import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { readCourseMapViaRpc } from '../../../../lib/sup/curriculum'
import { StatusPill } from '../../../../components/StatusPill'

/**
 * Ticket #9 publication console, #55 V3 utilitarian dressing (presentation
 * only — the map read, the toggle form and its fields/pattern/action are
 * BYTE-IDENTICAL): the admin's map wearing the gallery's `#a-course` frame —
 * the heading block + one row per module (every module incl draft/arched,
 * the lock states the rule computes) with the publication state as a
 * COPY+icon StatusPill beside the tone (success/locked/warning — state never
 * colour alone) + the toggle panel. `force-dynamic` because the page reads
 * the map through the RPC with the request's session JWT — `next build` must
 * never pre-render someone else's console. A teacher/learner who reaches the
 * pathname is denied by the toggle RPC's gate (the map read is learner/
 * teacher/admin too), never a blank screen or a UI-only hide; every state
 * (`admin.publication.list`, `admin.publication.toggle`,
 * `admin.states.*`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function PublicationList() {
  const t = await getTranslations('admin')
  const locale = await getLocale()
  const state = await readCourseMapViaRpc()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('publication.list')} className="ppg-work-card">
      <h2 className="ppg-list-title">{t('publication.list')}</h2>
      {state.status === 'ok' ? (
        <div className="ppg-board-list">
          {state.modules
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((row) => {
              const pub = row.publication_state ?? 'draft'
              const label =
                pub === 'published'
                  ? t('publication.published')
                  : pub === 'archived'
                    ? t('publication.archived')
                    : t('publication.draft')
              const tone =
                pub === 'published'
                  ? 'success'
                  : pub === 'archived'
                    ? 'locked'
                    : 'warning'
              return (
                <div className="ppg-board-item" key={row.module_key}>
                  <div className="ppg-queue-info">
                    <b>
                      {row.order_index}. {pick(row.title_th, row.title_en)}
                    </b>
                    <span className="ppg-queue-meta">{row.lock_state}</span>
                  </div>
                  <StatusPill tone={tone} label={label} />
                </div>
              )
            })}
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

async function PublicationToggleControl() {
  const t = await getTranslations('admin')
  return (
    <section className="ppg-work-card">
      <h2 className="ppg-list-title">{t('publication.toggle')}</h2>
      {/* Ticket #9 publication toggle: the ADMIN's only authoring surface in
        v1 (ADR-0003 — content as migrations, the UI toggles what already
        exists, in one with the #8 consent/override native-form pattern the
        keyboard reaches). The RPC's gate + the audit's append-only policies
        speak: a learner/teacher smuggle the POST as `permission_denied`,
        never a silent write. One call = one UPDATE + one audit INSERT
        (action `publication`, details old/new state). */}
      <form
        data-ppg-admin-form="publication"
        className="ppg-work-form"
        aria-label={t('publication.toggle')}
        method="POST"
        action="/api/curriculum/publication"
      >
        <label className="ppg-field-label" htmlFor="admin_publication_key">{t('publication.targetKey')}</label>
        <input
          className="ppg-input"
          id="admin_publication_key"
          name="target_key"
          required
          pattern="^(module-\d{2})|(module-\d{2}-lesson-\d{2})$"
        />
        <label className="ppg-field-label" htmlFor="admin_publication_state">{t('publication.newState')}</label>
        <select className="ppg-input" id="admin_publication_state" name="new_state" required>
          <option value="draft">{t('publication.draft')}</option>
          <option value="published">{t('publication.published')}</option>
          <option value="archived">{t('publication.archived')}</option>
        </select>
        <button className="ppg-btn-secondary" type="submit">{t('users.submit')}</button>
      </form>
      <p>
        <Link className="ppg-link" href="/admin/audit">{t('users.linkAudit')}</Link>
      </p>
    </section>
  )
}

export default async function AdminPublicationPage() {
  const t = await getTranslations('admin')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <div className="ppg-work-head">
          <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('publication.title')}</h1>
          <p className="ppg-work-head-sub">{t('publication.sub')}</p>
        </div>
        <PublicationList />
        <PublicationToggleControl />
      </div>
    </Suspense>
  )
}
