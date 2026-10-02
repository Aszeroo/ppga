import fs from 'node:fs'

import path from 'node:path'

import { execSync } from 'node:child_process'

/**
 * PPGA #18 globalSetup: the known baseline before ANY journey step. The
 * state-mutating critical journey (consent flags, submissions, reviews, XP
 * grants, unlocks) needs a FRESH seed, so the run starts with
 * `npx supabase db reset` against the LOCAL stack — hermetic across re-runs
 * (the next `playwright test` re-sees Module 1..11 exactly). CI (`ci.yml`)
 * already reset the database in its own step (Supabase's container comes up
 * there), so the SKIP env shortens the CI time — the same baseline.
 *
 * The fixture: a byte-signature-legal .pptx (the magic-byte gate SERVER-side
 * is the authority: `PK\x03\x04` for pptx, junk after; the journey uploads
 * the REAL file through the form's `file` input — never a mocked upload).
 * The size ~200 KB (> 1, <= 25e6 MB limit) — real bytes, real signature.
 */
export default async function globalSetup() {
  if (!process.env.PPG_E2E_SKIP_DB_RESET) {
    execSync('npx supabase db reset', {
      encoding: 'utf8',
      stdio: 'inherit',
    })
  }

  const fixturesDir = path.join(__dirname, 'fixtures')
  fs.mkdirSync(fixturesDir, { recursive: true })

  const deck = path.join(fixturesDir, 'course-deck.pptx')
  const header = Buffer.from('PK\x03\x04', 'latin1')
  const filler = Buffer.alloc(196_000, 0x41)
  fs.writeFileSync(deck, Buffer.concat([header, filler]))
}
