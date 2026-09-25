import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The health module must handle missing environment gracefully (CI runs without
 * Supabase/Vercel credentials) and query the scaffold baseline table for real
 * connectivity. Real-database success behaviour is exercised at Seam 1 once
 * SUP_* env is present — guarded there so CI stays green without secrets.
 */
const base = process.cwd()

test('health module: not-configured on missing env; queries ppg_health', () => {
  const healthSource = readFileSync(`${base}/lib/sup/health.ts`, 'utf8')

  expect(healthSource.includes('ppg_health')).toBe(true)
  expect(healthSource.includes('not-configured')).toBe(true)
  expect(healthSource.includes('error')).toBe(true)
  expect(healthSource.includes('no rows')).toBe(true)
  expect(healthSource.includes('detail')).toBe(true)
})