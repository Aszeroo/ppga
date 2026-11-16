import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #76 database seam: the CAI chapter progression and reward model.
 *
 * Progression: `ppg_chapter_unlocks` is the source of truth — chapter N+1
 * opens iff chapter N's best post-test reaches 70%; the global
 * `ppg_module_unlocked` reads that record, and both the chapter state and
 * submit RPCs refuse a locked chapter. A legacy Self-Check pass never opens
 * a chapter, and no client INSERT can fabricate an unlock row.
 *
 * Rewards: exactly one fixed XP ledger row per event (the ledger PK), one
 * chapter badge set per real event, and a Final Test reward helper #84 can
 * call. The Research Pre-Test awards nothing.
 *
 * Hermetic: every test opens its own transaction, resets the learner's
 * attempts/unlocks/ledger/awards in-tx, impersonates the learner when the
 * RPC under test is learner-only, and ROLLS BACK. The reward helpers are
 * definer-only, so the simulated-chapter calls run as the DB owner with an
 * explicit learner id.
 *
 * Guarded: without a live local stack the suite skips (CI stays green).
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

const ids = {
  learnerOne: '64110001-0001-0001-0001-000100010001',
  learnerTwo: '64110002-0002-0002-0002-000200020002',
}

const sql = (statement: string) =>
  execSync(`docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`, {
    input: statement,
    encoding: 'utf8',
  })

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const resetLearner = (learnerId: string) => `
  DELETE FROM ppg_chapter_test_attempts WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_chapter_unlocks WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_xp_ledger WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_badge_awards WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = true, prettest_unlocked_override = false
   WHERE id = '${learnerId}';
  INSERT INTO ppg_pretest_responses
    (learner_id, instrument_version, language, answers, submitted_at)
  VALUES ('${learnerId}', '2026.09.1', 'th', '{"item_1":"A"}'::jsonb, now());`

// #74 archived the legacy spine for the learner journey; the engine-level
// Self-Check test re-publishes module-01 in-tx (production archive stays).
const publishLegacy = `
  UPDATE ppg_modules SET publication_state = 'published' WHERE module_key = 'module-01';`

// The Chapter 1 pilot keys: post pass 10/10, 7/10 and 6/10.
const answers = (letters: string[]) =>
  JSON.stringify(Object.fromEntries(letters.map((letter, index) => [String(index + 1), letter])))
const POST_PASS = answers(['b', 'c', 'a', 'b', 'c', 'a', 'c', 'b', 'b', 'c'])
const POST_SEVEN = answers(['b', 'c', 'a', 'b', 'c', 'a', 'c', 'a', 'a', 'a'])
const POST_SIX = answers(['b', 'c', 'a', 'b', 'c', 'a', 'b', 'a', 'a', 'a'])

const addChapterTwo = `
  INSERT INTO ppg_modules
    (module_key, course_key, order_index, skill_domain, title_th, title_en,
     summary_th, summary_en, publication_state)
  VALUES
    ('chapter-02', 'presentation-program', 2, 'Presentation Principles',
     'x', 'x', 'x', 'x', 'published')
  ON CONFLICT (module_key) DO NOTHING;`

const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

test(
  'Progression: 6/10 keeps chapter-02 locked; a 7/10 pass writes the unlock and opens it',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${asRole('learner', ids.learnerOne)}
        SELECT 'before='||ppg_module_unlocked(auth.uid(), 'chapter-02')::text;
        SELECT 'six='||ppg_chapter_test_submit('chapter-01','post','th','${POST_SIX}'::jsonb)::text;
        SELECT 'six_unlock='||ppg_module_unlocked(auth.uid(), 'chapter-02')::text;
        SELECT 'seven='||ppg_chapter_test_submit('chapter-01','post','th','${POST_SEVEN}'::jsonb)::text;
        SELECT 'after='||ppg_module_unlocked(auth.uid(), 'chapter-02')::text;
        SELECT 'unlock_rows='||count(*) FROM ppg_chapter_unlocks
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-02';
      ROLLBACK;`,
    )
    expect(probe(out, 'before')).toBe('false')
    // 6/10 does not pass and writes no unlock.
    expect(probe(out, 'six').includes('"passed": false')).toBe(true)
    expect(probe(out, 'six_unlock')).toBe('false')
    // 7/10 (exactly 70%) passes on the best score even after a failure.
    const seven = probe(out, 'seven')
    expect(seven.includes('"score": 7')).toBe(true)
    expect(seven.includes('"passed": true')).toBe(true)
    expect(seven.includes('"next_unlocked": true')).toBe(true)
    expect(probe(out, 'after')).toBe('true')
    expect(probe(out, 'unlock_rows')).toBe('1')
  },
)

test(
  'Bypass: a locked chapter is denied by the state/submit RPCs, and a client INSERT cannot forge an unlock row',
  { skip: !hasLocalStack },
  () => {
    // Each attempted bypass is its own transaction: the RPC raises
    // `chapter_locked`, which aborts the tx, so the checks cannot share one.
    const stateOut = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${addChapterTwo}
        ${asRole('learner', ids.learnerOne)}
        SELECT 'state='||ppg_chapter_test_state('chapter-02')::text;
      ROLLBACK;`,
    )
    expect(stateOut.toLowerCase()).toContain('chapter_locked')

    const submitOut = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${addChapterTwo}
        ${asRole('learner', ids.learnerOne)}
        SELECT 'submit='||ppg_chapter_test_submit('chapter-02','post','th','${POST_PASS}'::jsonb)::text;
      ROLLBACK;`,
    )
    expect(submitOut.toLowerCase()).toContain('chapter_locked')

    const attemptsOut = sql(
      `SELECT 'attempts='||count(*) FROM ppg_chapter_test_attempts
        WHERE learner_id = '${ids.learnerOne}' AND chapter_key = 'chapter-02';`,
    )
    // The refused submits scored and stored nothing.
    expect(probe(attemptsOut, 'attempts')).toBe('0')

    // ppg_chapter_unlocks has RLS but no INSERT policy: the client row is denied.
    const insertOut = sql(
      `BEGIN;
        ${asRole('learner', ids.learnerOne)}
        INSERT INTO ppg_chapter_unlocks (learner_id, chapter_key, unlocked_by_score, item_count)
        VALUES (auth.uid(), 'chapter-02', 10, 10);
      ROLLBACK;`,
    )
    expect(insertOut.toLowerCase()).toContain('row-level security')
  },
)

test(
  'XP idempotency: a post-test pass grants the fixed 200 once across retries, never proportional to the score',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${asRole('learner', ids.learnerOne)}
        SELECT 'first='||ppg_chapter_test_submit('chapter-01','post','th','${POST_PASS}'::jsonb)::text;
        SELECT 'replay='||ppg_chapter_test_submit('chapter-01','post','th','${POST_PASS}'::jsonb)::text;
        SELECT 'seven='||ppg_chapter_test_submit('chapter-01','post','th','${POST_SEVEN}'::jsonb)::text;
        RESET ROLE;
        SELECT 'rows='||count(*) FROM ppg_xp_ledger
         WHERE learner_id = '${ids.learnerOne}' AND event_type = 'chapter_posttest_pass'
           AND event_ref = 'chapter-01';
        SELECT 'amount='||amount FROM ppg_xp_ledger
         WHERE learner_id = '${ids.learnerOne}' AND event_type = 'chapter_posttest_pass'
           AND event_ref = 'chapter-01';
      ROLLBACK;`,
    )
    expect(probe(out, 'first').includes('"score": 10')).toBe(true)
    expect(probe(out, 'first').includes('"xp_granted": 200')).toBe(true)
    // replays and a lower later score never grant again (and never shrink).
    expect(probe(out, 'replay').includes('"passed": true')).toBe(true)
    expect(probe(out, 'replay').includes('"xp_granted": 0')).toBe(true)
    expect(probe(out, 'seven').includes('"passed": true')).toBe(true)
    expect(probe(out, 'seven').includes('"xp_granted": 0')).toBe(true)
    expect(probe(out, 'rows')).toBe('1')
    expect(probe(out, 'amount')).toBe('200')
  },
)

test(
  'Badges: a perfect pass fires first_chapter_cleared + perfect_chapter_posttest once; a 7/10 pass fires only the first-chapter badge',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${asRole('learner', ids.learnerOne)}
        SELECT 'perfect='||ppg_chapter_test_submit('chapter-01','post','th','${POST_PASS}'::jsonb)::text;
        SELECT 'replay='||ppg_chapter_test_submit('chapter-01','post','th','${POST_PASS}'::jsonb)::text;
        RESET ROLE;
        SELECT 'first_awards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerOne}' AND badge_key = 'first_chapter_cleared';
        SELECT 'perfect_awards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerOne}' AND badge_key = 'perfect_chapter_posttest';
        SELECT 'all_awards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerOne}' AND badge_key = 'all_chapters_cleared';
        ${resetLearner(ids.learnerTwo)}
        ${asRole('learner', ids.learnerTwo)}
        SELECT 'seven='||ppg_chapter_test_submit('chapter-01','post','th','${POST_SEVEN}'::jsonb)::text;
        RESET ROLE;
        SELECT 'seven_first='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerTwo}' AND badge_key = 'first_chapter_cleared';
        SELECT 'seven_perfect='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerTwo}' AND badge_key = 'perfect_chapter_posttest';
      ROLLBACK;`,
    )
    const perfect = probe(out, 'perfect')
    expect(perfect.includes('"first_chapter_cleared"')).toBe(true)
    expect(perfect.includes('"perfect_chapter_posttest"')).toBe(true)
    expect(probe(out, 'replay').includes('"badges_granted": []')).toBe(true)
    expect(probe(out, 'first_awards')).toBe('1')
    expect(probe(out, 'perfect_awards')).toBe('1')
    expect(probe(out, 'all_awards')).toBe('0')
    // 7/10 is a pass (first chapter) but not perfect.
    expect(probe(out, 'seven').includes('"passed": true')).toBe(true)
    expect(probe(out, 'seven_first')).toBe('1')
    expect(probe(out, 'seven_perfect')).toBe('0')
  },
)

test(
  'All nine chapters: the simulated ninth pass fires all_chapters_cleared; earlier passes do not',
  { skip: !hasLocalStack },
  () => {
    const calls = Array.from({ length: 9 }, (_, i) => {
      const key = `chapter-${String(i + 1).padStart(2, '0')}`
      return `SELECT 'r${i + 1}='||ppg_grant_chapter_rewards('${ids.learnerOne}', '${key}', 10, 10)::text;`
    })
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${calls.join('\n        ')}
        SELECT 'all_awards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerOne}' AND badge_key = 'all_chapters_cleared';
        SELECT 'xp='||sum(amount) FROM ppg_xp_ledger
         WHERE learner_id = '${ids.learnerOne}' AND event_type = 'chapter_posttest_pass';
      ROLLBACK;`,
    )
    // The first eight simulated passes do not fire the nine-chapter badge.
    expect(probe(out, 'r8').includes('all_chapters_cleared')).toBe(false)
    // The ninth does, once.
    expect(probe(out, 'r9').includes('all_chapters_cleared')).toBe(true)
    expect(probe(out, 'all_awards')).toBe('1')
    // Nine fixed 200-XP grants, no score scaling.
    expect(probe(out, 'xp')).toBe('1800')
  },
)

test(
  'Final Test reward: fixed 400 XP and the badge once; no Research Pre-Test reward exists',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        SELECT 'first='||ppg_grant_final_test_reward('${ids.learnerOne}', 'final-test')::text;
        SELECT 'replay='||ppg_grant_final_test_reward('${ids.learnerOne}', 'final-test')::text;
        SELECT 'rows='||count(*) FROM ppg_xp_ledger
         WHERE learner_id = '${ids.learnerOne}' AND event_type = 'final_test_pass';
        SELECT 'amount='||amount FROM ppg_xp_ledger
         WHERE learner_id = '${ids.learnerOne}' AND event_type = 'final_test_pass';
        SELECT 'badges='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${ids.learnerOne}' AND badge_key = 'final_test_complete';
        SELECT 'prettest_events='||count(*) FROM ppg_xp_ledger
         WHERE learner_id = '${ids.learnerOne}' AND event_type like '%pre%';
        SELECT 'prettest_badges='||count(*) FROM ppg_badge_types
         WHERE badge_key like '%prettest%' OR badge_key like '%pre_test%';
      ROLLBACK;`,
    )
    expect(probe(out, 'first').includes('"xp_granted": 400')).toBe(true)
    expect(probe(out, 'first').includes('"badge_granted": true')).toBe(true)
    expect(probe(out, 'replay').includes('"xp_granted": 0')).toBe(true)
    expect(probe(out, 'replay').includes('"badge_granted": false')).toBe(true)
    expect(probe(out, 'rows')).toBe('1')
    expect(probe(out, 'amount')).toBe('400')
    expect(probe(out, 'badges')).toBe('1')
    expect(probe(out, 'prettest_events')).toBe('0')
    expect(probe(out, 'prettest_badges')).toBe('0')
  },
)

test(
  'Self-Check decoupling: legacy passes never open chapter-02 and a chapter-lesson Self-Check awards no XP or badges',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${publishLegacy}
        ${asRole('learner', ids.learnerOne)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '{"1":"a","2":"a"}'::jsonb);
        SELECT 'chapter_unlock='||ppg_module_unlocked(auth.uid(), 'chapter-02')::text;
        SELECT 'unlock_rows='||count(*) FROM ppg_chapter_unlocks WHERE learner_id = auth.uid();
        RESET ROLE;
        DELETE FROM ppg_xp_ledger WHERE learner_id = '${ids.learnerOne}';
        DELETE FROM ppg_badge_awards WHERE learner_id = '${ids.learnerOne}';
        ${asRole('learner', ids.learnerOne)}
        SELECT 'chapter_sc='||ppg_check_self_check('chapter-01-lesson-01', '{}'::jsonb)::text;
        RESET ROLE;
        SELECT 'chapter_xp='||count(*) FROM ppg_xp_ledger WHERE learner_id = '${ids.learnerOne}';
        SELECT 'chapter_badges='||count(*) FROM ppg_badge_awards WHERE learner_id = '${ids.learnerOne}';
      ROLLBACK;`,
    )
    expect(probe(out, 'chapter_unlock')).toBe('false')
    expect(probe(out, 'unlock_rows')).toBe('0')
    // A chapter-lesson Self-Check records its event but grants nothing.
    expect(probe(out, 'chapter_sc').includes('"xp_granted": 0')).toBe(true)
    expect(probe(out, 'chapter_sc').includes('"badge_granted": false')).toBe(true)
    expect(probe(out, 'chapter_xp')).toBe('0')
    expect(probe(out, 'chapter_badges')).toBe('0')
  },
)

test(
  'Leaderboard stays XP-only: chapter rewards rank by XP and no score field appears',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${resetLearner(ids.learnerOne)}
        ${resetLearner(ids.learnerTwo)}
        SELECT ppg_grant_chapter_rewards('${ids.learnerOne}', 'chapter-01', 10, 10);
        ${asRole('learner', ids.learnerOne)}
        SELECT 'board='||ppg_xp_leaderboard()::text;
      ROLLBACK;`,
    )
    const board = probe(out, 'board')
    expect(board.includes('"total_xp": 200')).toBe(true)
    expect(board.includes('"rank": 1')).toBe(true)
    // ADR-0001: never a score/pre-test/post-test field on the board.
    expect(board.includes('"score"')).toBe(false)
    expect(board.includes('"post_test"')).toBe(false)
    expect(board.includes('"prettest"')).toBe(false)
  },
)
