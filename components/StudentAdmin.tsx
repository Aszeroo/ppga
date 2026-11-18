'use client'

import { useCallback, useId, useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { AccessibleDialog } from './AccessibleDialog'
import {
  editLearnerSchema,
  filterLearners,
  type LearnerRow,
} from '../lib/provision/studentAdmin'
import type { ProvisionLine, ProvisionState } from '../lib/sup/provision'

type LearnerListStatus = 'ok' | 'empty' | 'denied' | 'unauthorized' | 'not-configured' | 'error'

/**
 * Teacher/Admin student management (`/teacher/students`). The list is a
 * compact responsive roster: name + login handle + consent, with Edit /
 * Reset / Delete actions on every learner row. Search filters client-side by
 * name or student ID. The Add block reuses the EXISTING provisioning route
 * (roster paste + single-add) and renders the same per-line report and
 * one-time temp passwords it returns. Every mutation confirms in the shared
 * AccessibleDialog (focus trap, Escape, focus return, dimmed backdrop); the
 * dialog shows busy/error states and never fails silently.
 *
 * Security is server-side: the page reads through the session JWT and the
 * three route handlers re-check the caller's profile role + the target's
 * `learner` role before touching anything. This component's role prop only
 * decides what to render, never what is allowed.
 */
export interface StudentAdminProps {
  rows: LearnerRow[]
  status: LearnerListStatus
  detail?: string
}

interface MutationResponse {
  ok: boolean
  detail?: string
  temp_password?: string
  audit?: boolean
}

type DialogState =
  | { kind: 'edit'; row: LearnerRow }
  | { kind: 'reset'; row: LearnerRow }
  | { kind: 'delete'; row: LearnerRow }
  | null

const DETAIL_KEYS: Record<string, string> = {
  handle_taken: 'errors.handleTaken',
  target_missing: 'errors.targetMissing',
  forbidden_target: 'errors.forbidden',
  denied: 'states.denied',
  unauthorized: 'states.unauthorized',
  'not-configured': 'states.notConfigured',
}

export function StudentAdmin({ rows, status, detail }: StudentAdminProps) {
  const t = useTranslations('studentAdmin')
  const tProv = useTranslations('admin.provisioning')
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [statusLine, setStatusLine] = useState('')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  // Add block
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')
  const [report, setReport] = useState<ProvisionLine[] | undefined>(undefined)

  // Edit fields
  const [editName, setEditName] = useState('')
  const [editHandle, setEditHandle] = useState('')
  const [editFieldError, setEditFieldError] = useState('')
  const [editField, setEditField] = useState<'full_name' | 'student_id' | null>(null)

  const titleId = useId()
  const editNameErrorId = useId()
  const editHandleErrorId = useId()

  const filtered = useMemo(() => filterLearners(rows, query), [rows, query])

  const detailCopy = useCallback(
    (detailValue: string | undefined): string => {
      if (!detailValue) return t('errors.failed')
      const key = DETAIL_KEYS[detailValue]
      if (key) return t(key)
      return t('errors.failed')
    },
    [t],
  )

  function closeDialog() {
    if (busy) return
    setDialog(null)
    setDialogError('')
    setEditFieldError('')
    setEditField(null)
    setTempPassword('')
  }

  function openEdit(row: LearnerRow) {
    setEditName(row.full_name)
    setEditHandle(row.student_id)
    setDialogError('')
    setEditFieldError('')
    setEditField(null)
    setTempPassword('')
    setDialog({ kind: 'edit', row })
  }

  function openReset(row: LearnerRow) {
    setDialogError('')
    setTempPassword('')
    setDialog({ kind: 'reset', row })
  }

  function openDelete(row: LearnerRow) {
    setDialogError('')
    setTempPassword('')
    setDialog({ kind: 'delete', row })
  }

  // fallow-ignore-next-line complexity
  const handleAdd = useCallback(
    (
      event: {
        preventDefault: () => void
        currentTarget: HTMLFormElement
      },
    ) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      const kind = form.get('ppg_provision_kind') ?? 'roster'
      const roster = String(form.get('roster') ?? '')
      const studentId = String(form.get('student_id') ?? '')
      const fullName = String(form.get('full_name') ?? '')

      if (kind === 'roster' && roster.trim() === '') {
        setAddError(tProv('states.empty'))
        setReport([])
        return
      }
      if (kind === 'single' && (studentId.trim() === '' || fullName.trim() === '')) {
        setAddError(tProv('states.error'))
        setReport([])
        return
      }

      setAddBusy(true)
      setAddError('')
      const body = kind === 'roster' ? { roster } : { student_id: studentId, full_name: fullName }
      fetch('/api/admin/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(async (response) => {
          const state = (await response.json()) as ProvisionState
          setReport(state.lines)
          if (state.status === 'ok' || state.status === 'empty') {
            setStatusLine('')
            if (state.status === 'ok') router.refresh()
          } else {
            const stateKey =
              state.status === 'not-configured'
                ? 'notConfigured'
                : state.status === 'error'
                  ? 'error'
                  : state.status === 'denied'
                    ? 'denied'
                    : 'unauthorized'
            setAddError(tProv(`states.${stateKey}`))
          }
        })
        .catch(() => setAddError(t('errors.failed')))
        .finally(() => setAddBusy(false))
    },
    [router, t, tProv],
  )

  const submitEdit = useCallback(async () => {
    if (!dialog || dialog.kind !== 'edit') return
    const parsed = editLearnerSchema.safeParse({
      target_id: dialog.row.id,
      student_id: editHandle,
      full_name: editName,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = String(issue?.path[0] ?? '')
      if (field === 'full_name') {
        setEditField('full_name')
        setEditFieldError(t('errors.name'))
      } else if (field === 'student_id') {
        setEditField('student_id')
        setEditFieldError(t('errors.handle'))
      } else {
        setEditFieldError(t('errors.failed'))
      }
      return
    }

    setBusy(true)
    setDialogError('')
    setEditFieldError('')
    try {
      const response = await fetch('/api/teacher/students/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const result = (await response.json()) as MutationResponse
      if (!result.ok) {
        if (result.detail === 'handle_taken') {
          setEditField('student_id')
          setEditFieldError(t('errors.handleTaken'))
        } else {
          setDialogError(detailCopy(result.detail))
        }
        return
      }
      setDialog(null)
      setStatusLine(t('success.edit'))
      router.refresh()
    } catch {
      setDialogError(t('errors.failed'))
    } finally {
      setBusy(false)
    }
  }, [detailCopy, dialog, editHandle, editName, router, t])

  const submitReset = useCallback(async () => {
    if (!dialog || dialog.kind !== 'reset') return
    setBusy(true)
    setDialogError('')
    try {
      const response = await fetch('/api/teacher/students/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: dialog.row.id }),
      })
      const result = (await response.json()) as MutationResponse
      if (!result.ok) {
        setDialogError(detailCopy(result.detail))
        return
      }
      setTempPassword(result.temp_password ?? '')
    } catch {
      setDialogError(t('errors.failed'))
    } finally {
      setBusy(false)
    }
  }, [detailCopy, dialog, t])

  const submitDelete = useCallback(async () => {
    if (!dialog || dialog.kind !== 'delete') return
    setBusy(true)
    setDialogError('')
    try {
      const response = await fetch('/api/teacher/students/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: dialog.row.id }),
      })
      const result = (await response.json()) as MutationResponse
      if (!result.ok) {
        setDialogError(detailCopy(result.detail))
        return
      }
      setDialog(null)
      setStatusLine(t('success.delete'))
      router.refresh()
    } catch {
      setDialogError(t('errors.failed'))
    } finally {
      setBusy(false)
    }
  }, [detailCopy, dialog, router, t])

  if (status !== 'ok' && status !== 'empty') {
    const copy =
      status === 'denied'
        ? t('states.denied')
        : status === 'unauthorized'
          ? t('states.unauthorized')
          : status === 'not-configured'
            ? t('states.notConfigured')
            : t('states.error')
    return (
      <div className="ppg-page-wrap">
        <div className="ppg-work-head">
          <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('title')}</h1>
        </div>
        <div className="ppg-work-card">
          <p className="ppg-state-line" role="alert">{copy}</p>
          {detail ? <p className="ppg-state-line">{detail}</p> : null}
        </div>
      </div>
    )
  }

  const confirmName = dialog ? dialog.row.full_name : ''
  const confirmId = dialog ? dialog.row.student_id : ''

  return (
    <div className="ppg-page-wrap">
      <div className="ppg-work-head">
        <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('title')}</h1>
        <p className="ppg-work-head-sub">{t('sub')}</p>
      </div>

      <section aria-label={t('addTitle')} className="ppg-work-card">
        <h2 className="ppg-list-title">{t('addTitle')}</h2>
        <p className="ppg-mission-note">{t('addIntro')}</p>
        <div className="ppg-student-add-grid">
          <form
            method="post"
            onSubmit={handleAdd}
            data-ppg-student-add="roster"
            className="ppg-work-form"
            aria-label={tProv('paste')}
          >
            <label className="ppg-field-label" htmlFor="student_admin_roster">{tProv('paste')}</label>
            <textarea
              className="ppg-input"
              id="student_admin_roster"
              name="roster"
              required
              placeholder={tProv('placeholder')}
              maxLength={8192}
            />
            <input type="hidden" name="ppg_provision_kind" value="roster" />
            <button className="ppg-btn-secondary" type="submit" disabled={addBusy}>
              {tProv('submit')}
            </button>
          </form>
          <form
            method="post"
            onSubmit={handleAdd}
            data-ppg-student-add="single"
            className="ppg-work-form"
            aria-label={tProv('single')}
          >
            <label className="ppg-field-label" htmlFor="student_admin_student_id">{t('studentIdLabel')}</label>
            <input
              className="ppg-input"
              id="student_admin_student_id"
              name="student_id"
              required
              minLength={3}
              maxLength={50}
              autoComplete="off"
            />
            <label className="ppg-field-label" htmlFor="student_admin_full_name">{t('fullNameLabel')}</label>
            <input
              className="ppg-input"
              id="student_admin_full_name"
              name="full_name"
              required
              minLength={1}
              maxLength={80}
            />
            <input type="hidden" name="ppg_provision_kind" value="single" />
            <button className="ppg-btn-secondary" type="submit" disabled={addBusy}>
              {tProv('submit')}
            </button>
          </form>
        </div>
        {addBusy ? <p className="ppg-state-line" role="status">{t('addBusy')}</p> : null}
        {addError ? <p className="ppg-inline-error" role="alert">{addError}</p> : null}
        {report ? (
          <section aria-label={tProv('report')} className="ppg-student-report">
            <h3 className="ppg-list-title">{tProv('report')}</h3>
            {report.length === 0 ? <p className="ppg-state-line">{tProv('states.empty')}</p> : null}
            <div className="ppg-board-list">
              {report.map((line) => (
                <p className="ppg-board-item" key={`${line.student_id}-${line.result}`}>
                  {line.student_id} - {line.full_name} ({tProv(`line.${line.result}`)})
                  {line.result === 'created' && line.temp_password
                    ? `; ${tProv('handout')} ${line.temp_password}`
                    : ''}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <section aria-label={t('listLabel')} className="ppg-work-card">
        <div className="ppg-students-toolbar">
          <h2 className="ppg-list-title">{t('listLabel')}</h2>
          <p className="ppg-students-count" role="status" aria-live="polite">
            {t('count', { count: filtered.length })}
          </p>
        </div>
        <label className="ppg-field-label" htmlFor="student_admin_search">{t('searchLabel')}</label>
        <input
          className="ppg-input"
          id="student_admin_search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
        />

        {statusLine ? <p className="ppg-state-line" role="status" aria-live="polite">{statusLine}</p> : null}

        {rows.length === 0 ? (
          <p className="ppg-student-empty">{t('empty')}</p>
        ) : filtered.length === 0 ? (
          <p className="ppg-student-empty">{t('noResults')}</p>
        ) : (
          <ul className="ppg-student-list">
            {filtered.map((row) => (
              <li className="ppg-student-row" key={row.id} data-ppg-student-row="true">
                <div className="ppg-student-identity">
                  <span className="ppg-student-name">{row.full_name}</span>
                  <span className="ppg-student-handle">{row.student_id}</span>
                </div>
                <div className="ppg-student-consent">
                  <span className="ppg-field-label">{t('consentLabel')}</span>
                  <span className="ppg-student-consent-value" data-ppg-consent={row.consent ? 'yes' : 'no'}>
                    {row.consent ? t('consentYes') : t('consentNo')}
                  </span>
                </div>
                <div className="ppg-student-actions">
                  <button
                    type="button"
                    className="ppg-btn-secondary"
                    aria-label={`${t('editAction')} ${row.full_name}`}
                    onClick={() => openEdit(row)}
                  >
                    {t('editAction')}
                  </button>
                  <button
                    type="button"
                    className="ppg-btn-secondary"
                    aria-label={`${t('resetAction')} ${row.full_name}`}
                    onClick={() => openReset(row)}
                  >
                    {t('resetAction')}
                  </button>
                  <button
                    type="button"
                    className="ppg-btn-secondary ppg-btn-danger"
                    aria-label={`${t('deleteAction')} ${row.full_name}`}
                    onClick={() => openDelete(row)}
                  >
                    {t('deleteAction')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccessibleDialog open={dialog !== null} titleId={titleId} onClose={closeDialog}>
        {dialog?.kind === 'edit' ? (
          <form
            className="ppg-work-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitEdit()
            }}
          >
            <h2 id={titleId} className="ppg-list-title">{t('editTitle')}</h2>
            <p className="ppg-mission-note">{t('editIntro')}</p>
            <label className="ppg-field-label" htmlFor="student_edit_name">{t('fullNameLabel')}</label>
            <input
              className="ppg-input"
              id="student_edit_name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={80}
              aria-describedby={editField === 'full_name' ? editNameErrorId : undefined}
              aria-invalid={editField === 'full_name' ? true : undefined}
              autoComplete="off"
            />
            {editField === 'full_name' ? (
              <p className="ppg-inline-error" id={editNameErrorId} role="alert">{editFieldError}</p>
            ) : null}
            <label className="ppg-field-label" htmlFor="student_edit_handle">{t('studentIdLabel')}</label>
            <input
              className="ppg-input"
              id="student_edit_handle"
              value={editHandle}
              onChange={(event) => setEditHandle(event.target.value)}
              maxLength={50}
              aria-describedby={editField === 'student_id' ? editHandleErrorId : undefined}
              aria-invalid={editField === 'student_id' ? true : undefined}
              autoComplete="off"
            />
            {editField === 'student_id' ? (
              <p className="ppg-inline-error" id={editHandleErrorId} role="alert">{editFieldError}</p>
            ) : null}
            {dialogError ? <p className="ppg-inline-error" role="alert">{dialogError}</p> : null}
            <div className="ppg-dialog-actions">
              <button type="button" className="ppg-btn-secondary" onClick={closeDialog} disabled={busy}>
                {t('cancel')}
              </button>
              <button type="submit" className="ppg-btn-secondary" disabled={busy}>
                {busy ? t('saving') : t('save')}
              </button>
            </div>
          </form>
        ) : null}

        {dialog?.kind === 'reset' ? (
          <div className="ppg-work-form">
            <h2 id={titleId} className="ppg-list-title">{t('resetTitle')}</h2>
            <p className="ppg-mission-note">{t('resetIntro')}</p>
            {tempPassword ? (
              <>
                <p className="ppg-state-line" role="status">{t('resetDone')}</p>
                <p className="ppg-field-label">{t('tempPasswordLabel')}</p>
                <p className="ppg-temp-password" data-ppg-temp-password="true">{tempPassword}</p>
                <p className="ppg-mission-note">{t('tempPasswordHint')}</p>
                {dialogError ? <p className="ppg-inline-error" role="alert">{dialogError}</p> : null}
                <div className="ppg-dialog-actions">
                  <button type="button" className="ppg-btn-secondary" onClick={closeDialog}>
                    {t('close')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="ppg-student-confirm">
                  {t('resetConfirm', { name: confirmName, studentId: confirmId })}
                </p>
                {dialogError ? <p className="ppg-inline-error" role="alert">{dialogError}</p> : null}
                <div className="ppg-dialog-actions">
                  <button type="button" className="ppg-btn-secondary" onClick={closeDialog} disabled={busy}>
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    className="ppg-btn-secondary"
                    onClick={() => void submitReset()}
                    disabled={busy}
                  >
                    {busy ? t('resetting') : t('resetConfirmLabel')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {dialog?.kind === 'delete' ? (
          <div className="ppg-work-form">
            <h2 id={titleId} className="ppg-list-title">{t('deleteTitle')}</h2>
            <p className="ppg-student-confirm">
              {t('deleteConfirm', { name: confirmName, studentId: confirmId })}
            </p>
            {dialogError ? <p className="ppg-inline-error" role="alert">{dialogError}</p> : null}
            <div className="ppg-dialog-actions">
              <button type="button" className="ppg-btn-secondary" onClick={closeDialog} disabled={busy}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="ppg-btn-secondary ppg-btn-danger"
                onClick={() => void submitDelete()}
                disabled={busy}
              >
                {busy ? t('deleting') : t('deleteConfirmLabel')}
              </button>
            </div>
          </div>
        ) : null}
      </AccessibleDialog>
    </div>
  )
}
