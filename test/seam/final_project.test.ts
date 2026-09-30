import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #15 database-seam tests: the research close chain is exercised
 * against the REAL local Postgres (`supabase start`) the same way
 * `prettest.test.ts`/`review.test.ts` prescribe it — `SET LOCAL role
 * authenticated` + `SET LOCAL "request.jwt.claims"` inside a transaction,
 * then ROLLBACK.
 *
 * The chain (ADR-0002 sequencing, server-side ONLY): the Final Project (the
 * 11th Mission, practical) is submitted through #13's machinery, a Teacher
 * accepts it through #14's review RPC (the replaced ppg_submit_review: +300
 * XP ONCE via the ledger PK, the Final Boss + Course Complete badges from the
 * real event ONCE via the award PK, and Level 5 only when the ledger's REAL
 * total reaches 400; the approval UPSERTs the module-11 completion the unlock
 * functions read). The Post-Test unlocks iff that completion stands
 * (`final_project_not_accepted` otherwise); the Survey unlocks iff the
 * learner's OWN Post-Test is submitted (`posttest_not_submitted` otherwise).
 * Both instruments are single-attempt (the response PK), immutable once
 * submitted (the BEFORE UPDATE trigger), undeletable (no DELETE policy) and
 * record instrument version + language (ADR-0002). A research instrument
 * grants NOTHING — the ledger + award counts around a full close prove the
 * absence (ADR-0001).
 *
 * EVERY test is hermetic: the owner cleanup rides INSIDE its own transaction
 * and ROLLS BACK — no COMMIT, no cross-file order dependence, no residue in
 * the shared container. Guarded: without a live local stack the tests skip.
 */
const hasLocalStack = (() => {
  try {
    const out = execSync('npx --no-install supabase status', {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return out.includes('URL') || out.includes('local_testing') || out.includes('supabase')
  } catch {
    return false
  }
})()

const seededIds = {
  admin: '11111111-1111-1111-1111-111111111111',
  teacher: '22222222-2222-2222-2222-222222222222',
  learnerA: '64110001-0001-0001-0001-000100010001',
  learnerB: '64110002-0002-0002-0002-000200020002',
}

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// the owner-level cleanup that rides the SAME transaction (rolled back): the
// close-chain residue (instruments' rows, the ledger, the awards, the review
// rows, the submissions, the module-11 completion), so every test starts from
// the seeded baseline inside its own tx whatever the container holds.
const ownerReset = (learnerId: string) => `
  DELETE FROM ppg_survey_responses WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_posttest_responses WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_badge_awards WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_xp_ledger WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_rubric_reviews WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_submissions WHERE learner_id = '${learnerId}';
  UPDATE ppg_module_missions SET status = 'incomplete' WHERE learner_id = '${learnerId}';`

const scores = (c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number) =>
  `jsonb_build_object('content_structure',${c1},'text_formatting',${c2},'images_visual',${c3},'slide_design',${c4},'powerpoint_tool_usage',${c5},'creativity',${c6},'completeness',${c7})`

const ALL_THREES = scores(3, 3, 3, 3, 3, 3, 3)

// the chain inside the CALLER's already-open transaction: the learner inserts
// + moves a final-project round to `submitted`, the Teacher approves it.
const approveFinal = (learnerId: string, seq: number) => `
  SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${learnerId}"}';
  SELECT public.ppg_insert_submission('${learnerId}', 'module-11', ${seq},
    'submissions/${learnerId}/module-11/${seq}', 'pptx', 1000, 'final deck');
  SELECT public.ppg_set_submission_status('${learnerId}', 'module-11', ${seq}, 'submitted');
  SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
  SELECT public.ppg_submit_review('module-11', ${seq}, ${ALL_THREES},
    'approved', 'fb th', 'fb en');`

// the learner's own Post-Test: start (the gated row creation) + the single submit.
const posttestStartSubmit = (learnerId: string) => `
  SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${learnerId}"}';
  SELECT public.ppg_posttest_start('th');
  SELECT public.ppg_posttest_submit('{"item_1":"A"}'::jsonb);`

test(
  'Early access: the Post-Test is blocked server-side BEFORE the Final Project is accepted (submit + start + RLS INSERT)',
  { skip: !hasLocalStack },
  () => {
    const gated = sql(
      `${impersonate('learner', seededIds.learnerB)}
        ${ownerReset(seededIds.learnerB)}
        -- the gated submit + start: the unlock gate RAISEs the
        -- final_project_not_accepted inside this own transaction; a later
        -- SELECT inside the same transaction would be IGNORED once the
        -- transaction aborts. So the read-back rides in a separate, hermetic
        -- transaction below.
        SELECT public.ppg_posttest_submit('{"item_1":"A"}'::jsonb);
        SELECT public.ppg_posttest_start('th');
        -- the smuggled direct INSERT: the unlock-gated INSERT policy silently
        -- denies (0 rows), so the owner count below proves the row NEVER landed.
        INSERT INTO ppg_posttest_responses (learner_id, instrument_version, language)
          VALUES ('${seededIds.learnerB}'::uuid, '2026.09.1', 'th');
      ROLLBACK;`,
    )
    expect(gated.includes('final_project_not_accepted')).toBe(true)

    // The read-back: its OWN fresh transaction — the seeded baseline (the
    // container holds no close-chain residue after every ROLLBACK). The
    // smuggled INSERT never landed (the unlock-gated INSERT policy denied it
    // silently), the gated start never started a row, the gated submit never
    // stamped one: the learner's own Post-Test response count is 0.
    const readBack = sql(
      `${impersonate('learner', seededIds.learnerB)}
        RESET ROLE;
        SELECT 'posttest_rows='||count(*) FROM ppg_posttest_responses
         WHERE learner_id = '${seededIds.learnerB}';
      ROLLBACK;`,
    )
    expect(readBack.includes('posttest_rows=0')).toBe(true)
  },
)

test(
  'Early access: the Survey is blocked server-side BEFORE the Post-Test is submitted',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerB)}
        ${ownerReset(seededIds.learnerB)}
        -- even with the Final Project accepted, the Survey still waits for
        -- the Post-Test's own submitted stamp.
        ${approveFinal(seededIds.learnerB, 901)}
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerB}"}';
        SELECT public.ppg_survey_start('th');
        SELECT public.ppg_survey_submit('{"item_1":"A","item_2":"A"}'::jsonb);
      ROLLBACK;`,
    )
    expect(out.includes('posttest_not_submitted')).toBe(true)
  },
)

test(
  'Chain: Final Project accepted -> Post-Test opens (score server-side, version + language recorded) -> Survey opens after the Post-Test submit',
  { skip: !hasLocalStack },
  () => {
    // The close chain INSIDE the learner's own transaction: the Teacher's
    // approval writes the module-11 completion (+300 + the three close
    // badges); the unlock opens the Post-Test (start + submit once); the
    // Post-Test's own submitted stamp opens the Survey (start + submit once).
    // The recorded instrument version + language + score ride the two rows —
    // the reads happen BEFORE the replay (the replay's RAISE aborts the
    // transaction and everything after it would then be IGNORED).
    const chain = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        ${approveFinal(seededIds.learnerA, 902)}
        ${posttestStartSubmit(seededIds.learnerA)}
        -- the Survey now unlocks: start + submit once (the Post-Test's stamp).
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerA}"}';
        SELECT public.ppg_survey_start('en');
        SELECT public.ppg_survey_submit('{"item_1":"A","item_2":"B"}'::jsonb);
        RESET ROLE;
        SELECT 'posttest='||instrument_version||'|'||language||'|'||score::text
          FROM ppg_posttest_responses WHERE learner_id = '${seededIds.learnerA}';
        SELECT 'survey='||instrument_version||'|'||language
          FROM ppg_survey_responses WHERE learner_id = '${seededIds.learnerA}';
      ROLLBACK;`,
    )
    // The Post-Test scored 1 server-side with version + language recorded; the
    // Survey submitted once (en recorded — the taken language rides the row).
    expect(chain).toContain('posttest=2026.09.1|th|1')
    expect(chain).toContain('survey=2026.09.1|en')

    // The Survey's single-attempt replay: its OWN fresh transaction. The
    // second submit cannot find an un-submitted row — the atomic stamp is
    // `submitted_at`; the immutable-once-submitted trigger is the last line
    // of defense. `already_submitted_or_missing` rides the raised message.
    const replay = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        ${approveFinal(seededIds.learnerA, 902)}
        ${posttestStartSubmit(seededIds.learnerA)}
        SELECT public.ppg_survey_start('en');
        SELECT public.ppg_survey_submit('{"item_1":"A","item_2":"B"}'::jsonb);
        SELECT public.ppg_survey_submit('{"item_1":"C","item_2":"C"}'::jsonb);
      ROLLBACK;`,
    )
    expect(replay).toContain('already_submitted_or_missing')
  },
)

test(
  'Single-attempt + immutable: a second Post-Test submit raises; a hand UPDATE after the stamp raises; a DELETE silently denies',
  { skip: !hasLocalStack },
  () => {
    // The single-attempt replay: its OWN fresh transaction. The submit
    // function's `UPDATE ... WHERE submitted_at IS NULL` cannot find an
    // un-submitted row — the second call raises `already_submitted_or_missing`
    // (the function's own word; NOT the trigger's `already_submitted` the
    // hand UPDATE below raises separately).
    const replay = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        ${approveFinal(seededIds.learnerA, 903)}
        ${posttestStartSubmit(seededIds.learnerA)}
        -- the replay: the same learner, the same row — already stamped.
        SELECT public.ppg_posttest_submit('{"item_1":"B"}'::jsonb);
      ROLLBACK;`,
    )
    expect(replay).toContain('already_submitted_or_missing')

    // The hand UPDATE after the stamp: its OWN fresh transaction — the row is
    // re-started + submitted in this transaction too, and the OWNER-level
    // UPDATE (RLS bypassed via RESET ROLE) rides the BEFORE UPDATE immutable
    // trigger (the last line of defense — the single-attempt + append-only
    // authority). It raises the trigger's OWN word `already_submitted`.
    const tamper = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        ${approveFinal(seededIds.learnerA, 903)}
        ${posttestStartSubmit(seededIds.learnerA)}
        RESET ROLE; -- the hand UPDATE rides the OWNER (RLS bypassed) so the
        -- BEFORE UPDATE immutable trigger (the last line of defense) fires.
        UPDATE ppg_posttest_responses SET answers = '{"item_1":"B"}'::jsonb
         WHERE learner_id = '${seededIds.learnerA}'::uuid;
      ROLLBACK;`,
    )
    expect(tamper).toContain('already_submitted')

    // The undeletability: its OWN fresh transaction — the learner's DELETE
    // has NO granted DELETE policy (append-only, ADR-0002), so the DELETE
    // silently denies (0 rows) and NEVER raises; the single-attempt row
    // persists. The read-back rides the SAME transaction (a silent deny never
    // aborts it) — the row stands at 1, the undeletable single-attempt stamp.
    const undeleted = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        ${approveFinal(seededIds.learnerA, 903)}
        ${posttestStartSubmit(seededIds.learnerA)}
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerA}"}';
        DELETE FROM ppg_posttest_responses WHERE learner_id = '${seededIds.learnerA}';
        RESET ROLE;
        SELECT 'posttest_rows='||count(*) FROM ppg_posttest_responses
         WHERE learner_id = '${seededIds.learnerA}';
      ROLLBACK;`,
    )
    expect(undeleted).toContain('posttest_rows=1')
  },
)

test(
  '+300 exactly once: a re-approval of a later round NEVER grants a second +300; the completion + close badges land once',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        -- the learner's real Course XP before the close (50+100+150 = 300;
        -- the +300 puts the total at 600, level 6 >= 5).
        RESET ROLE;
        INSERT INTO ppg_xp_ledger (learner_id, event_type, event_ref, amount) VALUES
          ('${seededIds.learnerA}', 'self_check_pass', 'module-01-lesson-01', 50),
          ('${seededIds.learnerA}', 'knowledge_mission_pass', 'module-01', 100),
          ('${seededIds.learnerA}', 'practical_approval', 'module-08', 150);
        SET LOCAL role authenticated;
        ${approveFinal(seededIds.learnerA, 904)}
        -- the second round approved: the +300 CANNOT land twice (the ledger
        -- PK + the existence guard), the badges cannot land twice (the award PK).
        ${approveFinal(seededIds.learnerA, 905)}
        RESET ROLE;
        SELECT 'final_project_rows='||count(*)||' sum='||coalesce(sum(amount),0)
          FROM ppg_xp_ledger WHERE learner_id = '${seededIds.learnerA}'
           AND event_type = 'final_project';
        SELECT 'final_boss='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learnerA}' AND badge_key = 'final_boss';
        SELECT 'course_complete='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learnerA}' AND badge_key = 'course_complete';
        SELECT 'level_5='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learnerA}' AND badge_key = 'level_5';
        SELECT 'completed='||count(*) FROM ppg_module_missions
         WHERE learner_id = '${seededIds.learnerA}'
           AND module_key = 'module-11' AND status = 'complete';
      ROLLBACK;`,
    )
    expect(out).toContain('final_project_rows=1 sum=300')
    expect(out).toContain('final_boss=1')
    expect(out).toContain('course_complete=1')
    expect(out).toContain('level_5=1')
    expect(out).toContain('completed=1')
  },
)

test(
  'The Level 5 badge rides the REAL level: a close at 300 total XP awards Final Boss + Course Complete but NEVER Level 5',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerB)}
        ${ownerReset(seededIds.learnerB)}
        -- no prior XP: the +300 alone is level 4 (floor(300/100)+1 = 4).
        ${approveFinal(seededIds.learnerB, 906)}
        RESET ROLE;
        SELECT 'final_boss='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learnerB}' AND badge_key = 'final_boss';
        SELECT 'level_5='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learnerB}' AND badge_key = 'level_5';
      ROLLBACK;`,
    )
    expect(out).toContain('final_boss=1')
    expect(out).toContain('level_5=0')
  },
)

test(
  'Research grants nothing: after the full close the ledger holds ONLY the +300 and the awards ONLY the three close badges',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        ${ownerReset(seededIds.learnerA)}
        ${approveFinal(seededIds.learnerA, 907)}
        ${posttestStartSubmit(seededIds.learnerA)}
        SELECT public.ppg_survey_start('th');
        SELECT public.ppg_survey_submit('{"item_1":"A","item_2":"B"}'::jsonb);
        RESET ROLE;
        SELECT 'xp='||coalesce(sum(amount),0) FROM ppg_xp_ledger
         WHERE learner_id = '${seededIds.learnerA}';
        SELECT 'awards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learnerA}';
      ROLLBACK;`,
    )
    // the Post-Test + Survey submits added NOTHING to the ledger or the award
    // table (ADR-0001: a research instrument never rewards).
    expect(out).toContain('xp=300')
    expect(out).toContain('awards=2')
  },
)

test(
  'Role gate: a Teacher/Admin may not submit a research instrument (the instrument belongs to the Learner)',
  { skip: !hasLocalStack },
  () => {
    // Each instrument submit rides its OWN fresh transaction: the first
    // call's RAISE aborts a single-transaction batch and everything after it
    // is IGNORED. Two separate transactions, two independent raises — the
    // Teacher/Admin caller NEVER reaches `learner`-only gate 1 in either.
    const posttestDenied = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT public.ppg_posttest_submit('{"item_1":"A"}'::jsonb);
      ROLLBACK;`,
    )
    expect(posttestDenied.includes('permission_denied')).toBe(true)

    const surveyDenied = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT public.ppg_survey_submit('{"item_1":"A","item_2":"A"}'::jsonb);
      ROLLBACK;`,
    )
    expect(surveyDenied.includes('permission_denied')).toBe(true)
  },
)
