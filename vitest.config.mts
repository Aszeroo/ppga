import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    alias: {
      // Next 16 ships `next/navigation` as a root module without a matching
      // subpath in the exports map, so Node's ESM resolver fails it in jsdom.
      // Vitest aliases the bare import to the shipped file so the
      // next-intl navigation wrappers (createNavigation) can import it.
      'next/navigation': resolve(import.meta.dirname, 'node_modules/next/navigation.js'),
    },
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // The component tests (test/component/*.test.tsx) render in jsdom so RTL
    // has a DOM; the node-env source-assertions still pass because reading
    // `node:fs` works under jsdom too.
    environment: 'jsdom',
    globals: false,
    // The navigation wrappers (next-intl's createNavigation) must be
    // transformed, not externalized, so Vite's alias for `next/navigation`
    // applies inside their imports.
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
  },
})