import { z } from 'zod'

/**
 * Ticket #7 pure roster/temp-password logic — a module the unit tests can
 * import verbatim (Vitest's jsdom env makes `server-only` throw for every
 * import, so the logic that the route shares must live outside that guard:
 * `lib/sup/provision.ts` re-imports these functions and calls them from its
 * server-side flow).
 */

/** The login handle scheme carries over from #3 (`syntheticEmail` + the seed):
 * a learner's login identifier is their provisioned student-ID. The roster
 * paste's line format is `<student-id> <full-name>` (the tolerant separator set
 * below); the handle itself is Zod-validated against the #3 handle schema. */
export const studentIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/i)

export const fullNameSchema = z.string().trim().min(1).max(80)

export const provisionLineSchema = z
  .object({
    student_id: studentIdSchema,
    full_name: fullNameSchema,
  })
  .strict()

export type ProvisionLineStatus = 'created' | 'duplicate' | 'malformed'

export interface ProvisionLine {
  student_id: string
  full_name: string
  result: ProvisionLineStatus
  temp_password?: string
}

/** Synthetic email from a login handle — the #3 scheme, re-used verbatim for a
 * provisioned learner (`<student-id>@ppga.local`). */
export function syntheticEmail(handle: string): string {
  return `${handle.toLowerCase()}@ppga.local`
}

/** Line-separators the paste may carry: a tab (`	` — a spreadsheet's
 * column break), a comma (`,`) — the `id, name` paste), or whitespace
 * (` id name`). A name's inner whitespace (`Lews A. Boonthi`) is never a
 * separator — we split once on the FIRST separator only (the `1` limit). */
export const ROSTER_LINES = /\n+/

export function parseRoster(text: string): ProvisionLine[] {
  const seen = new Map<string, boolean>()
  const out: ProvisionLine[] = []
  for (const raw of text.split(ROSTER_LINES)) {
    const line = raw.trim()
    if (line === '') continue
    // The head token is whatever before the FIRST separator (`\t` tab, `,`, or
    // a space — a `bad-handle!` raw token stays head, never a split-inside
    // name). The name is what follows, rejoined with single spaces (a name's
    // inner whitespace `Lews A. Boonthi` restores verbatim). V8's
    // `split(…, 1)` cuts the rest off — we split unlimited + rejoin.
    const parts = line.split(/[\t, ]/)
    const head = parts[0]?.trim() ?? ''
    const rest = parts.slice(1).join(' ').trim()
    const parsed = provisionLineSchema.safeParse({
      student_id: head.toLowerCase(),
      full_name: rest,
    })
    const student_id = head.toLowerCase()
    const full_name = rest
    if (parsed.success) {
      if (seen.has(student_id)) {
        out.push({ student_id, full_name, result: 'duplicate' as const })
      } else {
        seen.set(student_id, true)
        out.push({
          student_id,
          full_name: parsed.data.full_name,
          // provisional — the create + finalize may promote it verbatim; the
          // caller's roster check against the existing accounts re-labels
          // `duplicate` for an account that already has a profile row.
          result: 'created' as const,
        })
      }
    } else {
      out.push({ student_id, full_name, result: 'malformed' as const })
    }
  }
  return out
}

/**
 * The one-time temporary password: readable-but-not-guessable — 12 chars, no
 * ambiguous glyphs (`O0`, `Il1`), a mixed-case + a digit + a punctuation so the
 * `min(8)` login form + the bcrypt round (<=72 bytes) accept it at the first
 * login, and the `must_change_password` flag makes it one-time: the user must
 * set a new one before proceeding (the first-login force-change flow checks
 * the flag via RLS).
 */
const TEMP_PWD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#$%&*'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGIT = '23456789'
const PUNCT = '#$%&*'
export function genTempPassword(length = 12): string {
  // The password is composition-guaranteed (a mixed-case + a digit + a
  // punctuation land verbatim so the login form's `min(8)` + the bcrypt round
  // (<=72 bytes) always accept it at the first login, and the first-login
  // force-change gate's one-time temp password is guessable-but-not-typed):
  // one upper, one lower, one digit, one punctuation, the rest random.
  const pick = (alphabet: string) => alphabet.at(Math.random() * alphabet.length) ?? ''
  let out = pick(UPPER) + pick(LOWER) + pick(DIGIT) + pick(PUNCT)
  while (out.length < length) {
    out += TEMP_PWD_ALPHABET.at(Math.random() * TEMP_PWD_ALPHABET.length)
  }
  return out
}
