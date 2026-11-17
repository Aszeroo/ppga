/**
 * PPGA #99 copy contract: `questionTag` carries the question number as a
 * message placeholder in BOTH locales (`ข้อที่ {n}` / `Question {n}`), so the
 * pages pass the number INTO the message instead of appending it after the
 * translated tag. Appending used to render the literal placeholder in Thai
 * (`ข้อที่ {n} 1`).
 */
import type { ReactNode } from 'react'

import { render, cleanup } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

import { Badge } from '../../components/Badge'
import { PreTestItems, type PreTestItem } from '../../components/PreTestItems'
import enMessages from '../../messages/en.json'
import thMessages from '../../messages/th.json'

afterEach(() => cleanup())

const makeItems = (count: number): PreTestItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    th: { prompt: `Thai prompt ${i + 1}`, choices: { A: 'ก', B: 'ข', C: 'ค' } },
    en: { prompt: `English prompt ${i + 1}`, choices: { A: 'A', B: 'B', C: 'C' } },
  }))

function InstrumentList({ locale, namespace }: { locale: 'en' | 'th'; namespace: 'pretest' | 'posttest' }) {
  const t = useTranslations(namespace)
  return (
    <PreTestItems
      items={makeItems(3)}
      locale={locale}
      questionTag={(n) => t('questionTag', { n: String(n) })}
      itemProgress={(n, total) => t('itemProgress', { n: String(n), total: String(total) })}
      answerForQuestion={(n) => t('answerForQuestion', { n: String(n) })}
    />
  )
}

function SurveyTag({ n }: { n: number }) {
  const t = useTranslations('survey')
  return <Badge text={t('questionTag', { n: String(n) })} tone="neutral" />
}

function ChapterTestTag({ n }: { n: number }) {
  const t = useTranslations('chapterTest')
  return (
    <>
      <Badge text={t('questionTag', { n: String(n) })} tone="neutral" />
      <p>{t('questionTag', { n: String(n) })}: prompt</p>
    </>
  )
}

function renderWith(locale: 'en' | 'th', node: ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'th' ? thMessages : enMessages}>
      {node}
    </NextIntlClientProvider>,
  )
}

const badgeTexts = (container: HTMLElement) =>
  [...container.querySelectorAll('.ppg-badge')].map((badge) => badge.textContent)

test.each([
  ['pretest', 'th', 'ข้อที่ 3'],
  ['pretest', 'en', 'Question 3'],
  ['posttest', 'th', 'ข้อที่ 3'],
  ['posttest', 'en', 'Question 3'],
] as const)('%s (%s) renders the tag with the number inside the message', (namespace, locale, expected) => {
  const { container } = renderWith(locale, <InstrumentList locale={locale} namespace={namespace} />)
  expect(badgeTexts(container)[4]).toBe(expected)
  expect(container.textContent).not.toContain('{n}')
})

test('Thai survey tag renders ข้อที่ 3', () => {
  const { container } = renderWith('th', <SurveyTag n={3} />)
  expect(container.textContent).toBe('ข้อที่ 3')
})

test('English survey tag renders Question 3', () => {
  const { container } = renderWith('en', <SurveyTag n={3} />)
  expect(container.textContent).toBe('Question 3')
})

test('chapter-test badge and feedback pass the number through in both locales', () => {
  const th = renderWith('th', <ChapterTestTag n={3} />)
  expect(th.container.textContent).toContain('ข้อคำถาม 3: prompt')
  expect(th.container.textContent).not.toContain('{n}')
  cleanup()

  const en = renderWith('en', <ChapterTestTag n={3} />)
  expect(en.container.textContent).toContain('Question 3: prompt')
  expect(en.container.textContent).not.toContain('{n}')
})
