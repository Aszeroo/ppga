'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { useTranslations } from 'next-intl'

import { ProgressBar } from './ProgressBar'
import { LessonProse } from './LessonProse'
import { nextStepIndex, previousStepIndex, stepProgress, type LessonStep } from '../lib/lessonSteps'
import {
  initialLessonReadState,
  lessonReadCopyKey,
  lessonReadStateFromResponse,
  type LessonReadClaimState,
} from '../lib/lessonRead'

/**
 * PPGA #75 CAI lesson player, re-composed as a guided reader. The server page
 * renders this Client Component with the already-localized, client-safe step
 * model (no answer keys, no explanations). The first step is therefore in the
 * server-rendered HTML; the collapsed "read all steps" block is a static
 * server-rendered fallback for a no-JavaScript reader.
 *
 * Layout: on a wide screen the step index is a sticky left column and the
 * reading card is the right column; below 1024px the index becomes a
 * horizontally scrollable row of step chips. The index is a convenience, not
 * a gate: every step is reachable at any time (mini-checks never gate).
 *
 * Interactions:
 * - Back / Next move through every step unconditionally: a mini-check never
 *   gates progress, and a wrong answer never blocks the next step.
 * - Clicking a step in the index jumps straight to it, ungated.
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
  /** The caller's own `lesson_read` ledger row already exists (a revisit
   * shows "already claimed" without a click). */
  readAwarded: boolean
  /** Only a learner may claim +20; staff can read the lesson but see no
   * claim control. */
  claimable: boolean
}

interface Feedback {
  tone: 'correct' | 'incorrect'
  explanation: string | null
}

/** A small token-coloured glyph per step kind (decoration only). */
function StepKindIcon({ kind }: { kind: LessonStep['kind'] }) {
  const common = {
    width: '1em',
    height: '1em',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  }
  if (kind === 'objective') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }
  if (kind === 'example') {
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  }
  if (kind === 'check') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.6-1.5 1.2-1.5 2.3" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  if (kind === 'summary') {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

export function LessonPlayer({ lessonKey, steps, locale, readAwarded, claimable }: LessonPlayerProps) {
  const t = useTranslations('lessonPlayer')
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [feedback, setFeedback] = useState<Record<number, Feedback>>({})
  const [errors, setErrors] = useState<Record<number, boolean>>({})
  const [pending, setPending] = useState(false)
  const [readState, setReadState] = useState<LessonReadClaimState>(() => initialLessonReadState(readAwarded))
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

  async function claimRead() {
    if (readState === 'pending' || readState === 'awarded' || readState === 'already') return
    setReadState('pending')
    try {
      const response = await fetch('/api/lesson/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lesson_key: lessonKey }),
      })
      const data = await response.json().catch(() => null)
      setReadState(lessonReadStateFromResponse(response.ok, data))
    } catch {
      setReadState('error')
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
      <div className="ppg-lesson-layout">
        <nav className="ppg-step-index" aria-label={t('stepsHeading')}>
          <ol className="ppg-step-index-list">
            {steps.map((entry, entryIndex) => (
              <li key={entry.orderIndex}>
                <button
                  type="button"
                  className="ppg-step-index-item"
                  aria-current={entryIndex === safeIndex ? 'step' : undefined}
                  onClick={() => setIndex(entryIndex)}
                >
                  <span className="ppg-step-index-num" aria-hidden="true">
                    {String(entryIndex + 1).padStart(2, '0')}
                  </span>
                  <span className="ppg-step-index-kind">{t(`kind.${entry.kind}`)}</span>
                  <span className="ppg-step-index-icon" data-ppg-kind={entry.kind}>
                    <StepKindIcon kind={entry.kind} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="ppg-lesson-main">
          <ProgressBar value={progress.value} min={progress.min} max={progress.max} label={t('progressLabel')} />
          <p role="status" aria-live="polite" className="ppg-card-text ppg-lesson-status" data-ppg-step-status={step.kind}>
            {t('stepOf', { current: progress.value, total: steps.length })} · {kindLabel}
          </p>

          <div className="ppg-card" data-ppg-step-kind={step.kind}>
            <h2 className="ppg-lesson-kicker" tabIndex={-1} ref={headingRef}>
              <span className="ppg-step-kind-badge" data-ppg-kind={step.kind}>
                <StepKindIcon kind={step.kind} />
              </span>
              {kindLabel}
            </h2>
            {step.body ? <LessonProse text={step.body} /> : null}

            {step.kind === 'summary' && claimable
              ? (
                <div className="ppg-read-claim" data-ppg-read-claim={readState}>
                  {readState !== 'awarded' && readState !== 'already'
                    ? (
                      <>
                        <button
                          type="button"
                          className="ppg-cta"
                          onClick={claimRead}
                          disabled={readState === 'pending'}
                          data-ppg-cta="lesson-read"
                          data-ppg-read-button="true"
                        >
                          {t(`readClaim.${lessonReadCopyKey(readState)}`)}
                        </button>
                        {readState === 'error'
                          ? <p role="alert" className="ppg-mini-feedback-explain">{t('readClaim.error')}</p>
                          : null}
                      </>
                    )
                    : (
                      <p role="status" aria-live="polite" className="ppg-read-claim-state" data-ppg-read-state={readState}>
                        {t(`readClaim.${lessonReadCopyKey(readState)}`)}
                      </p>
                    )}
                </div>
              )
              : null}

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

          <div className="ppg-sc-cta-row ppg-lesson-nav">
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
        </div>
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
