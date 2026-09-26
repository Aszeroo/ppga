import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #13 unit guard tests (CI runs them on node, no Supabase/Vercel
 * credentials — pure source inspection): the Practical Mission submission
 * seams ride the house contract — the SERVER module runs `server-only` (the
 * service-role key NEVER rides a browser); the upload route + the signed-URL
 * route run server-side and `force-dynamic` (no `next build` pre-render of a
 * POST / of someone else's signed URL); the reader page sits under
 * `app/[locale]/course/[moduleKey]/practical/` and imports the SAME lib at
 * the project-root depth `../../../../../` (5 up; NEVER a relative-shortcut);
 * the bilingual UI rides `messages/{en,th}.json` (the SAME `practical`
 * namespace keys in both); the DATABASE's authority (ADR-0002 append-only,
 * the private bucket, the path-scheme denial, the lifecycle denial) rides the
 * migration.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('Server-only contract: the submission module runs server, the browser never reaches the service-role key', () => {
  const lib = read('lib/sup/submissions.ts')
  expect(lib.trimStart().startsWith("import 'server-only'")).toBe(true)
  expect(lib.includes('NEXT_PUBLIC_SUP_ANON_KEY')).toBe(true)
  expect(!lib.includes('SUP_SERVICE_ROLE_KEY')).toBe(true)
})

test('Force-dynamic: the upload + the signed-URL routes never pre-render (no POST, no a foreign signed URL)', () => {
  const upload = read('app/api/submissions/route.ts')
  const download = read('app/api/submissions/download/route.ts')
  expect(upload.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(download.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  // the magic-byte + the size gate run SERVER-side on the upload route:
  expect(upload.includes('createSubmissionViaRpc')).toBe(true)
  // the signed-URL download rides the signed URL redirect, never a stored URL:
  expect(download.includes('NextResponse.redirect')).toBe(true)
})

test('Depth: the reader page imports the project-root lib at 5 up (../../../../../, never a shortcut)', () => {
  const page = read('app/[locale]/course/[moduleKey]/practical/page.tsx')
  expect(page.includes("from '../../../../../lib/sup/submissions'")).toBe(true)
  expect(page.includes("from '../../../../../lib/i18n/routing'")).toBe(true)
  // the page sits one dir deeper than the lesson reader and rides the SAME
  // depth the lesson page rides (../../../../../ — the components too):
  expect(page.includes("from '../../../../../components/Card")).toBe(true)
})

test('Bilingual UI: the practical namespace keys ride both messages files (en + th)', () => {
  const en = read('messages/en.json')
  const th = read('messages/th.json')
  const keys = ['uploadLabel', 'reflectionPlaceholder', 'historySection', 'historyRound', 'historyStatus', 'historyDownload']
  for (const key of keys) {
    expect(en.includes(key)).toBe(true)
    expect(th.includes(key)).toBe(true)
  }
  expect(en.includes('"practical":')).toBe(true)
  expect(th.includes('"practical":')).toBe(true)
})

test('Database authority: the private bucket + the ADR-0002 append-only denial ride the migration', () => {
  const sql = read(
    'supabase/migrations/20260926001000_practical_missions_submissions.sql',
  )
  // the private bucket (public = false; NEVER a public read):
  expect(sql.includes("values ('ppg-submissions', 'ppg-submissions', false)")).toBe(true)
  // the object delete denial (the owner's own delete NEVER rides a past object):
  expect(sql.includes('ppg_submissions_owner_delete_denied')).toBe(true)
  // the table's own RLS (a stranger's insert NEVER lands; a teacher/admin reads):
  expect(sql.includes('ppg_submissions_insert')).toBe(true)
  expect(sql.includes('ppg_submissions_select')).toBe(true)
  // the append-only triggers (the hand replay update + the delete NEVER move):
  expect(sql.includes('ppg_submissions_append_only')).toBe(true)
  expect(sql.includes('ppg_submissions_append_only_delete')).toBe(true)
  // the lifecycle denial + the path scheme denial:
  expect(sql.includes('invalid_transition')).toBe(true)
  expect(sql.includes('path_scheme_denied')).toBe(true)
  // the size + magic checks (25 MB max, the .pptx/.ppt signature ONLY):
  expect(sql.includes('ppg_sub_size')).toBe(true)
  expect(sql.includes('ppg_sub_magic')).toBe(true)
})
