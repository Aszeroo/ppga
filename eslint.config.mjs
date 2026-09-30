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
    // The health page imports the server-only connectivity probe by design;
    // the page moved under [locale] in ticket #4 (i18n-prefixed routes).
    // The brackets are glob-escaped: [locale] is a literal directory name,
    // not a character class.
    'app/health/**/*',
    'app/\\[locale\\]/health/**/*',
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
            message:
              'The service-role client factory is server-only and may not reach the browser.',
          },
          {
            name: '@/lib/sup/server',
            message:
              'The service-role client factory is server-only and may not reach the browser.',
          },
        ],
        patterns: [
          {
            group: ['**/lib/sup/server', '**/lib/sup/health'],
            message:
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

// typescript-eslint's `recommended` preset is an ARRAY of config objects in
// typescript-eslint v8 (base is a single object); it must be spread into the
// flat config — a nested array crashes ESLint 9's normalization with
// `TypeError: Unexpected array.` (flatTraverse in @eslint/config-array).
const eslintConfig = [
  // Non-project artifacts (local agent worktrees, the Next build output) —
  // never lint these; flat config does not read .gitignore.
  { ignores: ['.claude/**', '.claue/**', '.next/**', 'node_modules/**'] },
  ...nextVitals,
  tsgl.configs.base,
  ...tsgl.configs.recommended,
  secretGuard,
]

export default eslintConfig