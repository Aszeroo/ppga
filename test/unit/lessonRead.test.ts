import { describe, expect, test } from 'vitest'

import {
  initialLessonReadState,
  lessonReadCopyKey,
  lessonReadStateFromResponse,
} from '../../lib/lessonRead'

describe('lesson read claim state', () => {
  test('a lesson already in the ledger starts claimed, never idle', () => {
    expect(initialLessonReadState(true)).toBe('already')
    expect(initialLessonReadState(false)).toBe('idle')
  })

  test('a successful first claim is awarded', () => {
    expect(lessonReadStateFromResponse(true, { ok: true, awarded: true, already: false })).toBe('awarded')
  })

  test('a replay is already claimed, never awarded again', () => {
    expect(lessonReadStateFromResponse(true, { ok: true, awarded: false, already: true })).toBe('already')
  })

  test('a failed or malformed response is an error', () => {
    expect(lessonReadStateFromResponse(false, { ok: false })).toBe('error')
    expect(lessonReadStateFromResponse(true, null)).toBe('error')
    expect(lessonReadStateFromResponse(true, { ok: true })).toBe('error')
    expect(lessonReadStateFromResponse(true, { ok: false, awarded: true })).toBe('error')
  })

  test('the copy key names the state', () => {
    expect(lessonReadCopyKey('idle')).toBe('button')
    expect(lessonReadCopyKey('pending')).toBe('pending')
    expect(lessonReadCopyKey('awarded')).toBe('awarded')
    expect(lessonReadCopyKey('already')).toBe('already')
    expect(lessonReadCopyKey('error')).toBe('error')
  })
})
