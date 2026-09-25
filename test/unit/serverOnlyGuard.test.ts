import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Static guard test: the scaffold must keep service-role secrets server-side.
 * Runs in CI without any Supabase/Vercel credentials — pure source inspection.
 */
const base = process.cwd()

test('scaffold keeps service-role secrets server-side', () => {
  const serverSource = readFileSync(`${base}/lib/sup/server.ts`, 'utf8')
  const clientSource = readFileSync(`${base}/lib/sup/client.ts`, 'utf8')

  expect(serverSource.trim().startsWith("import 'server-only'")).toBe(true)
  expect(clientSource.includes('NEXT_PUBLIC_SUP_URL')).toBe(true)
  expect(clientSource.includes('NEXT_PUBLIC_SUP_ANON_KEY')).toBe(true)
  expect(!clientSource.includes('SUP_SERVICE_ROLE_KEY')).toBe(true)
  expect(!serverSource.includes('NEXT_PUBLIC_SUP_ANON_KEY')).toBe(true)
})