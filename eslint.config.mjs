import nextVitals from 'eslint-config-next/core-web-vitals'
import tsgl from 'typescript-eslint'

/**
 * Server-only secret guard. Only files that carry the `import 'server-only'`
 * declaration (the lib/sup factory modules) and route handlers may touch
 * `SUP_*` / service-role material; everything browser-facing is banned by
 * `no-restricted-imports` (server client factories) and `no-restricted-syntax`
 * (service-role env reads). CI runs this `npm run lint`.
 */
const secretGuard = {
  files: ['**/*'],
  ignores: [
    'lib/**/*',
    'app/api/**/*',
    'app/health/**/*',
    'test/**/*',
    'eslint.config.mjs',
    'next.config.ts',
    'vitest.config.ts',
    'supabase/**/*',
    '.github/**/*',
    'scripts/**/*',
    'app/layout.tsx',
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'lib/sup/server',
            reason:
              'The service-role client factory is server-only and may not reach the browser.',
          },
          {
            name: '@/lib/sup/server',
            reason:
              'The service-role client factory is server-only and may not reach the browser.',
          },
        ],
        patterns: [
          {
            group: ['**/lib/sup/server', '**/lib/sup/health'],
            reason:
              'Server-side Supabase client factories may not reach the browser.',
          },
        ],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'MemberExpression[property.name="SUP_SERVICE_ROLE_KEY"]',
        message:
          'SUP_SERVICE_ROLE_KEY is server-only; read it only in server-only files.',
      },
    ],
  },
}

const eslintConfig = [
  ...nextVitals,
  tsgl.configs.base,
  tsgl.configs.recommended,
  secretGuard,
]

export default eslintConfig