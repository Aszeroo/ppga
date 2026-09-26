import type { NextConfig } from 'next'

import createNextIntlPlugin from 'next-intl/plugin'

/**
 * Ticket #4: `next-intl` ships through its plugin so the App Router gets the
 * request config (locale from the `ppga-locale` cookie + the fallback chain
 * merge) and the `[locale]` pages render with `useTranslations`. The existing
 * scaffold config is empty so the plugin wraps it untouched.
 */
const nextConfig: NextConfig = {
  // The #10 worktree's build runs with the repo's shared `node_modules`
  // symlinked in (the filesystem root = the repo, not the worktree — the
  // Turbopack `symlink out-of-root` error otherwise panics the build).
  turbopack: {
    root: '/home/wasu/ai_nti/projects/ppga',
  },
}

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

export default withNextIntl(nextConfig)
