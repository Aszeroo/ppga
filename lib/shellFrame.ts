/**
 * Ticket #41 stage 1: the Shell frame's pathname decisions as PURE string
 * logic, unit-testable outside a server render (the locale layout itself is a
 * Server Component — RTL cannot render it, the shipped component-test pattern
 * is pure-logic + source assertions). The layout resolves `x-ppga-path` (the
 * guard's own pathname) + the active locale, then asks THIS module the three
 * frame questions; each answer is a total function of those two strings.
 */

/** The pathname AFTER the locale prefix (the guard already resolved the
 * prefix): the root carries a bare `` (empty), a sub-path carries NO leading
 * slash (`login`, `course/module-08`). A pathname that does not start with
 * the active locale prefix rides through UNCHANGED (defensive: the guard
 * always locales the path before the layout renders). */
export function localePathSuffix(pathname: string, locale: string): string {
  if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 2)
  if (pathname === `/${locale}`) return ''
  return pathname
}

/** Login/logout ride the STANDALONE 8-bit title/start screens OUTSIDE the
 * Shell frame (the issue's Decision); every other pathname rides the frame. */
export function isStandaloneScreen(suffix: string): boolean {
  return suffix === 'login' || suffix === 'logout' || suffix.startsWith('login/') || suffix.startsWith('logout/')
}

/** The contextual title rides `course.title` on the Course map and every
 * under-course path (Module/Lesson/Self-Check/Mission/Practical); anywhere
 * else the Shell renders just the product identity (story #6). */
export function hasCourseContext(suffix: string): boolean {
  return suffix === 'course' || suffix.startsWith('course/')
}
