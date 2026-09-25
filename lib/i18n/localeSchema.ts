import { z } from 'zod'

/**
 * Ticket #4 locale persistence schema: the selector POSTs `{ locale }` to the
 * API route; Zod bounds it to the routing locales (`th`/`en`) before any
 * network call — a junk value is a validation error naming the field, never a
 * blank screen. It is a pure function (no Supabase/Postgres) so the unit test
 * runs it in CI (`test/unit/localePersistence.test.ts`).
 */
export const localeSchema = z
  .object({
    locale: z.enum(['th', 'en']),
  })
  .strict()
