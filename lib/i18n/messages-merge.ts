/**
 * Ticket #4 fallback chain, first leg: merge the other locale's messages under
 * the selected one — deep merge on object shapes, so a missing key in the
 * selected locale inherits the other language's text (and only falls to
 * `getMessageFallback` — the human-readable leg — when both locales are blank).
 */
interface MessagesByLocale {
  readonly [locale: string]: Record<string, unknown>
}

export function mergeMessages(locale: string, messagesByLocale: MessagesByLocale): Record<string, unknown> {
  const selected = messagesByLocale[locale]
  const other = Object.values(messagesByLocale).find((otherLocale) => otherLocale !== messagesByLocale[locale]) ?? {}

  return deepMerge(selected, other)
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target }
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = out[key]
    if (targetValue === undefined || targetValue === null) {
      out[key] = sourceValue
    } else if (
      typeof targetValue === 'object' &&
      targetValue !== null &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      out[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      )
    }
  }
  return out
}
