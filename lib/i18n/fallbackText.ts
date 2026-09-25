/**
 * Ticket #4 fallback chain, last leg: a missing message that both locales
 * failed to carry renders as human-readable text — title-cased out of the key
 * path, with an explicit "text unavailable" suffix so an enforces `undefined`
 * and never leaks the raw key path into a page.
 *
 * It is a pure function (no Supabase/Postgres) so the component test can run
 * it on the page directly in CI (test/component/i18nFallback.test.tsx).
 */
export function humanReadableFallback(key: string, namespace?: string): string {
  const readable = readKeyPath(key, namespace)

  return `${readable} (text unavailable)`
}

function readKeyPath(key: string, namespace?: string): string {
  const joined = `${namespace ?? ''}${namespace ? '.' : ''}${key}`
    .split('.')
    .flatMap((segment) => segment.split(/_+/))
    .map((token) => (token.charAt(0)?.toUpperCase() ?? '') + token.slice(1).toLowerCase())

  return joined.join(' ')
}
