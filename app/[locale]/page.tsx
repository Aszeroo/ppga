import { Suspense } from 'react'

import { Link } from '../../lib/i18n/routing'
import { useTranslations } from 'next-intl'

/**
 * Ticket #4 home page: the scaffold copy moves into the messages files
 * (`home.scaffold`/`home.healthLink`/`home.fallbackSuspense`) so the Thai and
 * English switches both read it — no hardcoded string anywhere left, and the
 * fallback chain still applies if a key is missing. The `Link` from
 * routing.ts keeps the locale prefix on the health link (the explicit `/en`
 * switch works everywhere, including this link).
 */
export default function HomePage() {
  const t = useTranslations('home')

  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        <section>{t('scaffold')}</section>
        <section>
          <Link href="/health">{t('healthLink')}</Link>
        </section>
      </main>
    </Suspense>
  )
}
