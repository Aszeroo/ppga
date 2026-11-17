"use client"

import { useCallback } from 'react'

import { useLocale } from 'next-intl'

import { locales, useRouter, type Locale } from '../lib/i18n/routing'

/**
 * Ticket #4 interactive selector: a real `select` element so the keyboard
 * (Tab + Arrow-up/down + Enter) and a screen-reader (it reads the option
 * labels and the `aria-current` on the option) reach it without a mouse.
 *
 * The select's `aria-label` is the selector's label; the `aria-current`
 * `true` on the current option (never just colour) tells a screen-reader which
 * language is current. Switching navigates with `useRouter().replace(pathname,
 * { locale }` and POSTs the locale to `app/api/locale/route.ts` so the profile
 * (and the `ppga-locale` cookie that the routing middleware writes) remember
 * the choice across navigation, refresh, logout, and re-login.
 */
interface Props {
  labels: {
    label: string
    option: { th: string; en: string }
  }
}

export function LanguageSelectorSelect({ labels }: Props) {
  const locale = useLocale()
  const router = useRouter()

  const handleChange = useCallback(
    (event: { target: { value: string } }) => {
      const next = event.target.value
      if (locales.includes(next as Locale) && next !== locale) {
        // The current URL is the only source that keeps DYNAMIC params
        // (`/course/chapter-01`); next-intl's usePathname returns the route
        // template (`/course/[moduleKey]`) on parameterised pages.
        const currentPath = window.location.pathname
        const path = currentPath.replace(new RegExp(`^/${locale}(?=/|$)`), '') || '/'
        document.documentElement.lang = next
        // `keepalive` lets the profile update finish after the locale
        // navigation starts; a failed update must never block the switch.
        void fetch('/api/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
          keepalive: true,
        }).catch(() => undefined)
        router.replace(path as never, { locale: next })
      }
    },
    [locale, router],
  )

  return (
    <select
      aria-label={labels.label}
      id="ppga-locale-selector"
      className="ppg-lang-compact"
      value={locale}
      onChange={handleChange}
      role="listbox"
      tabIndex={0}
      style={{ minWidth: 72, maxWidth: '33vw', minHeight: 0 }}
      data-current-locale={locale}
    >
      <option aria-current={locale === 'th' ? 'true' : undefined} value="th">
        {labels.option.th}
      </option>
      <option aria-current={locale === 'en' ? 'true' : undefined} value="en">
        {labels.option.en}
      </option>
    </select>
  )
}
