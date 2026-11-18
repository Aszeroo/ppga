import { test, expect } from 'vitest'

import { parseLessonProse } from '../../lib/lessonProse'

test('parseLessonProse: headings, paragraph, bullet list and numbered list', () => {
  const blocks = parseLessonProse(
    [
      '## Major heading',
      '### Sub heading',
      'A paragraph of prose.',
      '- first bullet',
      '- second bullet',
      '1. numbered one',
      '2. numbered two',
      'Closing paragraph.',
    ].join('\n'),
  )
  expect(blocks).toEqual([
    { type: 'heading', level: 2, text: 'Major heading' },
    { type: 'heading', level: 3, text: 'Sub heading' },
    { type: 'paragraph', text: 'A paragraph of prose.' },
    { type: 'bullets', items: ['first bullet', 'second bullet'] },
    { type: 'numbered', items: ['1. numbered one', '2. numbered two'] },
    { type: 'paragraph', text: 'Closing paragraph.' },
  ])
})

test('parseLessonProse: blank lines separate lists, and every line is kept', () => {
  const input = ['- one', '', '- two', '', 'Tail.'].join('\n')
  const blocks = parseLessonProse(input)
  expect(blocks).toEqual([
    { type: 'bullets', items: ['one'] },
    { type: 'bullets', items: ['two'] },
    { type: 'paragraph', text: 'Tail.' },
  ])
})

test('parseLessonProse: empty input renders no blocks', () => {
  expect(parseLessonProse('')).toEqual([])
  expect(parseLessonProse('\n\n')).toEqual([])
})

test('parseLessonProse: no input line is dropped', () => {
  const lines = ['## H', 'Body text.', '- bullet', '1. numbered', '### Sub', 'More.']
  const blocks = parseLessonProse(lines.join('\n\n'))
  const rebuilt = blocks.flatMap((block) => {
    if (block.type === 'heading' || block.type === 'paragraph') return [block.text]
    return block.items
  })
  expect(rebuilt).toEqual(['H', 'Body text.', 'bullet', '1. numbered', 'Sub', 'More.'])
})
