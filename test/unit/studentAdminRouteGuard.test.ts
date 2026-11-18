import { test, expect } from 'vitest'

import { readFileSync } from 'node:fs'

/**
 * Static guards for the student-management surface (the same CI-without-DB
 * pattern as test/unit/adminGuard.test.ts): every mutation route rejects a
 * foreign Origin, derives the caller role from the session JWT profile (never
 * the body), targets only a `learner`, and uses the server-only service
 * module; the service module applies the one guard table and writes one audit
 * row per mutation. The page/nav/middleware wiring is pinned too.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('pure validation module stays importable by the client and unit tests', () => {
  const pure = read('lib/provision/studentAdmin.ts')
  expect(pure.includes("import 'server-only'")).toBe(false)
  expect(pure.includes("import { z } from 'zod'")).toBe(true)
  expect(pure.includes('export function guardStudentMutation')).toBe(true)
  expect(pure.includes('export function filterLearners')).toBe(true)
})

test('service module is server-only and applies the shared guard table', () => {
  const lib = read('lib/sup/studentAdmin.ts')
  expect(lib.includes("import 'server-only'")).toBe(true)
  expect(lib.includes('guardStudentMutation(')).toBe(true)
  expect(lib.includes("import { createSupaServiceClient } from './provision'")).toBe(true)
  expect(lib.includes("from('../provision/studentAdmin')") || lib.includes("from '../provision/studentAdmin'")).toBe(true)
  // Exactly one audit insert per mutation path, with the three action verbs.
  expect(lib.includes("'student_edit'")).toBe(true)
  expect(lib.includes("'student_password_reset'")).toBe(true)
  expect(lib.includes("'student_delete'")).toBe(true)
  expect(lib.includes('ppg_audit_events')).toBe(true)
  // The service-role key stays in the server module only.
  expect(lib.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
})

test('edit route: origin gate + JWT profile gate + schema + learner-target service', () => {
  const route = read('app/api/teacher/students/edit/route.ts')
  expect(route.includes('rejectCrossOrigin')).toBe(true)
  expect(route.includes('staffGate')).toBe(true)
  expect(route.includes('editLearnerSchema')).toBe(true)
  expect(route.includes('editLearner(')).toBe(true)
  expect(route.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(route.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
})

test('reset route: origin gate + JWT profile gate + one-time password response', () => {
  const route = read('app/api/teacher/students/reset-password/route.ts')
  expect(route.includes('rejectCrossOrigin')).toBe(true)
  expect(route.includes('staffGate')).toBe(true)
  expect(route.includes('targetLearnerSchema')).toBe(true)
  expect(route.includes('resetLearnerPassword(')).toBe(true)
  expect(route.includes('temp_password')).toBe(true)
  expect(route.includes("export const dynamic = 'force-dynamic'")).toBe(true)
})

test('delete route: origin gate + JWT profile gate + learner-target service', () => {
  const route = read('app/api/teacher/students/delete/route.ts')
  expect(route.includes('rejectCrossOrigin')).toBe(true)
  expect(route.includes('staffGate')).toBe(true)
  expect(route.includes('targetLearnerSchema')).toBe(true)
  expect(route.includes('deleteLearner(')).toBe(true)
  expect(route.includes("export const dynamic = 'force-dynamic'")).toBe(true)
})

test('page reads the caller profile before rendering and uses the staff list read', () => {
  const page = read('app/[locale]/teacher/students/page.tsx')
  expect(page.includes('readOwnProfile')).toBe(true)
  expect(page.includes("role !== 'teacher' && role !== 'admin'")).toBe(true)
  expect(page.includes('listLearners')).toBe(true)
  expect(page.includes('StudentAdmin')).toBe(true)
  expect(page.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
})

test('dialog component carries the accessible modal contract', () => {
  const dialog = read('components/AccessibleDialog.tsx')
  expect(dialog.includes('aria-modal="true"')).toBe(true)
  expect(dialog.includes('aria-labelledby={titleId}')).toBe(true)
  expect(dialog.includes("event.key === 'Escape'")).toBe(true)
  expect(dialog.includes("event.key !== 'Tab'")).toBe(true)
  expect(dialog.includes('restore.focus()')).toBe(true)
  expect(dialog.includes('ppg-dialog-backdrop')).toBe(true)
})

test('nav, routing and middleware expose the teacher-only page', () => {
  const nav = read('components/Nav.tsx')
  expect(nav.includes("href: '/teacher/students'")).toBe(true)
  // The admin nav stays intact; the new item is added to the teacher list.
  expect(nav.includes("href: '/admin/users'")).toBe(true)

  const routing = read('lib/i18n/routing.ts')
  expect(routing.includes("'/teacher/students': '/teacher/students'")).toBe(true)

  const mw = read('middleware.ts')
  expect(mw.includes("'/teacher/students'")).toBe(true)

  const layout = read('app/[locale]/layout.tsx')
  expect(layout.includes("'studentAdmin'")).toBe(true)
})

test('copy is present in both locales', () => {
  const th = JSON.parse(read('messages/th.json'))
  const en = JSON.parse(read('messages/en.json'))
  const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) => {
      const dotted = prefix ? `${prefix}.${key}` : key
      return value && typeof value === 'object'
        ? flatten(value as Record<string, unknown>, dotted)
        : [dotted]
    })

  const thAdmin = flatten(th.studentAdmin).sort()
  const enAdmin = flatten(en.studentAdmin).sort()
  expect(thAdmin).toEqual(enAdmin)
  expect(thAdmin.length).toBeGreaterThan(30)
  expect(th.nav.students).toBeTruthy()
  expect(en.nav.students).toBeTruthy()
})
