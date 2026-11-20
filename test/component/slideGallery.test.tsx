/**
 * @vit-environment jsdom
 */
import { render, cleanup, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeAll, test, expect } from 'vitest'

afterEach(() => cleanup())

import enMessages from '../../messages/en.json'
import thMessages from '../../messages/th.json'

import { SlideGallery } from '../../components/SlideGallery'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUP_URL = 'https://example.supabase.co'
})

const slides = [1, 2, 3].map((n) => ({
  storage_path: `chapter-01/0${n}.webp`,
  alt_th: `สไลด์ประกอบ หน่วยที่ 1 หน้า ${n}`,
  alt_en: `Unit 1 slide ${n}`,
}))

function renderGallery(locale: 'en' | 'th' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'th' ? thMessages : enMessages}>
      <SlideGallery moduleKey="chapter-01" slides={slides} locale={locale} />
    </NextIntlClientProvider>,
  )
}

test('renders every slide as a thumbnail and marks the current one', () => {
  const { container } = renderGallery()
  const gallery = container.querySelector('[data-ppg-slide-gallery="chapter-01"]')!
  expect(gallery).not.toBeNull()
  expect(gallery.querySelectorAll('.ppg-slide-thumb')).toHaveLength(3)

  const current = gallery.querySelectorAll('.ppg-slide-thumb')[0]
  expect(current.getAttribute('aria-current')).toBe('true')
  expect(gallery.querySelector('.ppg-slide-image')?.getAttribute('alt')).toBe('Unit 1 slide 1')
  expect(gallery.querySelector('.ppg-slide-counter')?.textContent).toBe('Slide 1 of 3')
  expect(gallery.querySelector('.ppg-slide-counter')?.getAttribute('aria-live')).toBe('polite')

  const steps = gallery.querySelectorAll('.ppg-slide-step')
  expect((steps[0] as HTMLButtonElement).disabled).toBe(true)
  expect((steps[1] as HTMLButtonElement).disabled).toBe(false)
})

test('thumbnail click and ArrowRight move the large slide', () => {
  const { container } = renderGallery()
  const gallery = container.querySelector('[data-ppg-slide-gallery="chapter-01"]')! as HTMLElement
  const thumbs = gallery.querySelectorAll('.ppg-slide-thumb')

  fireEvent.click(thumbs[1])
  expect(gallery.getAttribute('data-ppg-slide-index')).toBe('1')
  expect(gallery.querySelector('.ppg-slide-image')?.getAttribute('alt')).toBe('Unit 1 slide 2')
  expect(thumbs[1].getAttribute('aria-current')).toBe('true')
  expect(thumbs[0].getAttribute('aria-current')).toBeNull()

  fireEvent.keyDown(gallery, { key: 'ArrowRight' })
  expect(gallery.getAttribute('data-ppg-slide-index')).toBe('2')
  expect(gallery.querySelector('.ppg-slide-image')?.getAttribute('alt')).toBe('Unit 1 slide 3')

  // Both ends stop (no wrapping): the "next" control is disabled at the end.
  const steps = gallery.querySelectorAll('.ppg-slide-step')
  expect((steps[1] as HTMLButtonElement).disabled).toBe(true)

  fireEvent.keyDown(gallery, { key: 'ArrowRight' })
  expect(gallery.getAttribute('data-ppg-slide-index')).toBe('2')
})

test('Thai copy and alt text follow the locale', () => {
  const { container } = renderGallery('th')
  const gallery = container.querySelector('[data-ppg-slide-gallery="chapter-01"]')!
  expect(gallery.querySelector('.ppg-slide-image')?.getAttribute('alt')).toBe('สไลด์ประกอบ หน่วยที่ 1 หน้า 1')
  expect(gallery.querySelector('.ppg-slide-counter')?.textContent).toBe('หน้า 1 / 3')
  expect(gallery.querySelector('.ppg-slide-step')?.textContent).toContain('สไลด์ก่อนหน้า')
})
