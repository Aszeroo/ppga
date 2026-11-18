/**
 * Pure parser for the CAI lesson prose markup seeded in `ppg_lesson_steps`.
 *
 * The imported chapter bodies use a deliberately tiny markup so the text
 * stays readable in the database and no HTML is ever stored:
 *
 *   `## `     a major heading
 *   `### `    a sub-heading
 *   `- `      a bullet item (consecutive lines form one list)
 *   `1. `     a numbered line (consecutive lines form one list)
 *   blank     separates blocks
 *
 * Everything else is a paragraph. The parser never drops text: every input
 * line lands in exactly one block (blank lines only separate). Client-safe
 * and unit-testable — no React, no server imports.
 */

export type LessonProseBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }

const NUMBERED_LINE = /^\d+[.)]\s+/

export function parseLessonProse(input: string): LessonProseBlock[] {
  const blocks: LessonProseBlock[] = []
  let list: { type: 'bullets' | 'numbered'; items: string[] } | null = null

  function flush() {
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  for (const raw of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      blocks.push({ type: 'heading', level: 3, text: line.slice(4).trim() })
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      blocks.push({ type: 'heading', level: 2, text: line.slice(3).trim() })
      continue
    }
    if (line.startsWith('- ')) {
      const text = line.slice(2).trim()
      if (list?.type === 'bullets') {
        list.items.push(text)
      } else {
        flush()
        list = { type: 'bullets', items: [text] }
      }
      continue
    }
    if (NUMBERED_LINE.test(line)) {
      if (list?.type === 'numbered') {
        list.items.push(line)
      } else {
        flush()
        list = { type: 'numbered', items: [line] }
      }
      continue
    }
    flush()
    blocks.push({ type: 'paragraph', text: line })
  }
  flush()
  return blocks
}
