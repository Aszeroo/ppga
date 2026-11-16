-- ============================================================================
-- PPGA #75: the CAI lesson-step model + the Chapter 1 pilot content.
--
-- A Lesson is delivered as an ordered sequence of steps:
--   objective -> explanation -> example -> check -> summary (repeatable).
-- The step body is bilingual (ADR-0003) and a `check` step carries one
-- single-answer mini-check: a bilingual prompt, 2-4 bilingual options, one
-- server-side answer key, and a bilingual explanation.
--
-- The answer key NEVER reaches a client:
--   * RLS is enabled on both tables with NO select policy, so a browser
--     SELECT returns no rows (the same discipline as the Chapter bank).
--   * `ppg_lesson_steps` (the read RPC) projects prompts + options only.
--   * `ppg_grade_mini_check` compares the chosen option server-side and
--     returns correctness + explanation only; the key column never leaves
--     Postgres, even after an answer.
--
-- Mini-checks are formative: the grade RPC writes NOTHING. It never gates a
-- Chapter, never touches the Self-Check submit path, and never records XP.
-- Progression stays with #74/#76; this migration does not touch the chapter
-- test tables/RPCs or the global unlock function.
--
-- The Chapter 1 pilot seeds the three lessons of `chapter-01` (the chapter
-- row landed in #74 with no lessons). The seed is idempotent (ON CONFLICT DO
-- NOTHING) so a later content ticket (#78) can supersede it with new rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The structured step model.
-- ----------------------------------------------------------------------------
create table public.ppg_lesson_steps (
  lesson_key text not null references public.ppg_lessons (lesson_key) on delete cascade,
  order_index integer not null,
  kind text not null,
  body_th text not null default '',
  body_en text not null default '',
  check_prompt_th text,
  check_prompt_en text,
  check_answer_key text,
  check_explanation_th text,
  check_explanation_en text,
  created_at timestamptz not null default now(),
  primary key (lesson_key, order_index),
  constraint ppg_lesson_step_kind_check
    check (kind in ('objective', 'explanation', 'example', 'check', 'summary')),
  constraint ppg_lesson_step_order_check check (order_index between 1 and 20),
  -- A mini-check step carries the whole check shape; every other kind
  -- carries none of it (no half-configured checks in the seed).
  constraint ppg_lesson_step_check_shape_check check (
    (
      kind = 'check'
      and check_prompt_th is not null
      and check_prompt_en is not null
      and check_answer_key is not null
      and check_explanation_th is not null
      and check_explanation_en is not null
      and btrim(body_th) = ''
      and btrim(body_en) = ''
    )
    or (
      kind <> 'check'
      and check_prompt_th is null
      and check_prompt_en is null
      and check_answer_key is null
      and check_explanation_th is null
      and check_explanation_en is null
      and btrim(body_th) <> ''
      and btrim(body_en) <> ''
    )
  )
);

comment on table public.ppg_lesson_steps is
  'PPGA #75: the ordered CAI lesson steps (objective|explanation|example|check|summary), bilingual. A check step carries one single-answer mini-check; its answer key is SERVER-side only. Seeded by migration; read only through the definer RPC.';

comment on column public.ppg_lesson_steps.check_answer_key is
  'PPGA #75: the mini-check answer key (one option_key). No RLS select policy exposes it; ppg_grade_mini_check compares under the definer''s rights and returns correctness + explanation only.';

alter table public.ppg_lesson_steps enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policy: the steps are seeded by migration
-- and read only through the definer RPCs. A client SELECT returns no rows.

create table public.ppg_lesson_step_options (
  lesson_key text not null,
  step_order_index integer not null,
  option_key text not null,
  option_th text not null,
  option_en text not null,
  primary key (lesson_key, step_order_index, option_key),
  foreign key (lesson_key, step_order_index)
    references public.ppg_lesson_steps (lesson_key, order_index) on delete cascade,
  constraint ppg_lesson_step_option_key_check check (option_key in ('a', 'b', 'c', 'd'))
);

comment on table public.ppg_lesson_step_options is
  'PPGA #75: the bilingual options of a check step. The correct option is named by ppg_lesson_steps.check_answer_key; this table carries no is_correct column.';

alter table public.ppg_lesson_step_options enable row level security;

-- No policies: seeded by migration, read only through the definer RPC.

-- ----------------------------------------------------------------------------
-- 2. The write-time integrity guard: a check step needs 2-4 options and an
--    answer key that names one of them. Deferred so the seed may insert the
--    step first and the options after; a malformed update is rejected at
--    COMMIT (the same shape the #74 bank guard uses).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_lesson_step_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson text;
  v_order integer;
  v_kind text;
  v_answer text;
  v_options integer;
  v_has_answer integer;
begin
  if tg_table_name = 'ppg_lesson_step_options' then
    if tg_op = 'DELETE' then
      v_lesson := old.lesson_key;
      v_order := old.step_order_index;
    else
      v_lesson := new.lesson_key;
      v_order := new.step_order_index;
    end if;
  elsif tg_op = 'DELETE' then
    v_lesson := old.lesson_key;
    v_order := old.order_index;
  else
    v_lesson := new.lesson_key;
    v_order := new.order_index;
  end if;

  select s.kind, s.check_answer_key
    into v_kind, v_answer
    from public.ppg_lesson_steps s
   where s.lesson_key = v_lesson
     and s.order_index = v_order;

  -- The step itself was deleted (the options cascade with it).
  if v_kind is null then
    return null;
  end if;

  select count(*), count(*) filter (where o.option_key = v_answer)
    into v_options, v_has_answer
    from public.ppg_lesson_step_options o
   where o.lesson_key = v_lesson
     and o.step_order_index = v_order;

  if v_kind = 'check' then
    if v_options < 2 or v_options > 4 then
      raise exception 'malformed_step: a check step needs 2-4 options (lesson %, step %)', v_lesson, v_order;
    end if;
    if v_has_answer <> 1 then
      raise exception 'malformed_step: the answer key must name one of the options (lesson %, step %)', v_lesson, v_order;
    end if;
  elsif v_options > 0 then
    raise exception 'malformed_step: only check steps carry options (lesson %, step %)', v_lesson, v_order;
  end if;

  return null;
end;
$$;

create constraint trigger ppg_lesson_step_guard
  after insert or update or delete on public.ppg_lesson_steps
  deferrable initially deferred
  for each row
  execute function public.ppg_lesson_step_guard();

create constraint trigger ppg_lesson_step_option_guard
  after insert or update or delete on public.ppg_lesson_step_options
  deferrable initially deferred
  for each row
  execute function public.ppg_lesson_step_guard();

comment on function public.ppg_lesson_step_guard() is
  'PPGA #75: the deferred step-integrity constraint — a check step needs 2-4 options and an answer key naming one of them; non-check steps carry no options. Rejected at COMMIT.';

-- ----------------------------------------------------------------------------
-- 3. The read RPC: the steps a SEE-ABLE Lesson shows. The visibility rule
--    mirrors the Lesson's own RLS (published + gate + module open for a
--    learner; every row for teacher/admin). The jsonb NEVER carries the
--    answer key or the explanation (the explanation is part of the answer
--    reveal and rides only the grade response).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_lesson_steps(p_lesson_key text)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lesson_key', s.lesson_key,
        'order_index', s.order_index,
        'kind', s.kind,
        'body_th', s.body_th,
        'body_en', s.body_en,
        'check',
          case when s.kind = 'check' then jsonb_build_object(
            'prompt_th', s.check_prompt_th,
            'prompt_en', s.check_prompt_en,
            'options', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'option_key', o.option_key,
                    'option_th', o.option_th,
                    'option_en', o.option_en
                  ) order by o.option_key
                )
                from public.ppg_lesson_step_options o
                where o.lesson_key = s.lesson_key
                  and o.step_order_index = s.order_index
              ),
              '[]'::jsonb
            )
          )
          else null
          end
      ) order by s.order_index
    )::jsonb,
    '[]'::jsonb
  )
  from public.ppg_lesson_steps s
  join public.ppg_lessons l on l.lesson_key = s.lesson_key
  where s.lesson_key = p_lesson_key
    and (
      auth.role() in ('teacher', 'admin')
      or (
        l.publication_state = 'published'
        and public.ppg_learner_gated(auth.uid())
        and public.ppg_module_unlocked(auth.uid(), l.module_key)
      )
    );
$$;

revoke execute on function public.ppg_lesson_steps(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_lesson_steps(text)
  to service_role, authenticated;

comment on function public.ppg_lesson_steps(text) is
  'PPGA #75: the steps a SEE-ABLE Lesson shows (published + gate + module open for a learner; all for teacher/admin). The jsonb never carries check_answer_key or check_explanation_*; options only.';

-- ----------------------------------------------------------------------------
-- 4. The grade RPC: compares one chosen option server-side and returns
--    correctness + the bilingual explanation. It writes NOTHING (no attempt
--    row, no XP ledger row, no unlock) and never returns the answer key.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_grade_mini_check(
  p_lesson_key text,
  p_order_index integer,
  p_option_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_step record;
begin
  select s.check_answer_key, s.check_explanation_th, s.check_explanation_en
    into v_step
    from public.ppg_lesson_steps s
    join public.ppg_lessons l on l.lesson_key = s.lesson_key
   where s.lesson_key = p_lesson_key
     and s.order_index = p_order_index
     and s.kind = 'check'
     and (
       auth.role() in ('teacher', 'admin')
       or (
         l.publication_state = 'published'
         and public.ppg_learner_gated(auth.uid())
         and public.ppg_module_unlocked(auth.uid(), l.module_key)
       )
     );

  if not found then
    raise exception 'check_not_found: no visible mini-check for lesson %, step %', p_lesson_key, p_order_index;
  end if;

  if not exists (
    select 1
      from public.ppg_lesson_step_options o
     where o.lesson_key = p_lesson_key
       and o.step_order_index = p_order_index
       and o.option_key = p_option_key
  ) then
    raise exception 'option_not_found: option % is not part of lesson %, step %', p_option_key, p_lesson_key, p_order_index;
  end if;

  -- Correctness + the explanation only. The answer key stays server-side.
  return jsonb_build_object(
    'correct', p_option_key = v_step.check_answer_key,
    'explanation_th', v_step.check_explanation_th,
    'explanation_en', v_step.check_explanation_en
  );
end;
$$;

revoke execute on function public.ppg_grade_mini_check(text, integer, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_grade_mini_check(text, integer, text)
  to service_role, authenticated;

comment on function public.ppg_grade_mini_check(text, integer, text) is
  'PPGA #75: formative mini-check grading. Compares the chosen option server-side and returns correctness + explanation only — never the answer key, never a write, never XP or an unlock.';

-- ----------------------------------------------------------------------------
-- 5. The Chapter 1 pilot: three lessons for `chapter-01` + their steps.
--    Content ticket #78 expands Chapters 1-2; every insert is idempotent so
--    that later migration can supersede these rows without a delete.
-- ----------------------------------------------------------------------------

insert into public.ppg_lessons (lesson_key, module_key, order_index, title_th, title_en, what_learn_th, what_learn_en, why_th, why_en, body_th, body_en, what_next_th, what_next_en, publication_state)
  values
    ('chapter-01-lesson-01', 'chapter-01', 1, 'จุดประสงค์ของการนำเสนอ', 'What a presentation is for', 'สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'Name the one job a presentation does.', 'ส่งข้อความที่ชัดเจนซึ่งผู้ฟังนำไปใช้ได้', 'A clear purpose keeps every later design choice honest.', 'จุดประสงค์หลักของการนำเสนอคืออะไร สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'A presentation is not a box for every fact you know. Its job is to communicate one clear message to the people in the room.', 'ศึกษาผู้ฟัง', 'Next lesson: know your audience.', 'published'),
    ('chapter-01-lesson-02', 'chapter-01', 2, 'ศึกษาผู้ฟัง', 'Know your audience', 'เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'Choose content and tone that fit the people in the room.', 'ความรู้และความต้องการของผู้ฟัง', 'The same message changes shape for different listeners.', 'ทำไมควรคุณศึกษาผู้ฟังก่อนออกแบบสไลด์ เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'Audience first: ask what they already know, what they need, and how much detail they can use before you design a slide.', 'โครงสร้างชัดเจน', 'Next lesson: give the talk a clear structure.', 'published'),
    ('chapter-01-lesson-03', 'chapter-01', 3, 'โครงสร้างชัดเจน', 'Structure: opening, main points, closing', 'เปิดประเด็นหลักปิด', 'Order a talk as opening, main points, and closing.', 'บทนำ เนื้อเรื่อง บทสรุป', 'The order is the message; a lost audience cannot follow a good slide.', 'ข้อใดลำดับให้การนำเสนอโครงสร้างชัดเจน เปิดประเด็นหลักปิด', 'An opening sets up the question, the main points answer it, and the closing tells the audience what to do next.', 'เปิดประเด็นหลักปิด', 'Next: the chapter Knowledge Mission puts these ideas to work.', 'published')
  on conflict (lesson_key) do nothing;

insert into public.ppg_lesson_steps (lesson_key, order_index, kind, body_th, body_en, check_prompt_th, check_prompt_en, check_answer_key, check_explanation_th, check_explanation_en)
  values
    ('chapter-01-lesson-01', 1, 'objective', 'สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'By the end you can name the job a presentation does: one clear message the audience can act on.', null, null, null, null, null),
    ('chapter-01-lesson-01', 2, 'explanation', 'จุดประสงค์หลักของการนำเสนอคืออะไร สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'Before you open the slide editor, decide the single message. Every slide either supports that message or belongs in an appendix.', null, null, null, null, null),
    ('chapter-01-lesson-01', 3, 'example', 'ส่งข้อความที่ชัดเจนซึ่งผู้ฟังนำไปใช้ได้', 'A class pitch that asks people to join one workshop has a clear purpose. A slide with ten unrelated facts leaves the audience with none.', null, null, null, null, null),
    ('chapter-01-lesson-01', 4, 'check', '', '', 'จุดประสงค์หลักของการนำเสนอคืออะไร', 'What is the main purpose of a presentation?', 'c', 'สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'The purpose is to communicate one clear message to an audience. Facts and visuals serve that message; they do not replace it.'),
    ('chapter-01-lesson-01', 5, 'summary', 'ส่งข้อความที่ชัดเจนซึ่งผู้ฟังนำไปใช้ได้', 'One clear message, aimed at this audience, beats a pile of facts every time.', null, null, null, null, null),
    ('chapter-01-lesson-02', 1, 'objective', 'เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'By the end you can choose content and tone that fit a named audience.', null, null, null, null, null),
    ('chapter-01-lesson-02', 2, 'explanation', 'ทำไมควรคุณศึกษาผู้ฟังก่อนออกแบบสไลด์ เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'A beginner class needs a short definition and one demo. A teacher panel needs evidence and detail. The audience decides which version you deliver.', null, null, null, null, null),
    ('chapter-01-lesson-02', 3, 'example', 'ความรู้และความต้องการของผู้ฟัง', 'For first-year students, one clear photo of the finished slide is enough. For teachers, the same idea needs a before-and-after comparison.', null, null, null, null, null),
    ('chapter-01-lesson-02', 4, 'check', '', '', 'ทำไมควรคุณศึกษาผู้ฟังก่อนออกแบบสไลด์', 'Why should you learn about your audience before designing slides?', 'b', 'เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'Audience research sets the content and the tone: choose what they need, not everything you know.'),
    ('chapter-01-lesson-02', 5, 'summary', 'ความรู้และความต้องการของผู้ฟัง', 'Audience first: the same message changes shape for different listeners.', null, null, null, null, null),
    ('chapter-01-lesson-03', 1, 'objective', 'เปิดประเด็นหลักปิด', 'By the end you can order a short talk as opening, main points, and closing.', null, null, null, null, null),
    ('chapter-01-lesson-03', 2, 'explanation', 'ข้อใดลำดับให้การนำเสนอโครงสร้างชัดเจน เปิดประเด็นหลักปิด', 'Tell them what you will say, say it, then tell them what you said. One clear idea per main point keeps the structure visible.', null, null, null, null, null),
    ('chapter-01-lesson-03', 3, 'example', 'บทนำ เนื้อเรื่อง บทสรุป', 'Opening: the problem in one sentence. Main points: three steps that solve it. Closing: the one action you ask for.', null, null, null, null, null),
    ('chapter-01-lesson-03', 4, 'check', '', '', 'ข้อใดลำดับให้การนำเสนอโครงสร้างชัดเจน', 'Which order gives a presentation a clear structure?', 'a', 'เปิดประเด็นหลักปิด', 'A clear talk opens, develops the main points, and closes: opening, main points, closing.'),
    ('chapter-01-lesson-03', 5, 'summary', 'บทนำ เนื้อเรื่อง บทสรุป', 'Opening, main points, closing. The order is the message.', null, null, null, null, null)
  on conflict (lesson_key, order_index) do nothing;

insert into public.ppg_lesson_step_options (lesson_key, step_order_index, option_key, option_th, option_en)
  values
    ('chapter-01-lesson-01', 4, 'a', 'แสดงทุกรายละเอียดที่คุณรู้', 'To show every detail you know'),
    ('chapter-01-lesson-01', 4, 'b', 'สร้างความบันเทิงเท่านั้น', 'To entertain only'),
    ('chapter-01-lesson-01', 4, 'c', 'สื่อสารข้อความเดียวที่ชัดเจนให้ผู้ฟัง', 'To communicate one clear message to an audience'),
    ('chapter-01-lesson-02', 4, 'a', 'ลอกเสื้อผ้าพวกเขา', 'To copy their clothes'),
    ('chapter-01-lesson-02', 4, 'b', 'เลือกเนื้อหาและน้ำเสียงเหมาะสมพวกเขา', 'To choose content and tone that fit them'),
    ('chapter-01-lesson-02', 4, 'c', 'หลีกเลี่ยงใช้ข้อความใด', 'To avoid using any text'),
    ('chapter-01-lesson-03', 4, 'a', 'เปิดประเด็นหลักปิด', 'Opening, main points, closing'),
    ('chapter-01-lesson-03', 4, 'b', 'ปิดเปิดประเด็นหลัก', 'Closing, opening, main points'),
    ('chapter-01-lesson-03', 4, 'c', 'ประเด็นหลักปิดเปิด', 'Main points, closing, opening')
  on conflict (lesson_key, step_order_index, option_key) do nothing;
