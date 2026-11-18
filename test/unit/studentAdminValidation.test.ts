import { test, expect } from 'vitest'

import {
  editLearnerSchema,
  filterLearners,
  guardStudentMutation,
  isStaffRole,
  learnerHandleSchema,
  learnerNameSchema,
  targetLearnerSchema,
  type LearnerRow,
} from '../../lib/provision/studentAdmin'

/**
 * Teacher/Admin student management: the PURE validation + role-guard logic.
 * The route handlers re-use these exact units, so these tests run in CI with
 * no Supabase/Postgres credentials.
 */

const UUID = '64110001-0001-0001-0001-000100010001'

const rows: LearnerRow[] = [
  { id: UUID, student_id: '64110001', full_name: 'Learner One', consent: true },
  { id: '64110002-0002-0002-0002-000200020002', student_id: '68-11600-1', full_name: 'Somchai Jaidee', consent: false },
]

test('edit schema normalises the handle to lower case and trims the name', () => {
  const parsed = editLearnerSchema.safeParse({
    target_id: UUID,
    student_id: '  Test-9001  ',
    full_name: '  Test Learner (automated)  ',
  })
  expect(parsed.success).toBe(true)
  if (parsed.success) {
    expect(parsed.data.student_id).toBe('test-9001')
    expect(parsed.data.full_name).toBe('Test Learner (automated)')
  }
})

test('edit schema rejects an empty or overlong name', () => {
  expect(learnerNameSchema.safeParse('').success).toBe(false)
  expect(learnerNameSchema.safeParse('   ').success).toBe(false)
  expect(learnerNameSchema.safeParse('a'.repeat(80)).success).toBe(true)
  expect(learnerNameSchema.safeParse('a'.repeat(81)).success).toBe(false)
})

test('handle schema enforces the 3-50 lower-case handle shape', () => {
  expect(learnerHandleSchema.safeParse('abc').success).toBe(true)
  expect(learnerHandleSchema.safeParse('a.b_c-9').success).toBe(true)
  expect(learnerHandleSchema.safeParse('ab').success).toBe(false)
  expect(learnerHandleSchema.safeParse('a'.repeat(51)).success).toBe(false)
  expect(learnerHandleSchema.safeParse('bad handle').success).toBe(false)
  expect(learnerHandleSchema.safeParse('bad!').success).toBe(false)
  expect(learnerHandleSchema.safeParse('bad@handle').success).toBe(false)
})

test('edit schema rejects a non-uuid target and unknown fields', () => {
  expect(
    editLearnerSchema.safeParse({ target_id: 'nope', student_id: 'abc', full_name: 'A' }).success,
  ).toBe(false)
  expect(
    editLearnerSchema.safeParse({
      target_id: UUID,
      student_id: 'abc',
      full_name: 'A',
      role: 'admin',
    }).success,
  ).toBe(false)
})

test('target schema accepts only the uuid target', () => {
  expect(targetLearnerSchema.safeParse({ target_id: UUID }).success).toBe(true)
  expect(targetLearnerSchema.safeParse({ target_id: UUID, role: 'admin' }).success).toBe(false)
})

test('isStaffRole admits exactly teacher and admin', () => {
  expect(isStaffRole('teacher')).toBe(true)
  expect(isStaffRole('admin')).toBe(true)
  expect(isStaffRole('learner')).toBe(false)
  expect(isStaffRole(undefined)).toBe(false)
  expect(isStaffRole(null)).toBe(false)
})

test('guardStudentMutation denies a learner caller', () => {
  expect(guardStudentMutation('learner', 'learner')).toBe('denied')
  expect(guardStudentMutation(undefined, 'learner')).toBe('denied')
  expect(guardStudentMutation(null, 'learner')).toBe('denied')
})

test('guardStudentMutation admits staff only when the target is a learner', () => {
  expect(guardStudentMutation('teacher', 'learner')).toBe('ok')
  expect(guardStudentMutation('admin', 'learner')).toBe('ok')
  expect(guardStudentMutation('teacher', 'teacher')).toBe('forbidden_target')
  expect(guardStudentMutation('admin', 'admin')).toBe('forbidden_target')
  expect(guardStudentMutation('teacher', undefined)).toBe('forbidden_target')
})

test('filterLearners matches name or student id, case-insensitively', () => {
  expect(filterLearners(rows, 'somchai')).toHaveLength(1)
  expect(filterLearners(rows, 'SOMCHAI')).toHaveLength(1)
  expect(filterLearners(rows, '68-116')).toHaveLength(1)
  expect(filterLearners(rows, '64110001')[0].full_name).toBe('Learner One')
  expect(filterLearners(rows, '   ')).toHaveLength(2)
  expect(filterLearners(rows, 'no such learner')).toHaveLength(0)
})
