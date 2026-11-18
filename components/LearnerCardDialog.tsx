'use client'

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'

/**
 * PPGA learner-card modal: the grid stays server-rendered, and this client
 * shell gives each learner card one accessible trigger that opens a native
 * `<dialog>` with the chapter detail. The server passes the already-computed
 * strings and chapter rows as `ReactNode` props, so the dialog invents no copy
 * and reads no data of its own.
 *
 * Native `showModal()` gives the dialog the top layer: focus is trapped,
 * Escape cancels it, and the page behind is inert. This component adds the
 * things the platform leaves to us: body scroll lock, backdrop-click close,
 * focus return to the card trigger, and reduced-motion aware CSS (in
 * `app/globals.css`).
 */
export interface LearnerCardDialogProps {
  /** The learner's PK; preserved on the card as `data-ppg-learner`. */
  learnerId: string
  /** The trigger's accessible name (the learner's name + student id). */
  triggerLabel: string
  /** The dialog heading's visible name. */
  headingName: string
  /** The student id, shown under the heading and announced as its description. */
  studentId: string
  /** The server-computed cleared/current line. */
  clearedLine: string
  /** The server-computed Final Test line. */
  finalTestLine: string
  /** The existing close copy (`reward.dismiss`), used as the close aria-label. */
  closeLabel: string
  /** The visible card content (name, id, scan strip, Final Test line). */
  children: ReactNode
  /** The nine chapter rows (full status strings + pills), server-rendered. */
  detail: ReactNode
}

export function LearnerCardDialog({
  learnerId,
  triggerLabel,
  headingName,
  studentId,
  clearedLine,
  finalTestLine,
  closeLabel,
  children,
  detail,
}: LearnerCardDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const metaId = useId()
  const scrollLocked = useRef(false)

  function lockScroll() {
    if (scrollLocked.current) return
    scrollLocked.current = true
    document.body.style.overflow = 'hidden'
  }

  function unlockScroll() {
    if (!scrollLocked.current) return
    scrollLocked.current = false
    document.body.style.overflow = ''
  }

  function open() {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      // Old engines: keep the dialog usable, without the modal guarantees.
      dialog.setAttribute('open', '')
    }
    lockScroll()
  }

  function close() {
    const dialog = dialogRef.current
    if (!dialog) return
    if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
    unlockScroll()
    triggerRef.current?.focus()
  }

  // A dialog unmounted while open must not leave the page scroll-locked.
  useEffect(() => () => unlockScroll(), [])

  // Escape closes natively; this runs for every close path (Escape, backdrop,
  // the close button) and puts focus back on the card that opened it.
  function handleClose() {
    unlockScroll()
    triggerRef.current?.focus()
  }

  // The `<dialog>` element itself is the click target only for the backdrop:
  // clicks inside the panel hit its children, and clicks in the dialog's own
  // padding are inside its rect. Both must not close.
  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current
    if (!dialog || event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!inside) close()
  }

  return (
    <div className="ppg-status-card ppg-teacher-card" data-ppg-learner={learnerId}>
      <div className="ppg-teacher-card-body">{children}</div>

      <button
        ref={triggerRef}
        type="button"
        className="ppg-teacher-card-trigger"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={open}
      >
        <span className="ppg-teacher-card-chevron" aria-hidden="true">
          ›
        </span>
      </button>

      <dialog
        ref={dialogRef}
        className="ppg-teacher-dialog"
        aria-labelledby={titleId}
        aria-describedby={metaId}
        onClick={handleDialogClick}
        onClose={handleClose}
      >
        <div className="ppg-teacher-dialog-inner">
          <div className="ppg-teacher-dialog-head">
            <div className="ppg-teacher-dialog-ident">
              <h2 id={titleId} className="ppg-teacher-dialog-title">
                {headingName}
              </h2>
              <p id={metaId} className="ppg-teacher-card-meta ppg-teacher-dialog-meta">
                {studentId}
              </p>
            </div>
            <button
              type="button"
              className="ppg-teacher-dialog-close"
              aria-label={closeLabel}
              onClick={close}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="ppg-teacher-dialog-summary">
            <p className="ppg-teacher-card-line">{clearedLine}</p>
            <p className="ppg-teacher-card-line">{finalTestLine}</p>
          </div>

          <div className="ppg-teacher-dialog-body">{detail}</div>
        </div>
      </dialog>
    </div>
  )
}
