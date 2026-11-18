'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The shared accessible dialog used by the student-management surface
 * (edit / reset / delete). It implements the four behaviours the ticket
 * names for a modal:
 *
 * - role="dialog" + aria-modal + aria-labelledby (the heading id the caller
 *   owns) so a screen reader announces only the panel;
 * - a focus TRAP: Tab / Shift+Tab cycle inside the panel, and focus moves to
 *   the first focusable control on open (or the panel itself);
 * - Escape closes (the caller's onClose), without requiring a particular
 *   focus target;
 * - focus RETURN: the element that opened the dialog is focused again when
 *   it closes.
 *
 * The backdrop is a dimmed fixed scrim (no blur here; the teacher-progress
 * modal is a separate task). It does NOT dismiss on click: every destructive
 * action keeps an explicit Cancel button, so an accidental backdrop click can
 * never be mistaken for a decision. The overlay is fixed to the viewport; no
 * ancestor of the page content establishes a containing block (no transform),
 * so it covers the frame correctly without a portal.
 */
export interface AccessibleDialogProps {
  open: boolean
  titleId: string
  onClose: () => void
  children: ReactNode
  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AccessibleDialog({ open, titleId, onClose, children, className }: AccessibleDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const firstElement = focusable[0]
      const lastElement = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && panel.contains(active)

      if (event.shiftKey && (!inside || active === firstElement)) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (!inside || active === lastElement)) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      const restore = restoreRef.current
      if (restore && document.contains(restore)) restore.focus()
      restoreRef.current = null
    }
  }, [open])

  if (!open) return null

  return (
    <div className="ppg-dialog-backdrop" data-ppg-dialog-backdrop="true">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`ppg-dialog-panel${className ? ` ${className}` : ''}`}
        data-ppg-dialog="true"
      >
        {children}
      </div>
    </div>
  )
}
