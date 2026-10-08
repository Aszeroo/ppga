"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../../lib/i18n/routing'

import {
  type ProvisionLine,
  type ProvisionState,
} from '../../../../lib/sup/provision'

/**
 * Ticket #7 provisioning page (Admin/Teacher), #55 V3 utilitarian dressing
 * (presentation only — the paste + one-line forms, their fields/names/limits,
 * the client POST and every outcome stay BYTE-IDENTICAL): a client-side
 * textarea paste of the roster (one learner per line: student ID + name) + a
 * single-add form fallback (the one line, one POST) wearing the gallery's
 * `#a-prov` import card — both forms POST to `/api/admin/provision` (JSON
 * body — the route re-validates); the observable outcome is one of:
 * `ok` + the per-line results report (created / duplicate / malformed — the
 * bilingual report names the line, never a silently-skipped row) + the
 * printable credential handout (student ID + the one-time temp password per
 * created line — the paper the teacher hands out), OR an `empty` paste, an
 * `error`, a `denied` (a learner who smuggles the POST: the route's gate —
 * never a half-made account), `unauthorized`, or `not-configured` — every
 * state's copy lives in `messages` (Thai default + English switch), the
 * missing-key fallback chain speaks first. `force-dynamic` so `next build`
 * never pre-render an unconfigured service or someone else's roster snapshot.
 *
 * The middleware's role guard already redirects the pathname's unauthorized
 * state to `/<locale>/login` before anything else (Ticket #3's pattern + the
 * #7 must-change-password redirect); the deeper `denied` outcome (a learner
 * JWT who navigated past the login guard) rides the route's gate + the RPC's
 * own gate (RLS's same authority). The v1 ships the native form + the login
 * page's client-submit pattern so the keyboard reaches the control; #55 gives
 * it the console's card/field faces.
 */
export const dynamic = 'force-dynamic'

function Report({ lines }: { lines?: ProvisionLine[] }) {
  const t = useTranslations('admin')
  return (
    <section aria-label={t('provisioning.report')} className="ppg-work-card">
      <h2 className="ppg-list-title">{t('provisioning.report')}</h2>
      <div className="ppg-board-list">
        {lines?.map((line: ProvisionLine) => (
          <p className="ppg-board-item" key={`${line.student_id}-${line.result}`}>
            {line.student_id} — {line.full_name} ({t(`provisioning.line.${line.result}`)})
            {line.result === 'created' && line.temp_password ? `; ${t('provisioning.handout')} ${line.temp_password}` : ''}
          </p>
        ))}
      </div>
    </section>
  )
}

export default function ProvisioningPage() {
  const t = useTranslations('admin')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<ProvisionLine[] | undefined>()

  const handleSubmit = useCallback(
    // fallow-ignore-next-line complexity
    (
      event: {
        preventDefault: () => void
        currentTarget: HTMLFormElement
      },
    ) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      const kind = form.get('ppg_provision_kind') ?? 'roster'
      const roster = form.get('roster') ?? ''
      const studentId = form.get('student_id') ?? ''
      const fullName = form.get('full_name') ?? ''

      const body =
        kind === 'roster'
          ? { roster }
          : { student_id: studentId, full_name: fullName }

      if (kind === 'roster' && roster === '') {
        setBusy(false)
        setMessage(t('provisioning.states.empty'))
        setLines([])
        return
      }
      if (kind === 'single' && (studentId === '' || fullName === '')) {
        setBusy(false)
        setMessage(t('provisioning.states.error'))
        setLines([])
        return
      }

      setBusy(true)
      fetch('/api/admin/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          const state = (await res.json()) as ProvisionState
          setLines(state.lines)
          if (state.status === 'ok' || state.status === 'empty') {
            setMessage('')
          } else {
            setMessage(state.detail ?? `HTTP ${res.status}`)
          }
        })
        .catch(() => setMessage('network error'))
    },
    [t],
  )

  return (
    <Suspense fallback={<div>{t('states.fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <div className="ppg-work-head">
          <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('provisioning.title')}</h1>
          <p className="ppg-work-head-sub">{t('provisioning.intro')}</p>
        </div>
        <div className="ppg-work-card">
          <form onSubmit={handleSubmit} data-ppg-provision-form="roster" className="ppg-work-form" aria-label={t('provisioning.paste')}>
            <label className="ppg-field-label" htmlFor="provision_roster">{t('provisioning.paste')}</label>
            <textarea className="ppg-input" id="provision_roster" name="roster" required placeholder={t('provisioning.placeholder')} maxLength={8192} />
            <input type="hidden" name="ppg_provision_kind" value="roster" />
            <button className="ppg-btn-secondary" type="submit">{t('provisioning.submit')}</button>
          </form>
        </div>
        <div className="ppg-work-card">
          <form onSubmit={handleSubmit} data-ppg-provision-form="single" className="ppg-work-form" aria-label={t('provisioning.single')}>
            <label className="ppg-field-label" htmlFor="provision_student_id">{t('users.studentId')}</label>
            <input className="ppg-input" id="provision_student_id" name="student_id" required minLength={3} maxLength={50} />
            <label className="ppg-field-label" htmlFor="provision_full_name">{t('users.fullName')}</label>
            <input className="ppg-input" id="provision_full_name" name="full_name" required minLength={1} maxLength={80} />
            <input type="hidden" name="ppg_provision_kind" value="single" />
            <button className="ppg-btn-secondary" type="submit">{t('provisioning.submit')}</button>
          </form>
        </div>
        {busy ? <p className="ppg-state-line">{t('provisioning.busy')}</p> : null}
        {message ? <p className="ppg-state-line">{message}</p> : null}
        {lines ? <Report lines={lines} /> : null}
        <p className="ppg-state-line">
          {t('provisioning.handout')} — {t('provisioning.handoutHint')}
        </p>
        <p>
          <Link className="ppg-link" href="/admin/users">{t('provisioning.linkUsers')}</Link>
        </p>
      </div>
    </Suspense>
  )
}
