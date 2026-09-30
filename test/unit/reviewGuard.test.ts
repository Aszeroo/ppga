import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #14 unit guard tests (CI runs them on node, no Supabase/Vercel
 * credentials — pure source inspection): the Practical Mission review
 * seams ride the house contract — the SERVER module runs `server-only` (the
 * service-role key NEVER rides a browser); the review routes run
 * server-side and `force-dynamic` (no `next build` pre-render of a POST);
 * the teacher review page sits under
 * `app/[locale]/course/[moduleKey]/review/` and imports the SAME lib at
 * the project-root depth `../../../../../` (5 up; NEVER a relative-shortcut);
 * the bilingual UI rides `messages/{en,th}.json` (the SAME `review`
 * namespace keys in both); the DATABASE's authority (ADR-0001: rubric scores
 * NEVER ride the leaderboard; ADR-0002: append-only history; ADR-0003:
 * content as migrations) rides the migration.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('Server-only contract: the review module runs server, the browser never reaches the service-role key', () => {
  const lib = read('lib/sup/reviews.ts')
  expect(lib.trimStart().startsWith("import 'server-only'")).toBe(true)
  // the session client (its anon key) is the only config the module touches
  // via `lib/sup/client`; the detail strings name the env shape:
  expect(lib.includes('NEXT_PUBLIC_SUP_* missing')).toBe(true)
  expect(!lib.includes('SUP_SERVICE_ROLE_KEY')).toBe(true)
})

test('Force-dynamic: the review routes never pre-render (no POST)', () => {
  const queue = read('app/api/review/queue/route.ts')
  const submit = read('app/api/review/submit/route.ts')
  const history = read('app/api/review/history/route.ts')
  const latest = read('app/api/review/latest/route.ts')
  const criteria = read('app/api/review/criteria/route.ts')
  expect(queue.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(submit.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(history.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(latest.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(criteria.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  // the review queue ride the review queue RPC:
  expect(queue.includes('readReviewQueueViaRpc')).toBe(true)
  // the review submit ride the review submit RPC:
  expect(submit.includes('submitReviewViaRpc')).toBe(true)
  // the review history ride the review history RPC:
  expect(history.includes('readReviewHistoryViaRpc')).toBe(true)
  // the latest review ride the latest review RPC:
  expect(latest.includes('readLatestReviewViaRpc')).toBe(true)
  // the rubric criteria ride the rubric criteria RPC:
  expect(criteria.includes('readRubricCriteriaViaRpc')).toBe(true)
})

test('Depth: the review page imports the project-root lib at 5 up (../../../../../, never a shortcut)', () => {
  const page = read('app/[locale]/course/[moduleKey]/review/page.tsx')
  expect(page.includes("from '../../../../../lib/sup/reviews'")).toBe(true)
  expect(page.includes("from '../../../../../lib/i18n/routing'")).toBe(true)
  // the page uses the same component depth as other pages:
  expect(page.includes("from '../../../../../components/Card'")).toBe(true)
  expect(page.includes("from '../../../../../components/StatusPill'")).toBe(true)
  // the teacher's own queue page rides its own depth (4 up from teacher/review):
  const teacher = read('app/[locale]/teacher/review/page.tsx')
  expect(teacher.includes("from '../../../../lib/sup/reviews'")).toBe(true)
  const form = read('app/[locale]/teacher/review/[submissionId]/page.tsx')
  expect(form.includes("from '../../../../../lib/sup/reviews'")).toBe(true)
})

test('Bilingual UI: the review namespace keys ride both messages files (en + th)', () => {
  const en = read('messages/en.json')
  const th = read('messages/th.json')
  const keys = ['section', 'queueHeading', 'learner', 'mission', 'round', 'reflection', 'action', 'queueEmpty', 'queueError', 'queueDenied', 'queueUnauthorized', 'queueNotConfigured', 'queueLoading', 'review', 'backToQueue', 'reviewHeading', 'rubricHeading', 'feedbackHeading', 'feedbackTh', 'feedbackEn', 'approve', 'needsImprovement', 'submitReview', 'reviewSubmitted', 'submitFailed', 'xpAwarded', 'badgeAwarded', 'xp', 'latestResultHeading', 'historyHeading', 'noReviewYet', 'fallbackSuspense']
  for (const key of keys) {
    expect(en.includes(key)).toBe(true)
    expect(th.includes(key)).toBe(true)
  }
  expect(en.includes('"review":')).toBe(true)
  expect(th.includes('"review":')).toBe(true)
})

test('Database authority: the review authority rides the migration', () => {
  const sql = read(
    'supabase/migrations/20260926001100_teacher_review_rubric.sql',
  )
  // the review queue function (teacher/admin-only gate):
  expect(sql.includes('ppg_review_queue')).toBe(true)
  expect(sql.includes('denied_role: the review queue is teacher/admin-only')).toBe(true)
  // the submit review function (the definer seam):
  expect(sql.includes('ppg_submit_review')).toBe(true)
  expect(sql.includes('the definer UPDATE under `ppg_rerun`')).toBe(true)
  // the append-only enforcement:
  expect(sql.includes('append_only_rubric_update_denied')).toBe(true)
  expect(sql.includes('append_only_rubric_delete_denied')).toBe(true)
  // the rubric validation (1-5 integers, total 7-35 server-computed):
  expect(sql.includes('rubric_score_denied: 1–5 each ONLY')).toBe(true)
  expect(sql.includes('rubric_total_denied: 7–35 the server-computed sum ONLY')).toBe(true)
  // the XP idempotency (first approval only):
  expect(sql.includes('first approval ONCE')).toBe(true)
  expect(sql.includes('a re-approval NEVER conflicts')).toBe(true)
  // the module badge idempotency (first approval only):
  expect(sql.includes('module badge awarded ONCE')).toBe(true)
  expect(sql.includes('(any re-approval) reaches conflict')).toBe(true)
  // the role gates (teacher/admin-only, learner/stranger denied):
  expect(sql.includes('denied_role: a teacher/admin reads the review verdict')).toBe(true)
  expect(sql.includes("denied_caller: the caller''s own uid NEVER writes a stranger''s review row")).toBe(true)
})