import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { previewExportViaRpc } from '../../../../lib/sup/export'

/**
 * Ticket #16 research export: the Admin/Teacher Export page. The three
 * download links stream the audited route (`/api/export/research`) — CSV,
 * XLSX and SQL, each ONE row per participant with the real student identity
 * (the extract + the audit INSERT happen inside the database, one call,
 * ADR-0002). The page's own state read (`ppg_research_export_preview`) is
 * the teacher/admin-gated preview WITHOUT an audit event (a page view is not
 * an export run); a learner who reaches the pathname sees `denied` verbatim
 * because the DATABASE refused them — the denial is an RLS/function outcome,
 * never a UI-only hide, and the downloads deny too. The empty-cohort case is
 * a graceful state: counts say so, the downloads still work (header-only
 * files), and the runs are still audit-logged. Every state rides
 * `admin.export.*` + `admin.states.*` in both locales.
 * `force-dynamic` so `next build` never pre-renders someone else's counts.
 */
export const dynamic = 'force-dynamic'

async function ExportControls() {
  const t = await getTranslations('admin')
  const preview = await previewExportViaRpc()
  const counts = preview.counts
  return (
    <section aria-label={t('export.heading')}>
      <p>{t('export.intro')}</p>

      {preview.status === 'ok' && counts ? (
        <div data-ppg-admin-state="export-preview">
          <p>{t('export.counts')}:</p>
          <p>{t('export.participantCount')}: {counts.participant_count}</p>
          <p>{t('export.pretestSubmitted')}: {counts.pretest_submitted}</p>
          <p>{t('export.posttestSubmitted')}: {counts.posttest_submitted}</p>
          <p>{t('export.surveySubmitted')}: {counts.survey_submitted}</p>
          <p>{t('export.rubricReviews')}: {counts.rubric_review_count}</p>
          <p>{t('export.submissions')}: {counts.submission_count}</p>
        </div>
      ) : null}
      {preview.status === 'empty' ? (
        <p data-ppg-admin-state="export-preview">{t('export.emptyCohort')}</p>
      ) : null}
      {preview.status === 'error' ? (
        <p>{t('states.error')} {preview.detail}</p>
      ) : null}
      {preview.status === 'denied' ? (
        <p>{t('states.denied')} {preview.detail}</p>
      ) : null}
      {preview.status === 'unauthorized' ? (
        <p>{t('states.unauthorized')} {preview.detail}</p>
      ) : null}
      {preview.status === 'not-configured' ? (
        <p>{t('states.notConfigured')} {preview.detail}</p>
      ) : null}

      {/* The audited downloads: a plain link each — the route streams the
        bytes (and runs the extract + the audit INSERT in the database).
        NEVER a `next/link`: its prefetch would fire the audited RPC without
        anyone exporting. */}
      <p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/export/research?format=csv">{t('export.downloadCsv')}</a>
      </p>
      <p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/export/research?format=xlsx">{t('export.downloadXlsx')}</a>
      </p>
      <p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/export/research?format=sql">{t('export.downloadSql')}</a>
      </p>
      <p>
        {/* The #17 PDF summary report — the audited bilingual document (the
          extract of statistics + the audit INSERT again ride ONE database
          call, `ppg_pdf_summary`). Same rule as above: a plain link, never
          `next/link` (prefetch would run the audited call). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/export/pdf">{t('export.downloadPdf')}</a>
      </p>
      <p>{t('export.auditNote')}</p>
      <p>
        <Link href="/admin/users">{t('export.linkUsers')}</Link>
      </p>
    </section>
  )
}

export default async function AdminExportPage() {
  const t = await getTranslations('admin')
  return (
    <Suspense fallback={<div>{t('states.fallbackSuspense')}</div>}>
      <ExportControls />
    </Suspense>
  )
}
