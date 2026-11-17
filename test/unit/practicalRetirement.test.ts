import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * PPGA #85 static guards (CI runs them on node, no Supabase credentials):
 * the Practical Mission worksheet surfaces left the learner and Teacher
 * journeys without deleting the legacy implementation. The active navigation
 * has no review queue, the learner dashboard/module/course-map surfaces never
 * link a practical or review route, a direct visit renders the unavailable
 * state, and the database archive is non-destructive.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('Learner navigation and surfaces never link a practical/upload/review route', () => {
  const nav = read('components/Nav.tsx')
  expect(nav).not.toContain("'/teacher/review'")

  const dashboard = read('app/[locale]/page.tsx')
  expect(dashboard).not.toContain('/practical')
  expect(dashboard).not.toContain('/course/[moduleKey]/review')
  expect(dashboard).not.toContain('SubmissionRow')
  expect(dashboard).not.toContain('FeedbackRow')

  const modulePage = read('app/[locale]/course/[moduleKey]/page.tsx')
  expect(modulePage).not.toContain('/practical')
  expect(modulePage).toContain("pathname: '/course/[moduleKey]/mission'")

  const courseMap = read('app/[locale]/course/page.tsx')
  expect(courseMap).not.toContain('/practical')
  expect(courseMap).not.toContain('/teacher/review')
})

test('A direct visit renders the unavailable state, never the legacy form', () => {
  const practical = read('app/[locale]/course/[moduleKey]/practical/page.tsx')
  expect(practical).toContain('UnavailableSurface')
  expect(practical).toContain("t('unavailableTitle')")
  // the legacy implementation is retained and exported, not rendered
  expect(practical).toContain('export async function PracticalAttempt')

  const learnerReview = read('app/[locale]/course/[moduleKey]/review/page.tsx')
  expect(learnerReview).toContain('UnavailableSurface')
  expect(learnerReview).toContain('export async function LearnerReviewResult')

  const teacherQueue = read('app/[locale]/teacher/review/page.tsx')
  expect(teacherQueue).toContain('UnavailableSurface')
  expect(teacherQueue).toContain('export async function TeacherQueue')

  const teacherForm = read('app/[locale]/teacher/review/[submissionId]/page.tsx')
  expect(teacherForm).toContain('UnavailableSurface')
  expect(teacherForm).toContain('export async function ReviewForm')
})

test('The submission API, private bucket and rubric tables stay in place', () => {
  // PPGA #85 keeps the historical write/read machinery (code + data).
  expect(read('app/api/submissions/route.ts')).toContain('createSubmissionViaRpc')
  expect(read('app/api/submissions/download/route.ts')).toContain('signedUrlForOwnSubmission')
  expect(read('lib/sup/submissions.ts')).toContain('readSubmissionHistoryViaRpc')
  expect(read('app/api/review/history/route.ts')).toContain('readReviewHistoryViaRpc')
  expect(read('lib/sup/reviews.ts')).toContain('readRubricCriteriaViaRpc')
})

test('The archive migration is non-destructive and hides archived rows from learners', () => {
  const sql = read('supabase/migrations/20261117000100_retire_practical_missions.sql')
  expect(sql).toContain('add column if not exists archived_at timestamptz')
  expect(sql).toContain('set archived_at = now()')
  expect(sql).toContain('archived_at is null')
  // no destructive statement anywhere in the migration
  expect(sql.toLowerCase()).not.toMatch(/\bdelete\s+from\b/)
  expect(sql.toLowerCase()).not.toMatch(/\bdrop\s+table\b/)
  expect(sql.toLowerCase()).not.toMatch(/\btruncate\b/)
  // learner reads exclude the archive; teacher/admin keep history
  expect(sql).toContain("(auth.role() = 'learner' and archived_at is null)")
  expect(sql).toContain("auth.role() in ('teacher','admin')")
})

test('Bilingual unavailable copy exists in both message files', () => {
  for (const file of ['messages/en.json', 'messages/th.json']) {
    const messages = JSON.parse(read(file)) as {
      practical: Record<string, string>
      review: Record<string, string>
    }
    for (const key of ['unavailableTitle', 'unavailableBody', 'unavailableLink']) {
      expect(messages.practical[key]?.length).toBeGreaterThan(0)
      expect(messages.review[key]?.length).toBeGreaterThan(0)
    }
  }
})
