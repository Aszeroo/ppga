/**
 * PPGA #75 CAI lesson-step pure logic: the client-safe step model, the
 * legacy adapter, step navigation arithmetic, and mini-check feedback
 * mapping. No server imports — unit-testable like `lib/chapterTest.ts`.
 *
 * The step rows arrive from the server RPC already stripped of the answer
 * key and the explanation (they never leave Postgres before an answer is
 * submitted). `mapStepRows` only copies the whitelisted fields, so an
 * accidental extra column on the wire cannot ride into the player.
 */

const LESSON_STEP_KINDS = [
  'objective',
  'explanation',
  'example',
  'check',
  'summary',
] as const

export type LessonStepKind = (typeof LESSON_STEP_KINDS)[number]

function isLessonStepKind(value: unknown): value is LessonStepKind {
  return typeof value === 'string' && (LESSON_STEP_KINDS as readonly string[]).includes(value)
}

/** One option row as the read RPC projects it (never `is_correct`). */
export interface MiniCheckOptionRow {
  option_key: string
  option_th: string
  option_en: string
}

/** The `check` payload of a step row as the read RPC projects it. */
export interface MiniCheckRow {
  prompt_th: string
  prompt_en: string
  options: MiniCheckOptionRow[]
}

/** A step row as the `ppg_lesson_steps` RPC returns it. */
export interface LessonStepRow {
  order_index: number
  kind: string
  body_th: string
  body_en: string
  check?: MiniCheckRow | null
}

/** The client-safe mini-check: localized prompt + lettered options only. */
export interface MiniCheck {
  prompt: string
  options: Array<{ optionKey: string; label: string }>
}

/** The client-safe step the player renders. */
export interface LessonStep {
  orderIndex: number
  kind: LessonStepKind
  body: string
  check?: MiniCheck
}

type Locale = 'th' | 'en'

/**
 * Localize a field. An untranslated English side falls back to the Thai
 * source rather than rendering a blank step. Imported prose bodies carry
 * `body_en = ''` until translations land.
 */
const pick = (locale: Locale, th: string, en: string) => (locale === 'th' ? th : en) || th

/**
 * Project the RPC rows into the player model. Only the whitelisted fields
 * are read: an answer-key or explanation field that somehow appeared on the
 * wire is dropped here (the AC's "no answer key before an answer").
 */
export function mapStepRows(rows: readonly LessonStepRow[], locale: Locale): LessonStep[] {
  return rows
    .filter((row) => isLessonStepKind(row.kind))
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((row) => {
      const step: LessonStep = {
        orderIndex: row.order_index,
        kind: row.kind as LessonStepKind,
        body: pick(locale, row.body_th ?? '', row.body_en ?? ''),
      }
      if (row.kind === 'check' && row.check) {
        const options = (row.check.options ?? [])
          .filter((option) => typeof option.option_key === 'string')
          .slice()
          .sort((a, b) => a.option_key.localeCompare(b.option_key))
          .map((option) => ({
            optionKey: option.option_key,
            label: pick(locale, option.option_th ?? '', option.option_en ?? ''),
          }))
        step.check = {
          prompt: pick(locale, row.check.prompt_th ?? '', row.check.prompt_en ?? ''),
          options,
        }
      }
      return step
    })
}

/** The legacy four prose sections a pre-#75 Lesson carries. */
export interface LegacyLessonSections {
  what_learn_th: string
  what_learn_en: string
  why_th: string
  why_en: string
  body_th: string
  body_en: string
  what_next_th: string
  what_next_en: string
}

/**
 * The adapter: a Lesson with no step rows renders the legacy four prose
 * sections as an objective -> explanation -> summary sequence. `why` and
 * `body` join because both answer "why does this matter / what does it say".
 */
export function legacySteps(row: LegacyLessonSections, locale: Locale): LessonStep[] {
  return [
    {
      orderIndex: 1,
      kind: 'objective',
      body: pick(locale, row.what_learn_th, row.what_learn_en),
    },
    {
      orderIndex: 2,
      kind: 'explanation',
      body: `${pick(locale, row.why_th, row.why_en)} ${pick(locale, row.body_th, row.body_en)}`.trim(),
    },
    {
      orderIndex: 3,
      kind: 'summary',
      body: pick(locale, row.what_next_th, row.what_next_en),
    },
  ]
}

/** The page's resolution: real steps when seeded, else the legacy adapter. */
export function resolveLessonSteps(
  row: LegacyLessonSections | null | undefined,
  rows: readonly LessonStepRow[],
  locale: Locale,
): LessonStep[] {
  const mapped = mapStepRows(rows, locale)
  if (mapped.length > 0) return mapped
  return row ? legacySteps(row, locale) : []
}

/** Navigation arithmetic — the player never hides or gates a step. */
export function nextStepIndex(current: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(current + 1, count - 1)
}

export function previousStepIndex(current: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(current - 1, 0)
}

/** The progress bar's native values (`value` is 1-based, the bar is 1..N). */
export function stepProgress(current: number, count: number): { value: number; min: number; max: number } {
  return { value: count <= 0 ? 0 : Math.min(current + 1, count), min: 1, max: Math.max(count, 1) }
}

/** The grade RPC's response shape (correctness + explanation only). */
export interface MiniCheckGradeRow {
  correct: boolean
  explanation_th: string
  explanation_en: string
}

/** Localize the grade response; a missing explanation renders no copy. */
export function localizeGrade(
  row: MiniCheckGradeRow,
  locale: Locale,
): { correct: boolean; tone: 'correct' | 'incorrect'; explanation: string | null } {
  const explanation = pick(locale, row.explanation_th ?? '', row.explanation_en ?? '')
  return {
    correct: row.correct === true,
    tone: row.correct === true ? 'correct' : 'incorrect',
    explanation: explanation.trim() ? explanation : null,
  }
}
