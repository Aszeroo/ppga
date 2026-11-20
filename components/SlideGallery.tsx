'use client'

import { useState, type KeyboardEvent } from 'react'

import { useTranslations } from 'next-intl'

/**
 * Chapter slide gallery.
 *
 * The owner's unit decks are exported as one WebP per page and catalogued in
 * `ppg_lesson_slides`. This component is the reader: one large slide, a
 * scrollable thumbnail strip, and explicit previous/next controls. It never
 * autoplays.
 *
 * The large image carries its intrinsic width/height plus a CSS
 * `aspect-ratio`, so the viewer box is reserved before the WebP arrives (no
 * layout shift). Thumbnails below the first are `loading="lazy"`.
 *
 * Keyboard: ArrowLeft / ArrowRight move the gallery while focus is anywhere
 * inside it. Both ends are disabled (never wrapping) so the control state
 * matches what a screen reader is told. The current thumbnail is marked with
 * `aria-current`, and the visible slide counter is a polite live region.
 */

export interface SlideGallerySlide {
  storage_path: string
  alt_th: string
  alt_en: string
}

interface SlideGalleryProps {
  moduleKey: string
  slides: SlideGallerySlide[]
  locale: 'th' | 'en'
}

const SLIDE_WIDTH = 1600
const SLIDE_HEIGHT = 893

function slideUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUP_URL
  return base ? `${base}/storage/v1/object/public/ppg-lesson-slides/${path}` : ''
}

export function SlideGallery({ moduleKey, slides, locale }: SlideGalleryProps) {
  const t = useTranslations('slides')
  const [index, setIndex] = useState(0)
  const total = slides.length
  const current = slides[index]
  const alt = locale === 'th' ? current.alt_th : current.alt_en
  const atStart = index === 0
  const atEnd = index === total - 1

  function goTo(next: number) {
    if (next < 0 || next >= total) return
    setIndex(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(index + 1)
    }
  }

  return (
    <section
      id="slides"
      className="ppg-slide-gallery"
      aria-labelledby="ppg-slide-gallery-title"
      data-ppg-slide-gallery={moduleKey}
      data-ppg-slide-index={index}
      onKeyDown={onKeyDown}
    >
      <header className="ppg-slide-gallery-head">
        <h2 id="ppg-slide-gallery-title" className="ppg-list-title">
          {t('title')}
        </h2>
        <p className="ppg-slide-gallery-intro">{t('intro')}</p>
      </header>

      <div className="ppg-slide-gallery-layout">
        <figure
          className="ppg-slide-viewer"
          tabIndex={0}
          role="group"
          aria-label={t('viewerLabel')}
        >
          {/* Pre-optimized WebP from Storage; explicit dimensions reserve the box. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="ppg-slide-image"
            src={slideUrl(current.storage_path)}
            alt={alt}
            width={SLIDE_WIDTH}
            height={SLIDE_HEIGHT}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        </figure>

        <div className="ppg-slide-aside">
          <div className="ppg-slide-controls">
            <button
              type="button"
              className="ppg-slide-step"
              onClick={() => goTo(index - 1)}
              disabled={atStart}
            >
              <span aria-hidden="true">←</span> {t('previous')}
            </button>
            <p className="ppg-slide-counter" aria-live="polite">
              {t('slideOf', { n: index + 1, total })}
            </p>
            <button
              type="button"
              className="ppg-slide-step"
              onClick={() => goTo(index + 1)}
              disabled={atEnd}
            >
              {t('next')} <span aria-hidden="true">→</span>
            </button>
          </div>

          <ol className="ppg-slide-thumbs" aria-label={t('thumbnailsLabel')}>
            {slides.map((slide, thumbIndex) => {
              const thumbAlt = locale === 'th' ? slide.alt_th : slide.alt_en
              return (
                <li key={slide.storage_path} className="ppg-slide-thumb-item">
                  <button
                    type="button"
                    className="ppg-slide-thumb"
                    onClick={() => goTo(thumbIndex)}
                    aria-current={thumbIndex === index ? 'true' : undefined}
                    aria-label={t('thumbnailLabel', { n: thumbIndex + 1, alt: thumbAlt })}
                  >
                    {/* Decorative inside the labelled thumbnail button. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={slideUrl(slide.storage_path)}
                      alt=""
                      width={SLIDE_WIDTH}
                      height={SLIDE_HEIGHT}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
