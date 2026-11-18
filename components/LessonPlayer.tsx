'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { useTranslations } from 'next-intl'

import { ProgressBar } from './ProgressBar'
import { LessonProse } from './LessonProse'
import { nextStepIndex, previousStepIndex, stepProgress, type LessonStep } from '../lib/lessonSteps'

/**
 * PPGA #75 CAI lesson player. The server page renders this Client Component
 * with the already-localized, client-safe step model (no answer keys, no
 * explanations). The first step is therefore in the server-rendered HTML;
 * the collapsed "read all steps" block is a static server-rendered fallback
 * for a no-JavaScript reader.
 *
 * Interactions:
 * - Back / Next move through every step unconditionally: a mini-check never
 *   gates progress, and a wrong answer never blocks the next step.
 * - Keyboard: native buttons, plus ArrowLeft/ArrowRight on the player
 *   surface when the focus is not inside a control that owns those keys
 *   (the radio group keeps its own arrow-key semantics).
 * - On a step change the step heading receives focus and a `role="status"`
 *   line announces "Step n of total" (and the kind) to screen readers.
 * - A mini-check posts one option to `/api/mini-check/grade`; the response
 *   is correctness plus a short explanation, never the key. There is no XP
 *   display and no unlock side effect anywhere on this surface.
 */
export interface LessonPlayerProps {
  lessonKey: string
  steps: LessonStep[]
  locale: 'th' | 'en'
}

interface Feedback {
  tone: 'correct' | 'incorrect'
  explanation: string | null
}

export function LessonPlayer({ lessonKey, steps, locale }: LessonPlayerProps) {
  const t = useTranslations('lessonPlayer')
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [feedback, setFeedback] = useState<Record<number, Feedback>>({})
  const [errors, setErrors] = useState<Record<number, boolean>>({})
  const [pending, setPending] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)

  const safeIndex = Math.min(index, Math.max(steps.length - 1, 0))
  const step = steps[safeIndex]
  const progress = stepProgress(safeIndex, steps.length)

  useEffect(() => {
    // Focus the step heading on every step change after the first paint: the
    // new step is announced without stealing focus on page load.
    if (!mounted.current) {
      mounted.current = true
      return
    }
    headingRef.current?.focus()
  }, [safeIndex])

  if (!step) return null

  const kindLabel = t(`kind.${step.kind}`)
  const selectedKey = selected[step.orderIndex]
  const currentFeedback = feedback[step.orderIndex]
  const currentError = errors[step.orderIndex] === true

  function goBack() {
    setIndex((current) => previousStepIndex(current, steps.length))
  }

  function goNext() {
    setIndex((current) => nextStepIndex(current, steps.length))
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement
    if (target.closest('input, button, a, summary')) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goBack()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goNext()
    }
  }

  function choose(optionKey: string) {
    setSelected((current) => ({ ...current, [step.orderIndex]: optionKey }))
    // A new choice invalidates the previous reveal: the old explanation is
    // withdrawn until the learner asks to check again.
    setFeedback((current) => {
      if (!(step.orderIndex in current)) return current
      const next = { ...current }
      delete next[step.orderIndex]
      return next
    })
    setErrors((current) => {
      if (!(step.orderIndex in current)) return current
      const next = { ...current }
      delete next[step.orderIndex]
      return next
    })
  }

  async function checkAnswer() {
    if (!selectedKey || pending) return
    setPending(true)
    setErrors((current) => ({ ...current, [step.orderIndex]: false }))
    try {
      const response = await fetch('/api/mini-check/grade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson_key: lessonKey,
          order_index: step.orderIndex,
          option_key: selectedKey,
          locale,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        correct?: boolean
        explanation?: string | null
      }
      if (!response.ok || data.ok !== true) {
        setErrors((current) => ({ ...current, [step.orderIndex]: true }))
        return
      }
      setFeedback((current) => ({
        ...current,
        [step.orderIndex]: {
          tone: data.correct === true ? 'correct' : 'incorrect',
          explanation: typeof data.explanation === 'string' && data.explanation.trim() ? data.explanation : null,
        },
      }))
    } catch {
      setErrors((current) => ({ ...current, [step.orderIndex]: true }))
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      className="ppg-lesson-player"
      aria-label={t('stepsHeading')}
      onKeyDown={onKeyDown}
      data-ppg-lesson={lessonKey}
      data-ppg-step-index={step.orderIndex}
    >
      <ProgressBar value={progress.value} min={progress.min} max={progress.max} label={t('progressLabel')} />
      <p role="status" aria-live="polite" className="ppg-card-text ppg-lesson-status" data-ppg-step-status={step.kind}>
        {t('stepOf', { current: progress.value, total: steps.length })} · {kindLabel}
      </p>

      <div className="ppg-card" data-ppg-step-kind={step.kind}>
        <h2 className="ppg-lesson-kicker" tabIndex={-1} ref={headingRef}>
          {kindLabel}
        </h2>
        {step.body ? <LessonProse text={step.body} /> : null}

        {step.check
          ? (
            <div className="ppg-sc-question-group">
              <p className="ppg-sc-question">{step.check.prompt}</p>
              <div className="ppg-sc-options" role="radiogroup" aria-label={step.check.prompt}>
                {step.check.options.map((option) => {
                  const state = currentFeedback && selectedKey === option.optionKey
                    ? currentFeedback.tone
                    : undefined
                  return (
                    <label
                      className="ppg-sc-opt"
                      key={option.optionKey}
                      htmlFor={`mini_${step.orderIndex}_${option.optionKey}`}
                      data-ppg-mini-state={state}
                      data-ppg-mini-option={option.optionKey}
                    >
                      <input
                        className="ppg-sc-opt-radio"
                        type="radio"
                        id={`mini_${step.orderIndex}_${option.optionKey}`}
                        name={`mini_${step.orderIndex}`}
                        value={option.optionKey}
                        checked={selectedKey === option.optionKey}
                        disabled={pending}
                        onChange={() => choose(option.optionKey)}
                      />
                      <span className="ppg-sc-opt-letter" aria-hidden="true">{option.optionKey.toUpperCase()}</span>
                      <span className="ppg-sc-opt-text">{option.label}</span>
                    </label>
                  )
                })}
              </div>
              <div className="ppg-sc-cta-row">
                <button
                  type="button"
                  className="ppg-cta"
                  onClick={checkAnswer}
                  disabled={!selectedKey || pending}
                  data-ppg-cta="mini-check"
                >
                  {pending ? t('checking') : t('check')}
                </button>
              </div>
              {currentFeedback
                ? (
                  <div
                    className="ppg-mini-feedback"
                    data-ppg-mini-result={currentFeedback.tone}
                    role="status"
                    aria-live="polite"
                  >
                    <p className="ppg-mini-feedback-title">
                      {currentFeedback.tone === 'correct' ? t('correct') : t('incorrect')}
                    </p>
                    {currentFeedback.explanation
                      ? (
                        <p className="ppg-mini-feedback-explain">
                          {t('explanation', { text: currentFeedback.explanation })}
                        </p>
                      )
                      : null}
                  </div>
                )
                : null}
              {currentError
                ? <p role="alert" className="ppg-mini-feedback-explain">{t('error')}</p>
                : null}
            </div>
          )
          : null}
      </div>

      <div className="ppg-sc-cta-row">
        <button type="button" className="ppg-cta" onClick={goBack} disabled={safeIndex === 0} data-ppg-nav="back">
          {t('back')}
        </button>
        <button
          type="button"
          className="ppg-cta"
          onClick={goNext}
          disabled={safeIndex >= steps.length - 1}
          data-ppg-nav="next"
        >
          {t('next')}
        </button>
      </div>

      {/* Static server-rendered fallback: all step text + prompt + options,
          no answer keys (the model never carries them). Works without JS. */}
      <details className="ppg-step-readall" data-ppg-step-readall>
        <summary>{t('readAll')}</summary>
        <div>
          {steps.map((entry) => (
            <section className="ppg-step-readall-entry" key={entry.orderIndex} aria-label={t(`kind.${entry.kind}`)}>
              <h3 className="ppg-heading ppg-heading-text">{t(`kind.${entry.kind}`)}</h3>
              {entry.body ? <LessonProse text={entry.body} /> : null}
              {entry.check
                ? (
                  <div>
                    <p className="ppg-card-text">{entry.check.prompt}</p>
                    <ul className="ppg-card-text">
                      {entry.check.options.map((option) => (
                        <li key={option.optionKey}>{option.label}</li>
                      ))}
                    </ul>
                  </div>
                )
                : null}
            </section>
          ))}
        </div>
      </details>
    </section>
  )
}
