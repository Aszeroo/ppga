-- ============================================================================
-- PPGA #74: the CAI chapter pre/post-test engine, proven end-to-end on
-- Chapter 1 of the new Presentation Program course (ADR-0005).
--
-- The new course identity (`presentation-program`) and `chapter-01` land as
-- FRESH rows. The legacy `powerpoint-creation` course and its modules are
-- soft-archived (publication_state = archived, never deleted) so the learner
-- course map resolves only the active course. The Chapter is a module row:
-- ADR-0005 keeps the `ppg_modules` / `module_key` schema names and calls the
-- structure a Chapter in domain language.
--
-- The assessment model:
--   * `ppg_chapter_test_questions` stores one row per option. The answer key
--     (`is_correct`) never reaches a client: RLS is enabled with NO select
--     policy, and the read RPC returns prompts + options only.
--   * `ppg_chapter_test_attempts` is append-only. A Chapter pre-test is one
--     attempt (the partial unique index); the post-test allows retries. The
--     FIRST post-test attempt is the research measure (attempt_seq = 1) and
--     the BEST score decides the 70% gate.
--   * `ppg_chapter_unlocks` records the next Chapter a passing post-test
--     unlocked. The rule stays LOCAL to the submit path (#76 owns the global
--     progression rewrite).
--
-- The Chapter 1 pilot seeds 10 pre-test items and 10 post-test items as
-- parallel forms over the same ten objectives (bilingual, ADR-0003).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The active course: an explicit flag, because the course table had no
--    publication state. The legacy course keeps its row (soft archive).
-- ----------------------------------------------------------------------------
alter table public.ppg_courses
  add column is_active boolean not null default true;

comment on column public.ppg_courses.is_active is
  'PPGA #74: the active-course flag the learner Course map filters on. The legacy powerpoint-creation row is soft-archived by flipping this to false; nothing is deleted (ADR-0005).';

insert into public.ppg_skill_domains (domain, label_th, label_en)
  values ('Presentation Principles', 'หลักของการนำเสนอ', 'Presentation Principles')
on conflict (domain) do nothing;

insert into public.ppg_courses (course_key, title_th, title_en, is_active)
  values (
    'presentation-program',
    'นำเสนอ (21910-2006)',
    'Presentation Program (21910-2006)',
    true
  )
on conflict (course_key) do nothing;

update public.ppg_courses
   set is_active = false
 where course_key = 'powerpoint-creation';

-- Chapter 1 of the new course. The order_index is course-local (the unique
-- constraint is (course_key, order_index)), so it can coexist with the
-- archived legacy modules.
insert into public.ppg_modules
  (module_key, course_key, order_index, skill_domain, title_th, title_en,
   summary_th, summary_en, publication_state)
  values (
    'chapter-01',
    'presentation-program',
    1,
    'Presentation Principles',
    'หลักของการนำเสนอ',
    'Principles of presentation',
    'จุดประสงค์ผู้ฟังและโครงสร้าง',
    'What a presentation is for, who it is for, and how to structure it.',
    'published'
  )
on conflict (module_key) do nothing;

-- Soft archive: the legacy modules stay in the database (teachers/admins
-- still see them) but never ride the learner Course map again.
update public.ppg_modules
   set publication_state = 'archived'
 where course_key = 'powerpoint-creation';

-- ----------------------------------------------------------------------------
-- 2. The Course map resolves the ACTIVE course only for a learner. Teachers
--    and admins keep seeing every row including archived ones.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_course_map()
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'module_key', m.module_key,
      'order_index', m.order_index,
      'skill_domain', m.skill_domain,
      'title_th', m.title_th,
      'title_en', m.title_en,
      'summary_th', m.summary_th,
      'summary_en', m.summary_en,
      'publication_state', m.publication_state,
      'lock_state',
        CASE WHEN public.ppg_module_unlocked(auth.uid(), m.module_key) THEN 'open' ELSE 'locked' END
    ) ORDER BY m.order_index
  )
  FROM public.ppg_modules m
  JOIN public.ppg_courses c ON c.course_key = m.course_key
  WHERE auth.role() IN ('teacher', 'admin')
     OR (
       c.is_active
       AND m.publication_state = 'published'
       AND public.ppg_learner_gated(auth.uid())
     );
$$;

revoke execute on function public.ppg_course_map()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_course_map()
  to service_role, authenticated;

comment on function public.ppg_course_map() is
  'PPGA #9 widened by #74: the Course map — a learner reads only the ACTIVE course''s published modules (legacy archived modules never appear); teacher/admin see every row. The real lock state per row still rides ppg_module_unlocked.';

-- The unlock rule's previous-module lookup is scoped to the SAME course
-- (#74). Without the scope a newly seeded Chapter would read whichever
-- order-1 module happened to come back first (legacy vs active course).
create or replace function public.ppg_module_unlocked(p_caller uuid, p_module_key text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order integer;
begin
  SELECT m.order_index INTO v_order
    FROM public.ppg_modules m
  WHERE m.module_key = p_module_key;
  if v_order IS NULL then
    return false;
  end if;

  if v_order = 1 then
    return true;
  end if;

  return EXISTS (
    SELECT 1
      FROM public.ppg_module_missions mi
    WHERE mi.learner_id = p_caller
      AND mi.status = 'complete'
      AND mi.module_key = (
        SELECT m2.module_key
          FROM public.ppg_modules m2
          JOIN public.ppg_modules m_cur ON m_cur.module_key = p_module_key
        WHERE m2.course_key = m_cur.course_key
          AND m2.order_index = v_order - 1
        LIMIT 1
      )
  );
end;
$$;

revoke execute on function public.ppg_module_unlocked(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_unlocked(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_module_unlocked(uuid, text) is
  'PPGA #9: the linear-rule authority — module 1 open on the #8 gate alone; module N+1 iff module N''s Mission is `complete` for the CALLER. PPGA #74 scopes the previous-module lookup to the SAME course so the active Chapter spine and the archived legacy spine never read each other.';

-- ----------------------------------------------------------------------------
-- 3. The Chapter question bank. One row per option; the answer key is a
--    server-side column with NO client SELECT policy. The bank guard rejects
--    malformed banks at commit (odd forms, duplicate option keys through the
--    PK, missing key, mismatched pre/post coverage).
-- ----------------------------------------------------------------------------
create table public.ppg_chapter_test_questions (
  chapter_key text not null references public.ppg_modules (module_key) on delete cascade,
  phase text not null,
  form text not null,
  order_index integer not null,
  objective_key text not null,
  option_key text not null,
  prompt_th text not null,
  prompt_en text not null,
  option_th text not null,
  option_en text not null,
  is_correct boolean not null,
  primary key (chapter_key, phase, form, order_index, option_key),
  constraint ppg_chapter_test_phase_check check (phase in ('pre', 'post')),
  constraint ppg_chapter_test_form_check check (form in ('a', 'b')),
  constraint ppg_chapter_test_order_check check (order_index between 1 and 10),
  constraint ppg_chapter_test_option_check check (option_key in ('a', 'b', 'c'))
);

comment on table public.ppg_chapter_test_questions is
  'PPGA #74: the Chapter pre/post question bank, one row per option. `is_correct` is the server-side answer key — RLS is enabled with NO select policy, so a client never reads it; the read RPC returns prompts + options only. ADR-0005 keeps the pre/post banks as parallel forms over the same objectives.';
comment on column public.ppg_chapter_test_questions.objective_key is
  'PPGA #74: the objective a parallel pre/post pair covers; the bank guard requires the same objective set in both phases.';
comment on column public.ppg_chapter_test_questions.form is
  'PPGA #74: the parallel form. The pre-test bank uses form `a`, the post-test bank form `b`.';
comment on column public.ppg_chapter_test_questions.is_correct is
  'PPGA #74: the answer key, server-side only. No RLS select policy grants a client this table; scoring reads it under the definer''s rights.';

alter table public.ppg_chapter_test_questions enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policy: the bank is seeded by migration and
-- read only through the definer RPCs. A client SELECT returns no rows.

create or replace function public.ppg_chapter_test_bank_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chapter text := coalesce(new.chapter_key, old.chapter_key);
  v_phase text := coalesce(new.phase, old.phase);
  v_form text := coalesce(new.form, old.form);
  v_bad integer;
  v_pre integer;
  v_post integer;
  v_pre_obj integer;
  v_post_obj integer;
  v_unpaired integer;
begin
  if v_chapter is null or v_phase is null or v_form is null then
    return null;
  end if;

  -- Every item in the touched (chapter, phase, form) must have exactly three
  -- options and exactly one correct answer. A deleted option or a cleared key
  -- reaches `malformed_bank` at commit (the constraint trigger is deferred).
  select count(*) into v_bad
    from (
      select order_index
        from public.ppg_chapter_test_questions
       where chapter_key = v_chapter
         and phase = v_phase
         and form = v_form
       group by order_index
      having count(*) <> 3
          or count(*) filter (where is_correct) <> 1
    ) x;
  if v_bad > 0 then
    raise exception 'malformed_bank: each item needs exactly 3 options and exactly one is_correct (chapter %, phase %, form %)', v_chapter, v_phase, v_form;
  end if;

  -- Pre and post are parallel forms: equal item counts and equal objective
  -- coverage.
  select count(distinct order_index) into v_pre
    from public.ppg_chapter_test_questions
   where chapter_key = v_chapter and phase = 'pre';
  select count(distinct order_index) into v_post
    from public.ppg_chapter_test_questions
   where chapter_key = v_chapter and phase = 'post';
  if v_pre <> v_post then
    raise exception 'malformed_bank: pre/post item counts must match (pre %, post %)', v_pre, v_post;
  end if;

  if v_pre > 0 then
    select count(distinct objective_key) into v_pre_obj
      from public.ppg_chapter_test_questions
     where chapter_key = v_chapter and phase = 'pre';
    select count(distinct objective_key) into v_post_obj
      from public.ppg_chapter_test_questions
     where chapter_key = v_chapter and phase = 'post';
    if v_pre_obj <> v_post_obj then
      raise exception 'malformed_bank: pre/post objective coverage must match (pre %, post %)', v_pre_obj, v_post_obj;
    end if;

    select count(*) into v_unpaired
      from (
        select objective_key
          from public.ppg_chapter_test_questions
         where chapter_key = v_chapter
         group by objective_key
        having count(distinct phase) <> 2
      ) y;
    if v_unpaired > 0 then
      raise exception 'malformed_bank: every objective must appear in both the pre and post banks';
    end if;
  end if;

  return null;
end;
$$;

create constraint trigger ppg_chapter_test_bank_guard
  after insert or update or delete on public.ppg_chapter_test_questions
  deferrable initially deferred
  for each row
  execute function public.ppg_chapter_test_bank_guard();

comment on function public.ppg_chapter_test_bank_guard() is
  'PPGA #74: the deferred bank-integrity constraint — exactly 3 options and exactly 1 correct answer per item, equal pre/post item counts, and the same objectives in both parallel forms. Malformed banks are rejected at COMMIT.';

-- ----------------------------------------------------------------------------
-- 4. The append-only attempts: pre-test one attempt, post-test retries.
--    The first row (attempt_seq = 1) is the research measure; the best score
--    decides the gate.
-- ----------------------------------------------------------------------------
create table public.ppg_chapter_test_attempts (
  learner_id uuid not null references auth.users (id) on delete cascade,
  chapter_key text not null references public.ppg_modules (module_key) on delete cascade,
  phase text not null,
  attempt_seq integer not null,
  language text not null,
  answers jsonb not null,
  score integer not null,
  item_count integer not null,
  submitted_at timestamptz not null default now(),
  primary key (learner_id, chapter_key, phase, attempt_seq),
  constraint ppg_chapter_test_attempt_phase_check check (phase in ('pre', 'post')),
  constraint ppg_chapter_test_attempt_language_check check (language in ('th', 'en')),
  constraint ppg_chapter_test_attempt_seq_check check (attempt_seq >= 1),
  constraint ppg_chapter_test_attempt_score_check check (score >= 0),
  constraint ppg_chapter_test_attempt_count_check check (item_count > 0)
);

comment on table public.ppg_chapter_test_attempts is
  'PPGA #74: append-only Chapter test attempts. The pre-test is single-attempt (the partial unique index); the post-test allows retries. attempt_seq = 1 is the research measure; max(score) over post attempts decides the 70% unlock. No client INSERT/UPDATE/DELETE policy — only the submit definer writes.';

create unique index ppg_chapter_test_single_pre_attempt
  on public.ppg_chapter_test_attempts (learner_id, chapter_key)
  where phase = 'pre';

alter table public.ppg_chapter_test_attempts enable row level security;

create policy ppg_chapter_test_attempts_select on public.ppg_chapter_test_attempts
  for select
  using (
    (auth.role() = 'learner' and learner_id = auth.uid())
    OR auth.role() = 'teacher'
    OR auth.role() = 'admin'
  );

-- No INSERT/UPDATE/DELETE policy: only the submit RPC (definer) writes; a
-- client can never rewrite the first-score research measure.

-- ----------------------------------------------------------------------------
-- 5. The local unlock record: which next Chapter a passing post-test opened.
--    Deliberately local to the Chapter submit path (#76 rewrites global
--    progression).
-- ----------------------------------------------------------------------------
create table public.ppg_chapter_unlocks (
  learner_id uuid not null references auth.users (id) on delete cascade,
  chapter_key text not null,
  unlocked_by_score integer not null,
  item_count integer not null,
  unlocked_at timestamptz not null default now(),
  primary key (learner_id, chapter_key),
  constraint ppg_chapter_unlocks_key_check check (chapter_key ~ '^chapter-[0-9]{2}$'),
  constraint ppg_chapter_unlocks_score_check check (unlocked_by_score >= 0),
  constraint ppg_chapter_unlocks_count_check check (item_count > 0)
);

comment on table public.ppg_chapter_unlocks is
  'PPGA #74: the local Chapter unlock record. A post-test best score of >=70% inserts the NEXT chapter key here; the rule lives in the submit path only (#76 owns global progression). Not FK-scoped to ppg_modules so Chapter 2 can be unlocked before its content row lands.';

alter table public.ppg_chapter_unlocks enable row level security;

create policy ppg_chapter_unlocks_select on public.ppg_chapter_unlocks
  for select
  using (
    (auth.role() = 'learner' and learner_id = auth.uid())
    OR auth.role() = 'teacher'
    OR auth.role() = 'admin'
  );

-- No INSERT/UPDATE/DELETE policy: only the submit RPC (definer) writes.

-- ----------------------------------------------------------------------------
-- 6. Read helpers: the bank WITHOUT the key, and the per-question feedback
--    (right/wrong only, never the correct option key).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_chapter_test_bank(
  p_chapter_key text,
  p_phase text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_index', q.order_index,
        'objective_key', q.objective_key,
        'prompt_th', q.prompt_th,
        'prompt_en', q.prompt_en,
        'options', (
          select jsonb_agg(
            jsonb_build_object(
              'option_key', o.option_key,
              'option_th', o.option_th,
              'option_en', o.option_en
            ) order by o.option_key
          )
          from public.ppg_chapter_test_questions o
          where o.chapter_key = q.chapter_key
            and o.phase = q.phase
            and o.form = q.form
            and o.order_index = q.order_index
        )
      ) order by q.order_index
    ),
    '[]'::jsonb
  )
  from public.ppg_chapter_test_questions q
  where q.chapter_key = p_chapter_key
    and q.phase = p_phase
    and q.form = case p_phase when 'pre' then 'a' else 'b' end
    and q.option_key = 'a';
$$;

revoke execute on function public.ppg_chapter_test_bank(text, text)
  from public, anon, authenticator, supabase_auth_admin;

comment on function public.ppg_chapter_test_bank(text, text) is
  'PPGA #74: the question bank the UI shows — prompts + options only, never the key column. Internal helper; not executable by clients (the state RPC calls it as definer).';

create or replace function public.ppg_chapter_test_feedback(
  p_learner uuid,
  p_chapter_key text,
  p_phase text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_index', q.order_index,
        'chosen', coalesce(a.answers ->> q.order_index::text, ''),
        'correct', coalesce(a.answers ->> q.order_index::text, '') = q.option_key
      ) order by q.order_index
    ),
    '[]'::jsonb
  )
  from public.ppg_chapter_test_questions q
  join lateral (
    select answers
      from public.ppg_chapter_test_attempts
     where learner_id = p_learner
       and chapter_key = p_chapter_key
       and phase = p_phase
     order by attempt_seq desc
     limit 1
  ) a on true
  where q.chapter_key = p_chapter_key
    and q.phase = p_phase
    and q.form = case p_phase when 'pre' then 'a' else 'b' end
    and q.is_correct;
$$;

revoke execute on function public.ppg_chapter_test_feedback(uuid, text, text)
  from public, anon, authenticator, supabase_auth_admin;

comment on function public.ppg_chapter_test_feedback(uuid, text, text) is
  'PPGA #74: per-question feedback for the latest attempt — order_index + chosen + correct only. The correct option key is NEVER returned. Internal helper; not executable by clients.';

-- ----------------------------------------------------------------------------
-- 7. The state RPC: chapter title, both banks, attempt scores, feedback and
--    the local unlock state. Learner-gated; teacher/admin may preview.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_chapter_test_state(p_chapter_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_chapter public.ppg_modules%rowtype;
  v_next text;
  v_pre jsonb;
  v_post jsonb;
begin
  if auth.role() not in ('learner', 'teacher', 'admin') then
    raise exception 'permission_denied: ppg_chapter_test_state is learner/teacher/admin only';
  end if;

  if p_chapter_key !~ '^chapter-[0-9]{2}$' then
    raise exception 'chapter_denied: p_chapter_key must look like chapter-NN';
  end if;

  select * into v_chapter
    from public.ppg_modules m
   where m.module_key = p_chapter_key;
  if not found then
    raise exception 'chapter_missing: no chapter row for %', p_chapter_key;
  end if;

  if auth.role() = 'learner' then
    if not public.ppg_learner_gated(auth.uid()) then
      raise exception 'gate_closed: the #8 gate must pass before chapter tests';
    end if;
    if v_chapter.publication_state <> 'published' then
      raise exception 'chapter_missing: the chapter is not published';
    end if;
    if not exists (
      select 1 from public.ppg_courses c
       where c.course_key = v_chapter.course_key and c.is_active
    ) then
      raise exception 'chapter_denied: the chapter is not on the active course';
    end if;
  end if;

  v_next := 'chapter-' || lpad((substring(p_chapter_key from 9)::integer + 1)::text, 2, '0');

  v_pre := jsonb_build_object(
    'questions', public.ppg_chapter_test_bank(p_chapter_key, 'pre'),
    'total', (
      select count(distinct order_index)
        from public.ppg_chapter_test_questions
       where chapter_key = p_chapter_key and phase = 'pre' and form = 'a'
    ),
    'attempts', (
      select count(*) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
    ),
    'first_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
       order by attempt_seq asc limit 1
    ),
    'best_score', (
      select max(score) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
    ),
    'last_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
       order by attempt_seq desc limit 1
    ),
    'submitted_at', (
      select submitted_at from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
       order by attempt_seq desc limit 1
    ),
    'feedback', public.ppg_chapter_test_feedback(auth.uid(), p_chapter_key, 'pre')
  );

  v_post := jsonb_build_object(
    'questions', public.ppg_chapter_test_bank(p_chapter_key, 'post'),
    'total', (
      select count(distinct order_index)
        from public.ppg_chapter_test_questions
       where chapter_key = p_chapter_key and phase = 'post' and form = 'b'
    ),
    'attempts', (
      select count(*) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
    ),
    'first_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
       order by attempt_seq asc limit 1
    ),
    'best_score', (
      select max(score) from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
    ),
    'last_score', (
      select score from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
       order by attempt_seq desc limit 1
    ),
    'submitted_at', (
      select submitted_at from public.ppg_chapter_test_attempts
       where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'post'
       order by attempt_seq desc limit 1
    ),
    'feedback', public.ppg_chapter_test_feedback(auth.uid(), p_chapter_key, 'post')
  );

  return jsonb_build_object(
    'chapter_key', v_chapter.module_key,
    'course_key', v_chapter.course_key,
    'title_th', v_chapter.title_th,
    'title_en', v_chapter.title_en,
    'pre', v_pre,
    'post', v_post,
    'next_chapter_key', v_next,
    'next_unlocked', exists (
      select 1 from public.ppg_chapter_unlocks u
       where u.learner_id = auth.uid() and u.chapter_key = v_next
    )
  );
end;
$$;

revoke execute on function public.ppg_chapter_test_state(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_chapter_test_state(text)
  to service_role, authenticated;

comment on function public.ppg_chapter_test_state(text) is
  'PPGA #74: the Chapter test screen state — both banks without the key, the caller''s attempt scores (first = research measure, best = gate), per-question feedback for the latest attempt, and the local next-chapter unlock.';

-- ----------------------------------------------------------------------------
-- 8. The submit RPC: server-side scoring, append-only attempts, one pre-test
--    attempt, best post-test score gates the next Chapter at 70%.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_chapter_test_submit(
  p_chapter_key text,
  p_phase text,
  p_language text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_chapter public.ppg_modules%rowtype;
  v_form text;
  v_total integer;
  v_score integer;
  v_seq integer;
  v_first integer;
  v_best integer;
  v_passed boolean;
  v_next text;
  v_next_unlocked boolean;
begin
  if auth.role() <> 'learner' then
    raise exception 'permission_denied: ppg_chapter_test_submit is learner-only';
  end if;

  if not public.ppg_learner_gated(auth.uid()) then
    raise exception 'gate_closed: the #8 gate must pass before chapter tests';
  end if;

  if p_chapter_key !~ '^chapter-[0-9]{2}$' then
    raise exception 'chapter_denied: p_chapter_key must look like chapter-NN';
  end if;

  if p_phase is null or p_phase not in ('pre', 'post') then
    raise exception 'phase_denied: p_phase must be pre|post';
  end if;

  if p_language is null or p_language not in ('th', 'en') then
    raise exception 'language_denied: the taken language is th|en ONLY';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers_denied: p_answers must be a JSON object';
  end if;

  select * into v_chapter
    from public.ppg_modules m
   where m.module_key = p_chapter_key;
  if not found then
    raise exception 'chapter_missing: no chapter row for %', p_chapter_key;
  end if;

  if v_chapter.publication_state <> 'published' then
    raise exception 'chapter_missing: the chapter is not published';
  end if;

  if not exists (
    select 1 from public.ppg_courses c
     where c.course_key = v_chapter.course_key and c.is_active
  ) then
    raise exception 'chapter_denied: the chapter is not on the active course';
  end if;

  v_form := case p_phase when 'pre' then 'a' else 'b' end;

  select count(distinct order_index) into v_total
    from public.ppg_chapter_test_questions
   where chapter_key = p_chapter_key and phase = p_phase and form = v_form;
  if v_total = 0 then
    raise exception 'bank_missing: no % bank for %', p_phase, p_chapter_key;
  end if;

  -- The pre-test is one attempt (diagnostic only). The partial unique index
  -- is the database-level authority; this gate gives the caller the word.
  if p_phase = 'pre' and exists (
    select 1 from public.ppg_chapter_test_attempts
     where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = 'pre'
  ) then
    raise exception 'pre_already_submitted: the chapter pre-test is one attempt (diagnostic only)';
  end if;

  -- The score is the server-side sum; the browser never sees the key.
  select count(*) into v_score
    from public.ppg_chapter_test_questions q
   where q.chapter_key = p_chapter_key
     and q.phase = p_phase
     and q.form = v_form
     and q.is_correct
     and (p_answers ->> q.order_index::text) = q.option_key;

  select coalesce(max(attempt_seq), 0) + 1 into v_seq
    from public.ppg_chapter_test_attempts
   where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = p_phase;

  insert into public.ppg_chapter_test_attempts
    (learner_id, chapter_key, phase, attempt_seq, language, answers, score, item_count)
  values
    (auth.uid(), p_chapter_key, p_phase, v_seq, p_language, p_answers, v_score, v_total);

  select score into v_first
    from public.ppg_chapter_test_attempts
   where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = p_phase
   order by attempt_seq asc limit 1;

  select max(score) into v_best
    from public.ppg_chapter_test_attempts
   where learner_id = auth.uid() and chapter_key = p_chapter_key and phase = p_phase;

  v_passed := (v_best * 100) >= (70 * v_total);
  v_next := 'chapter-' || lpad((substring(p_chapter_key from 9)::integer + 1)::text, 2, '0');

  if p_phase = 'post' and v_passed then
    insert into public.ppg_chapter_unlocks
      (learner_id, chapter_key, unlocked_by_score, item_count)
    values
      (auth.uid(), v_next, v_best, v_total)
    on conflict (learner_id, chapter_key) do update
      set unlocked_by_score = greatest(public.ppg_chapter_unlocks.unlocked_by_score, excluded.unlocked_by_score);
  end if;

  v_next_unlocked := exists (
    select 1 from public.ppg_chapter_unlocks u
     where u.learner_id = auth.uid() and u.chapter_key = v_next
  );

  return jsonb_build_object(
    'ok', true,
    'chapter_key', p_chapter_key,
    'phase', p_phase,
    'attempt_seq', v_seq,
    'score', v_score,
    'total', v_total,
    'first_score', v_first,
    'best_score', v_best,
    'passed', v_passed,
    'next_chapter_key', v_next,
    'next_unlocked', v_next_unlocked,
    'feedback', public.ppg_chapter_test_feedback(auth.uid(), p_chapter_key, p_phase)
  );
end;
$$;

revoke execute on function public.ppg_chapter_test_submit(text, text, text, jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_chapter_test_submit(text, text, text, jsonb)
  to service_role, authenticated;

comment on function public.ppg_chapter_test_submit(text, text, text, jsonb) is
  'PPGA #74: the Chapter test submit — learner-only + gate, server-side score from the key, append-only attempt (pre = one only, post = retries), first post score preserved as the research measure, best score >=70% inserts the next chapter into ppg_chapter_unlocks. Feedback carries right/wrong only, never the key.';

-- ----------------------------------------------------------------------------
-- 9. The Chapter 1 pilot banks: 10 pre + 10 post items, three options each,
--    bilingual, parallel forms over the same ten objectives.
-- ----------------------------------------------------------------------------
insert into public.ppg_chapter_test_questions
  (chapter_key, phase, form, order_index, objective_key, option_key,
   prompt_th, prompt_en, option_th, option_en, is_correct)
values
  ('chapter-01', 'pre', 'a', 1, 'purpose', 'a', 'จุดประสงค์หลักของการนำเสนอคืออะไร', 'What is the main purpose of a presentation?', 'แสดงทุกรายละเอียดที่คุณรู้', 'To show every detail you know', false),
  ('chapter-01', 'pre', 'a', 1, 'purpose', 'b', 'จุดประสงค์หลักของการนำเสนอคืออะไร', 'What is the main purpose of a presentation?', 'สร้างความบันเทิงเท่านั้น', 'To entertain only', false),
  ('chapter-01', 'pre', 'a', 1, 'purpose', 'c', 'จุดประสงค์หลักของการนำเสนอคืออะไร', 'What is the main purpose of a presentation?', 'สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'To communicate one clear message to an audience', true),
  ('chapter-01', 'pre', 'a', 2, 'audience', 'a', 'ทำไมควรคุณศึกษาผู้ฟังก่อนออกแบบสไลด์', 'Why should you learn about your audience before designing slides?', 'ลอกเสื้อผ้าพวกเขา', 'To copy their clothes', false),
  ('chapter-01', 'pre', 'a', 2, 'audience', 'b', 'ทำไมควรคุณศึกษาผู้ฟังก่อนออกแบบสไลด์', 'Why should you learn about your audience before designing slides?', 'เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'To choose content and tone that fit them', true),
  ('chapter-01', 'pre', 'a', 2, 'audience', 'c', 'ทำไมควรคุณศึกษาผู้ฟังก่อนออกแบบสไลด์', 'Why should you learn about your audience before designing slides?', 'หลีกเลี่ยงใช้ข้อความใด', 'To avoid using any text', false),
  ('chapter-01', 'pre', 'a', 3, 'structure', 'a', 'ข้อใดลำดับให้การนำเสนอโครงสร้างชัดเจน', 'Which order gives a presentation a clear structure?', 'เปิดประเด็นหลักปิด', 'Opening, main points, closing', true),
  ('chapter-01', 'pre', 'a', 3, 'structure', 'b', 'ข้อใดลำดับให้การนำเสนอโครงสร้างชัดเจน', 'Which order gives a presentation a clear structure?', 'ปิดเปิดประเด็นหลัก', 'Closing, opening, main points', false),
  ('chapter-01', 'pre', 'a', 3, 'structure', 'c', 'ข้อใดลำดับให้การนำเสนอโครงสร้างชัดเจน', 'Which order gives a presentation a clear structure?', 'ประเด็นหลักปิดเปิด', 'Main points, closing, opening', false),
  ('chapter-01', 'pre', 'a', 4, 'one_idea', 'a', 'กฎดีที่สุดสำหรับสไลด์เดียว', 'What is the best rule for a single slide?', 'ใส่สามความคิดไม่เกี่ยวข้องบนสไลด์', 'Put three unrelated ideas on it', false),
  ('chapter-01', 'pre', 'a', 4, 'one_idea', 'b', 'กฎดีที่สุดสำหรับสไลด์เดียว', 'What is the best rule for a single slide?', 'ใช้คำมากที่สุด', 'Use as many words as possible', false),
  ('chapter-01', 'pre', 'a', 4, 'one_idea', 'c', 'กฎดีที่สุดสำหรับสไลด์เดียว', 'What is the best rule for a single slide?', 'นำเสนอหนึ่งความคิดหลัก', 'Present one main idea', true),
  ('chapter-01', 'pre', 'a', 5, 'readability', 'a', 'ข้อความข้อใดอ่านง่ายที่สุด', 'Which text is easiest to read on a slide?', 'ย่อหน้ายาวตัวอักษรเล็ก', 'Long paragraphs in a small font', false),
  ('chapter-01', 'pre', 'a', 5, 'readability', 'b', 'ข้อความข้อใดอ่านง่ายที่สุด', 'Which text is easiest to read on a slide?', 'บรรทัดสั้นตัวอักษรใหญ่ชัดเจน', 'Short lines in a large, clear font', true),
  ('chapter-01', 'pre', 'a', 5, 'readability', 'c', 'ข้อความข้อใดอ่านง่ายที่สุด', 'Which text is easiest to read on a slide?', 'แบบอักษรตกแต่งหลายสี', 'Decorative fonts in many colours', false),
  ('chapter-01', 'pre', 'a', 6, 'visuals', 'a', 'อะไรทำภาพแผนภูมิบนสไลด์', 'What should a picture or chart do on a slide?', 'สนับสนุนข้อความโดยไม่แทนที่', 'Support the message without replacing it', true),
  ('chapter-01', 'pre', 'a', 6, 'visuals', 'b', 'อะไรทำภาพแผนภูมิบนสไลด์', 'What should a picture or chart do on a slide?', 'โดยไม่แทนที่ผู้พูด', 'Replace the speaker entirely', false),
  ('chapter-01', 'pre', 'a', 6, 'visuals', 'c', 'อะไรทำภาพแผนภูมิบนสไลด์', 'What should a picture or chart do on a slide?', 'เติมช่องว่างภาพที่ไม่เกี่ยวข้อง', 'Fill empty space with unrelated images', false),
  ('chapter-01', 'pre', 'a', 7, 'outline', 'a', 'ทำไมโครงเรื่องสตอรีบอร์ดมีประโยชน์ก่อนสร้างสไลด์', 'Why is an outline or storyboard useful before making slides?', 'ทำให้สไลด์โหลดเร็วขึ้น', 'It makes slides load faster', false),
  ('chapter-01', 'pre', 'a', 7, 'outline', 'b', 'ทำไมโครงเรื่องสตอรีบอร์ดมีประโยชน์ก่อนสร้างสไลด์', 'Why is an outline or storyboard useful before making slides?', 'แทนการฝึกซ้อม', 'It replaces the need for practice', false),
  ('chapter-01', 'pre', 'a', 7, 'outline', 'c', 'ทำไมโครงเรื่องสตอรีบอร์ดมีประโยชน์ก่อนสร้างสไลด์', 'Why is an outline or storyboard useful before making slides?', 'วางข้อความและลำดับก่อน', 'It plans the message and order first', true),
  ('chapter-01', 'pre', 'a', 8, 'consistency', 'a', 'อะไรทำให้ชุดสไลด์ดูสม่ำเสมอสไลด์', 'What makes a slide deck feel consistent?', 'ดีไซน์ต่างกันทุกสไลด์', 'A different design on every slide', false),
  ('chapter-01', 'pre', 'a', 8, 'consistency', 'b', 'อะไรทำให้ชุดสไลด์ดูสม่ำเสมอสไลด์', 'What makes a slide deck feel consistent?', 'แบบอักษร สี และเลย์เอาต์เดียวกัน', 'The same fonts, colours, and layout rules', true),
  ('chapter-01', 'pre', 'a', 8, 'consistency', 'c', 'อะไรทำให้ชุดสไลด์ดูสม่ำเสมอสไลด์', 'What makes a slide deck feel consistent?', 'ทรานซิชันสุ่ม', 'Random transitions on each slide', false),
  ('chapter-01', 'pre', 'a', 9, 'rehearsal', 'a', 'อะไรช่วยผู้พูด', 'How does rehearsal help a presenter?', 'พัฒนาการจับเวลาและความมั่นใจ', 'It improves timing and confidence', true),
  ('chapter-01', 'pre', 'a', 9, 'rehearsal', 'b', 'อะไรช่วยผู้พูด', 'How does rehearsal help a presenter?', 'ทำให้ชุดสไลด์ยาวขึ้น', 'It makes the deck longer', false),
  ('chapter-01', 'pre', 'a', 9, 'rehearsal', 'c', 'อะไรช่วยผู้พูด', 'How does rehearsal help a presenter?', 'ตัดความจำเป็นของผู้ฟัง', 'It removes the need for an audience', false),
  ('chapter-01', 'pre', 'a', 10, 'questions', 'a', 'วิธีที่ดีรับมือกับคำถามอะไร', 'What is a good way to handle audience questions?', 'ไม่สนใจทุกคำถาม', 'Ignore every question', false),
  ('chapter-01', 'pre', 'a', 10, 'questions', 'b', 'วิธีที่ดีรับมือกับคำถามอะไร', 'What is a good way to handle audience questions?', 'ฟัง ตอบสั้น และยอมรับเมื่อไม่รู้', 'Listen, answer briefly, and admit when you do not know', true),
  ('chapter-01', 'pre', 'a', 10, 'questions', 'c', 'วิธีที่ดีรับมือกับคำถามอะไร', 'What is a good way to handle audience questions?', 'อ่านสไลด์ทั้งหมดอีกครั้ง', 'Read the whole slide again', false),
  ('chapter-01', 'post', 'b', 1, 'purpose', 'a', 'การนำเสนอประสบความสำเร็จเมื่อ', 'A presentation succeeds when it...', 'แสดงข้อเท็จจริงทุกข้อ', 'lists every fact in the source book', false),
  ('chapter-01', 'post', 'b', 1, 'purpose', 'b', 'การนำเสนอประสบความสำเร็จเมื่อ', 'A presentation succeeds when it...', 'ส่งข้อความที่ชัดเจนซึ่งผู้ฟังนำไปใช้ได้', 'delivers a focused message the audience can act on', true),
  ('chapter-01', 'post', 'b', 1, 'purpose', 'c', 'การนำเสนอประสบความสำเร็จเมื่อ', 'A presentation succeeds when it...', 'ใช้แอนิเมชันมากที่สุด', 'uses the most animations', false),
  ('chapter-01', 'post', 'b', 2, 'audience', 'a', 'อะไรกำหนดปริมาณรายละเอียด', 'What should guide the amount of detail you include?', 'จำนวนสไลด์ในแม่แบบ', 'The number of slides in the template', false),
  ('chapter-01', 'post', 'b', 2, 'audience', 'b', 'อะไรกำหนดปริมาณรายละเอียด', 'What should guide the amount of detail you include?', 'ขนาดตัวอักษรที่คุณชอบ', 'The font size you like', false),
  ('chapter-01', 'post', 'b', 2, 'audience', 'c', 'อะไรกำหนดปริมาณรายละเอียด', 'What should guide the amount of detail you include?', 'ความรู้และความต้องการของผู้ฟัง', 'The audience existing knowledge and needs', true),
  ('chapter-01', 'post', 'b', 3, 'structure', 'a', 'โครงสร้างง่าย สำหรับการพูดคืออะไร', 'A simple structure for a talk is...', 'บทนำ เนื้อเรื่อง บทสรุป', 'introduction, body, conclusion', true),
  ('chapter-01', 'post', 'b', 3, 'structure', 'b', 'โครงสร้างง่าย สำหรับการพูดคืออะไร', 'A simple structure for a talk is...', 'บทสรุปเท่านั้น', 'conclusion only', false),
  ('chapter-01', 'post', 'b', 3, 'structure', 'c', 'โครงสร้างง่าย สำหรับการพูดคืออะไร', 'A simple structure for a talk is...', 'ลำดับสุ่ม', 'random order', false),
  ('chapter-01', 'post', 'b', 4, 'one_idea', 'a', 'ห้าข้อความต่างกันบนสไลด์ผลลัพธ์', 'If a slide carries five different messages, what is the likely result?', 'ผู้ฟังรู้ทุก', 'The audience remembers all five', false),
  ('chapter-01', 'post', 'b', 4, 'one_idea', 'b', 'ห้าข้อความต่างกันบนสไลด์ผลลัพธ์', 'If a slide carries five different messages, what is the likely result?', 'ผู้ฟังจำไม่ได้ชัดเจน', 'The audience remembers none clearly', true),
  ('chapter-01', 'post', 'b', 4, 'one_idea', 'c', 'ห้าข้อความต่างกันบนสไลด์ผลลัพธ์', 'If a slide carries five different messages, what is the likely result?', 'สไลด์ดูสั้นลง', 'The slide looks shorter', false),
  ('chapter-01', 'post', 'b', 5, 'readability', 'a', 'อะไรช่วยให้อ่านง่ายขึ้น', 'What improves readability of slide text?', 'ตัวพิมพ์ใหญ่ทั้งหมดในแบบอักษรบาง', 'All capitals in a thin font', false),
  ('chapter-01', 'post', 'b', 5, 'readability', 'b', 'อะไรช่วยให้อ่านง่ายขึ้น', 'What improves readability of slide text?', 'หลายสีในประโยคเดียว', 'Many colours in one sentence', false),
  ('chapter-01', 'post', 'b', 5, 'readability', 'c', 'อะไรช่วยให้อ่านง่ายขึ้น', 'What improves readability of slide text?', 'ความคมชัดสูงและระยะห่างที่เพียงพอ', 'Strong contrast and generous spacing', true),
  ('chapter-01', 'post', 'b', 6, 'visuals', 'a', 'เมื่อใดสื่อช่วยนำเสนอจึงมีประสิทธิผล', 'When is a visual aid effective?', 'ทำให้ประเด็นหลักชัดเจนขึ้น', 'When it makes the main point clearer', true),
  ('chapter-01', 'post', 'b', 6, 'visuals', 'b', 'เมื่อใดสื่อช่วยนำเสนอจึงมีประสิทธิผล', 'When is a visual aid effective?', 'ไม่เกี่ยวข้องกับหัวข้อ', 'When it has no relation to the topic', false),
  ('chapter-01', 'post', 'b', 6, 'visuals', 'c', 'เมื่อใดสื่อช่วยนำเสนอจึงมีประสิทธิผล', 'When is a visual aid effective?', 'ปกปิดบันทึกผู้พูด', 'When it covers the speaker notes', false),
  ('chapter-01', 'post', 'b', 7, 'outline', 'a', 'สตอรีบอร์ดแสดงอะไร', 'What does a storyboard show before you build the slides?', 'เวลาสุดท้ายของแอนิเมชัน', 'The final animation timings', false),
  ('chapter-01', 'post', 'b', 7, 'outline', 'b', 'สตอรีบอร์ดแสดงอะไร', 'What does a storyboard show before you build the slides?', 'การตั้งค่าเครื่องพิมพ์', 'The printer settings', false),
  ('chapter-01', 'post', 'b', 7, 'outline', 'c', 'สตอรีบอร์ดแสดงอะไร', 'What does a storyboard show before you build the slides?', 'ลำดับความคิดและภาพ', 'The sequence of ideas and visuals', true),
  ('chapter-01', 'post', 'b', 8, 'consistency', 'a', 'ข้อใดทำลายความสม่ำเสมอทางภาพ', 'Which choice breaks visual consistency?', 'ใช้รูปแบบหัวเรื่องเดิมซ้ำ', 'Reusing the same heading style', false),
  ('chapter-01', 'post', 'b', 8, 'consistency', 'b', 'ข้อใดทำลายความสม่ำเสมอทางภาพ', 'Which choice breaks visual consistency?', 'เปลี่ยนแบบอักษรและสีทุกสไลด์', 'Switching fonts and colours on every slide', true),
  ('chapter-01', 'post', 'b', 8, 'consistency', 'c', 'ข้อใดทำลายความสม่ำเสมอทางภาพ', 'Which choice breaks visual consistency?', 'ใช้ชุดสีเดียว', 'Keeping one colour palette', false),
  ('chapter-01', 'post', 'b', 9, 'rehearsal', 'a', 'ควรฝึกอะไรก่อนนำเสนอ', 'What should you practise before presenting?', 'เฉพาะสไลด์แรก', 'Only the first slide', false),
  ('chapter-01', 'post', 'b', 9, 'rehearsal', 'b', 'ควรฝึกอะไรก่อนนำเสนอ', 'What should you practise before presenting?', 'การจับเวลา ทรานซิชัน และคำอธิบายสำคัญ', 'The timing, transitions, and key explanations', true),
  ('chapter-01', 'post', 'b', 9, 'rehearsal', 'c', 'ควรฝึกอะไรก่อนนำเสนอ', 'What should you practise before presenting?', 'ไม่ต้องฝึก ใช้การด้นสดได้', 'Nothing; you can improvise', false),
  ('chapter-01', 'post', 'b', 10, 'questions', 'a', 'ถ้าคุณไม่รู้คำตอบอะไรควรคุณทำ', 'If you do not know the answer to a question, what should you do?', 'คิดคำตอบขึ้นมาเร็ว ๆ', 'Invent an answer quickly', false),
  ('chapter-01', 'post', 'b', 10, 'questions', 'b', 'ถ้าคุณไม่รู้คำตอบอะไรควรคุณทำ', 'If you do not know the answer to a question, what should you do?', 'เปลี่ยนเรื่อง', 'Change the subject', false),
  ('chapter-01', 'post', 'b', 10, 'questions', 'c', 'ถ้าคุณไม่รู้คำตอบอะไรควรคุณทำ', 'If you do not know the answer to a question, what should you do?', 'บอกว่าจะติดตามผลและทำจริง', 'Say you will follow up and do it', true)
on conflict (chapter_key, phase, form, order_index, option_key) do nothing;

