import { getLocale, getTranslations } from 'next-intl/server'

import { LanguageSelectorSelect } from './LanguageSelectorSelect'

/**
 * Ticket #4 language selector: server-rendered options (the copy is translated
 * server-side so the fallback chain applies before the browser sees it) wrap a
 * Client Component (`LanguageSelectorSelect`) that is what the keyboard and
 * the screen-reader interact with.
 *
 * Accessibility: the `select` is labelled (`aria-label` = the selector's
 * label), it announces the current language (`aria-current` on the option,
 * never colour alone), it is keyboard-accessible (a real `select`, Tab +
 * Arrow keys and the browser's default focus ring are visible), and the
 * switch works everywhere because it navigates the `[locale]` pathname.
 *
 * The choice is persisted by the routing middleware's `ppga-locale` cookie
 * (routing.ts) and the client selector POSTs it to `app/api/locale/route.ts`
 * so the learner's profile row also remembers it (across logout and re-login).
 */
export async function LanguageSelector() {
  const locale = await getLocale()
  const t = await getTranslations('selector')

  return (
    <nav aria-label={t('label')}>
      <LanguageSelectorSelect
        labels={{
          label: t('label'),
          option: { th: t('option.th'), en: t('option.en') },
        }}
      />
    </nav>
  )
}
