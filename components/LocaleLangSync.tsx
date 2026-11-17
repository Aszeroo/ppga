"use client"

import { useEffect } from 'react'

import { useLocale } from 'next-intl'

/**
 * A client-side locale switch does not re-render the root <html> element, so
 * `lang` would keep the value from the first server render. Keep it in sync
 * with the active locale after every navigation (accessibility + correct
 * hyphenation/screen-reader language).
 */
export function LocaleLangSync() {
  const locale = useLocale()
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}
