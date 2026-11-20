'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The live "answered n / total" line on the 50-item research forms.
 *
 * The item radios stay server-rendered and uncontrolled: this component only
 * listens to the form's own `change` event (event delegation) and counts the
 * distinct radio group names with a checked answer. Nothing here submits,
 * validates or rewrites an answer.
 *
 * No-JavaScript fallback: the server renders the line `hidden`, and the first
 * effect (which only runs when JS is available) reveals it with the real
 * count. With JS off the reader simply never sees a stale "0".
 */
export interface InstrumentProgressProps {
  total: number
  /** The localized template, e.g. `Answered {answered} / {total}`. */
  template: string
}

export function InstrumentProgress({ total, template }: InstrumentProgressProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [answered, setAnswered] = useState<number | null>(null)

  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return

    const count = () => {
      const names = new Set<string>()
      form.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked').forEach((input) => {
        if (input.name) names.add(input.name)
      })
      setAnswered(names.size)
    }

    count()
    form.addEventListener('change', count)
    return () => form.removeEventListener('change', count)
  }, [])

  if (total <= 0) return null

  return (
    <p
      className="ppg-card-text ppg-instr-progress"
      data-ppg-instrument-progress={answered ?? 0}
      data-ppg-instrument-total={total}
      role="status"
      aria-live="polite"
      hidden={answered === null}
      ref={ref}
    >
      {answered === null
        ? null
        : template.replace('{answered}', String(answered)).replace('{total}', String(total))}
    </p>
  )
}
