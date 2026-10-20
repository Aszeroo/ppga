"use client"

import { useEffect, useRef, useState } from 'react'

import { useTranslations } from 'next-intl'

/**
 * PPGA #55: the rubric's RUNNING TOTAL — a DISPLAY-ONLY figure the gallery's
 * `#t-rubric` rides (the cream/gold "28 / 35" box). It reads the form's own
 * checked `score_*` radios (the SHIPPED control, unchanged) and shows their
 * sum beside the 35 ceiling; the SERVER recomputes the authoritative 7–35 sum
 * at submit (`rubric_total_denied`, ADR-0003) — this figure never posts a
 * value and never gates anything. `aria-live` announces the running count.
 */
const CRITERIA_COUNT = 7
const SCORE_MAX = 5

export function RubricRunningTotal() {
  const t = useTranslations('review')
  const ref = useRef<HTMLSpanElement>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const recompute = () => {
      let sum = 0
      form.querySelectorAll<HTMLInputElement>('input[name^="score_"]:checked').forEach((el) => {
        const n = Number.parseInt(el.value, 10)
        if (Number.isFinite(n)) sum += n
      })
      setTotal(sum)
    }
    form.addEventListener('input', recompute)
    recompute()
    return () => form.removeEventListener('input', recompute)
  }, [])

  return (
    <div className="ppg-rubric-total">
      <span>{t('totalScore')}</span>
      <span ref={ref} className="ppg-total-figure" aria-live="polite">
        {total} / {CRITERIA_COUNT * SCORE_MAX}
      </span>
    </div>
  )
}
