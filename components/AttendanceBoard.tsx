'use client'

import { useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import {
  ATTENDANCE_BEHAVIOR_VALUES,
  buildDraftRows,
  sessionXpPreview,
  toAttendancePayload,
  updateDraftRow,
  type AttendanceDraftRow,
  type AttendanceSessionRow,
} from '../lib/attendance'

/**
 * PPGA #141 teacher attendance console.
 *
 * The server page passes the already-authorized overview (staff only),
 * the learner roster and the chapter choices. This client component owns the
 * editing state: pick a session, tick present / early / behaviour, save.
 * It never trusts its role prop for security. The route and the database
 * RPCs re-check the caller's profile role and each target's learner role.
 *
 * Layout: the session list is a card list (readable at 390px), the roster
 * is one card per learner with full-width labelled controls (44px touch
 * targets), and the compact history is a horizontally-scrollable table
 * (`.ppg-table-wrap`) so no column forces the page wide at 1440px.
 */

type BoardStatus = 'ok' | 'empty' | 'denied' | 'unauthorized' | 'not-configured' | 'error'

export interface AttendanceChapter {
  moduleKey: string
  titleTh: string
  titleEn: string
}

export interface AttendanceRosterEntry {
  id: string
  studentId: string
  fullName: string
}

export interface AttendanceBoardProps {
  status: BoardStatus
  detail?: string
  sessions: AttendanceSessionRow[]
  roster: AttendanceRosterEntry[]
  chapters: AttendanceChapter[]
  today: string
  locale: 'th' | 'en'
}

interface MutationResponse {
  ok: boolean
  detail?: string
  session_id?: string
  saved?: number
  present?: number
  early?: number
  xp_total?: number
}

export function AttendanceBoard({
  status,
  detail,
  sessions,
  roster,
  chapters,
  today,
  locale,
}: AttendanceBoardProps) {
  const t = useTranslations('attendance')
  const router = useRouter()

  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null)
  const [extraSessions, setExtraSessions] = useState<AttendanceSessionRow[]>([])
  const [draftOverrides, setDraftOverrides] = useState<Record<string, AttendanceDraftRow[]>>({})
  const [createDate, setCreateDate] = useState(today)
  const [createChapter, setCreateChapter] = useState(chapters[0]?.moduleKey ?? '')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedLine, setSavedLine] = useState('')

  // Sessions created in this visit render immediately; once the refreshed
  // server props carry them, the de-dupe drops the optimistic copy.
  const sessionList = useMemo(() => {
    const known = new Set(sessions.map((entry) => entry.id))
    return [...extraSessions.filter((entry) => !known.has(entry.id)), ...sessions]
  }, [sessions, extraSessions])

  const selected = useMemo(
    () => sessionList.find((entry) => entry.id === selectedId) ?? null,
    [sessionList, selectedId],
  )

  const draft = useMemo(
    () =>
      selected
        ? draftOverrides[selected.id] ?? buildDraftRows(roster.map((entry) => entry.id), selected.records)
        : [],
    [selected, draftOverrides, roster],
  )

  const chapterTitle = (moduleKey: string) => {
    const chapter = chapters.find((entry) => entry.moduleKey === moduleKey)
    if (!chapter) return moduleKey
    return locale === 'th' ? chapter.titleTh : chapter.titleEn
  }

  const xpPreview = sessionXpPreview(draft)

  function patchRow(
    learnerId: string,
    patch: Partial<Pick<AttendanceDraftRow, 'present' | 'earlyBird' | 'behaviorPoints'>>,
  ) {
    if (!selected) return
    const sessionId = selected.id
    setDraftOverrides((current) => {
      const base = current[sessionId]
        ?? buildDraftRows(roster.map((entry) => entry.id), selected.records)
      return { ...current, [sessionId]: updateDraftRow(base, learnerId, patch) }
    })
    setSavedLine('')
  }

  function selectSession(sessionId: string) {
    setSelectedId(sessionId)
    setSaveError('')
    setSavedLine('')
  }

  async function createSession() {
    if (creating || !createChapter) return
    setCreating(true)
    setCreateError('')
    try {
      const response = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          session_date: createDate,
          module_key: createChapter,
          label_th: chapterTitle(createChapter),
          label_en: chapterTitle(createChapter),
        }),
      })
      const data = (await response.json().catch(() => ({}))) as MutationResponse
      if (!response.ok || data.ok !== true || !data.session_id) {
        setCreateError(t('createError'))
        return
      }
      setSelectedId(data.session_id)
      setExtraSessions((current) => [
        ...current.filter((entry) => entry.id !== data.session_id),
        {
          id: data.session_id as string,
          module_key: createChapter,
          session_date: createDate,
          label_th: chapterTitle(createChapter),
          label_en: chapterTitle(createChapter),
          present_count: 0,
          early_count: 0,
          behavior_total: 0,
          xp_total: 0,
          records: [],
        },
      ])
      router.refresh()
    } catch {
      setCreateError(t('createError'))
    } finally {
      setCreating(false)
    }
  }

  async function saveSession() {
    if (!selected || saving) return
    setSaving(true)
    setSaveError('')
    setSavedLine('')
    try {
      const response = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          session_id: selected.id,
          rows: toAttendancePayload(draft),
        }),
      })
      const data = (await response.json().catch(() => ({}))) as MutationResponse
      if (!response.ok || data.ok !== true) {
        setSaveError(t('saveError'))
        return
      }
      setSavedLine(
        t('savedLine', {
          present: data.present ?? 0,
          early: data.early ?? 0,
          xp: data.xp_total ?? 0,
        }),
      )
      // The saved records are now the server truth; drop the local override
      // so the refreshed props render it.
      setDraftOverrides((current) => {
        if (!(selected.id in current)) return current
        const next = { ...current }
        delete next[selected.id]
        return next
      })
      router.refresh()
    } catch {
      setSaveError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (status !== 'ok' && status !== 'empty') {
    const copy =
      status === 'not-configured'
        ? t('states.notConfigured')
        : status === 'unauthorized'
          ? t('states.unauthorized')
          : status === 'error'
            ? t('states.error')
            : t('states.denied')
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

  return (
    <div className="ppg-page-wrap">
      <div className="ppg-work-head">
        <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('title')}</h1>
        <p className="ppg-work-head-sub">{t('sub')}</p>
      </div>

      <section aria-label={t('createTitle')} className="ppg-work-card">
        <h2 className="ppg-list-title">{t('createTitle')}</h2>
        <div className="ppg-attendance-create">
          <div className="ppg-work-form">
            <label className="ppg-field-label" htmlFor="attendance_date">{t('dateLabel')}</label>
            <input
              className="ppg-input"
              id="attendance_date"
              type="date"
              value={createDate}
              onChange={(event) => setCreateDate(event.target.value)}
              required
            />
          </div>
          <div className="ppg-work-form">
            <label className="ppg-field-label" htmlFor="attendance_chapter">{t('chapterLabel')}</label>
            {/* ds-allow-native-select: deliberate native select, repo admin-form pattern. */}
            <select
              className="ppg-input"
              id="attendance_chapter"
              value={createChapter}
              onChange={(event) => setCreateChapter(event.target.value)}
              required
            >
              {chapters.map((chapter) => (
                <option key={chapter.moduleKey} value={chapter.moduleKey}>
                  {locale === 'th' ? chapter.titleTh : chapter.titleEn}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="ppg-cta"
            onClick={createSession}
            disabled={creating || !createChapter}
            data-ppg-attendance-create="true"
          >
            {creating ? t('creating') : t('createAction')}
          </button>
        </div>
        {createError ? <p className="ppg-inline-error" role="alert">{createError}</p> : null}
      </section>

      <section aria-label={t('sessionsTitle')} className="ppg-work-card">
        <h2 className="ppg-list-title">{t('sessionsTitle')}</h2>
        {sessionList.length === 0
          ? <p className="ppg-state-line">{t('noSessions')}</p>
          : (
            <ul className="ppg-attendance-sessions">
              {sessionList.map((session) => {
                const active = session.id === selectedId
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={`ppg-attendance-session${active ? ' ppg-attendance-session-current' : ''}`}
                      aria-pressed={active}
                      onClick={() => selectSession(session.id)}
                      data-ppg-attendance-session={session.id}
                    >
                      <span className="ppg-attendance-session-date">{session.session_date}</span>
                      <span className="ppg-attendance-session-chapter">
                        {locale === 'th' ? session.label_th || chapterTitle(session.module_key) : session.label_en || chapterTitle(session.module_key)}
                      </span>
                      <span className="ppg-attendance-session-counts">
                        {t('sessionSummary', {
                          present: session.present_count,
                          early: session.early_count,
                          xp: session.xp_total,
                        })}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      <section aria-label={t('rosterTitle')} className="ppg-work-card">
        <div className="ppg-attendance-roster-head">
          <h2 className="ppg-list-title">{t('rosterTitle')}</h2>
          <p className="ppg-attendance-xp-preview" role="status" aria-live="polite" data-ppg-attendance-xp>
            {t('xpPreview', { xp: xpPreview })}
          </p>
        </div>

        {!selected
          ? <p className="ppg-state-line">{t('selectSession')}</p>
          : roster.length === 0
            ? <p className="ppg-state-line">{t('emptyRoster')}</p>
            : (
              <>
                <ul className="ppg-attendance-rows">
                  {draft.map((row) => {
                    const learner = roster.find((entry) => entry.id === row.learnerId)
                    if (!learner) return null
                    return (
                      <li className="ppg-attendance-row" key={row.learnerId} data-ppg-attendance-row={row.learnerId}>
                        <div className="ppg-attendance-identity">
                          <span className="ppg-attendance-name">{learner.fullName}</span>
                          <span className="ppg-attendance-handle">{learner.studentId}</span>
                        </div>
                        <div className="ppg-attendance-controls">
                          <label className="ppg-attendance-toggle" htmlFor={`att_present_${row.learnerId}`}>
                            <input
                              id={`att_present_${row.learnerId}`}
                              type="checkbox"
                              checked={row.present}
                              onChange={(event) => patchRow(row.learnerId, { present: event.target.checked })}
                              data-ppg-attendance-present={row.learnerId}
                            />
                            <span>{t('present')}</span>
                          </label>
                          <label
                            className={`ppg-attendance-toggle${row.present ? '' : ' ppg-attendance-toggle-disabled'}`}
                            htmlFor={`att_early_${row.learnerId}`}
                          >
                            <input
                              id={`att_early_${row.learnerId}`}
                              type="checkbox"
                              checked={row.earlyBird}
                              disabled={!row.present}
                              onChange={(event) => patchRow(row.learnerId, { earlyBird: event.target.checked })}
                              data-ppg-attendance-early={row.learnerId}
                            />
                            <span>{t('early')}</span>
                          </label>
                          <label className="ppg-attendance-behavior" htmlFor={`att_behavior_${row.learnerId}`}>
                            <span className="ppg-attendance-behavior-label">{t('behavior')}</span>
                            {/* ds-allow-native-select: deliberate native select, fixed 0/5/10 choice. */}
                            <select
                              className="ppg-input ppg-attendance-select"
                              id={`att_behavior_${row.learnerId}`}
                              value={row.behaviorPoints}
                              onChange={(event) =>
                                patchRow(row.learnerId, {
                                  behaviorPoints: Number(event.target.value) as 0 | 5 | 10,
                                })}
                              data-ppg-attendance-behavior={row.learnerId}
                            >
                              {ATTENDANCE_BEHAVIOR_VALUES.map((value) => (
                                <option key={value} value={value}>
                                  {value === 0 ? t('behaviorNone') : `+${value}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <div className="ppg-attendance-save">
                  <button
                    type="button"
                    className="ppg-cta"
                    onClick={saveSession}
                    disabled={saving}
                    data-ppg-attendance-save="true"
                  >
                    {saving ? t('saving') : t('saveAction')}
                  </button>
                  {savedLine ? <p className="ppg-state-line" role="status" aria-live="polite">{savedLine}</p> : null}
                  {saveError ? <p className="ppg-inline-error" role="alert">{saveError}</p> : null}
                </div>
              </>
            )}
      </section>

      <section aria-label={t('historyTitle')} className="ppg-work-card">
        <h2 className="ppg-list-title">{t('historyTitle')}</h2>
        {sessionList.length === 0
          ? <p className="ppg-state-line">{t('noSessions')}</p>
          : (
            <div className="ppg-table-wrap">
              <table className="ppg-table">
                <thead>
                  <tr>
                    <th scope="col">{t('colDate')}</th>
                    <th scope="col">{t('colChapter')}</th>
                    <th scope="col">{t('colPresent')}</th>
                    <th scope="col">{t('colEarly')}</th>
                    <th scope="col">{t('colXp')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionList.map((session) => (
                    <tr key={session.id} data-ppg-attendance-history={session.id}>
                      <td>{session.session_date}</td>
                      <td>
                        {locale === 'th'
                          ? session.label_th || chapterTitle(session.module_key)
                          : session.label_en || chapterTitle(session.module_key)}
                      </td>
                      <td>{session.present_count}</td>
                      <td>{session.early_count}</td>
                      <td>{session.xp_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  )
}
