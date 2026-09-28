import type { NextConfig } from 'next'

import createNextIntlPlugin from 'next-intl/plugin'

/**
 * Ticket #4: `next-intl` ships through its plugin so the App Router gets the
 * request config (locale from the `ppga-locale` cookie + the fallback chain
 * merge) and the `[locale]` pages render with `useTranslations`. The existing
 * scaffold config is empty so the plugin wraps it untouched.
 */
const nextConfig: NextConfig = {
  // NO `turbopack.root`: the #10-era hardcoded absolute path exists only in
  // one developer's filesystem, so Vercel/CI `next build` panicked with
  // `failed to canonicalize path`. An explicit root cannot be made portable:
  // verified empirically that ANY value breaks some real environment —
  // root pointing at another checkout panics `Invalid distDirRoot: ".next"`
  // (the dist dir lies outside the root), and a symlinked `node_modules`
  // panics `Symlink [project]/node_modules is invalid, it points out of the
  // filesystem root` no matter what root is set. Next.js infers the project
  // root from cwd, which is correct for the primary checkout, for Vercel,
  // and for issue worktrees that install a REAL node_modules (`npm ci` —
  // never symlink the primary checkout's node_modules into a worktree).
}

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

export default withNextIntl(nextConfig)
