-- Ticket #9 curriculum, the Course map & the publication states: the whole
-- spine lives in Postgres — the Course is ONE row; ~10 linear Modules map to
-- the Skill Domains; Lessons carry independent Thai/English content; the
-- publication states (draft/published/archived) and the unlock rule are
-- enforced by RLS/functions, never in a React tree. The client may read; it
-- may never decide what is visible, what is locked, or what is published.
--
-- The Learner who passed the #8 gate (consent AND the Pre-Test submitted, OR
-- the audited override) sees the Course map with real lock states: module 1
-- open, the rest locked by the linear rule the function below computes
-- server-side. An ungated Learner reaches the map as `SELECT 0` / no rows —
-- the gate the #8 migration (`ppg_learner_gated`) speaks again here at the
-- row level; a draft/arched row is INVISIBLE to a Learner by the policy's
-- own `publication_state`, never a hidden UI. Admin (and Teacher) read
-- every row incl draft/arched — the toggle below (the `ppg_set_publication`
-- RPC) is their only authoring surface in v1 (ADR-0003: no content CRUD).
--
-- The linear rule: module 1 is open once the #8 gate stands; module N+1
-- opens when module N's Mission completes. For NOW the completion state is a
-- placeholder (the `ppg_module_missions` table seeded `incomplete`, the
-- function reads it) — #10/#11 wire the real missions; nothing changes in
-- what is visible meanwhile: module 1 open, the rest locked, server-side.

-- The Skill Domains: a named category of PowerPoint competence (the domain
-- glossary) that Modules and (later) Missions/Badges are tagged with. Seeded
-- here with the real PowerPoint domains the #1 PRD names; read-only to the
-- authenticated roles (the taxonomy is shared), never author-able by a client
-- (no INSERT/UPDATE policy — a migration seeds it, ADR-0003).
create table public.ppg_skill_domains (
  domain text primary key,
  label_th text not null,
  label_en text not null,
  created_at timestamptz not null default now()
);

comment on table public.ppg_skill_domains is
  'PPGA #9: the named Skill Domain taxonomy (ADR glossary: Text Formatting, Slide Design, …); Modules + later Missions/Badges carry one domain as their tag.';

alter table public.ppg_skill_domains enable row level security;

create policy ppg_skill_domains_select on public.ppg_skill_domains
  for select
  using (auth.role() = 'learner' OR auth.role() = 'teacher' OR auth.role() = 'admin');

insert into public.ppg_skill_domains (domain, label_th, label_en)
  values
    ('PowerPoint Basics',       'การเปิดงาน PowerPoint กับส้างพรีเซนต',        'PowerPoint Basics'),
    ('Slide Creation',          'การส้างสไลดกับเลือกแบบ',         'Slide Creation'),
    ('Text Formatting',         'การพิมพ์ข้อความกับแบบอักษร',        'Text Formatting'),
    ('Slide Design',          'การแบบสไลดกับ-layout',        'Slide Design'),
    ('Fonts & Text Effects',    'การFontกับ-effect (Color/Line/Shadow)',        'Fonts & Text Effects'),
    ('Shapes & Lines',          'การส้างรูปร่างกับเส้น',        'Shapes & Lines'),
    ('Smart Art Graphics',          'การ Smart Art',           'Smart Art Graphics'),
    ('Object Layout',           'การวางรูปรายกับภาพ',        'Object Layout'),
    ('Transition & Animation',  'การ Transition กับ-Animation',        'Transition & Animation'),
    ('Review Publish Export',   'การตรวจแก้มกับส้างพรีเซนต',        'Review, Publish & Export')
on conflict (domain) do nothing;

-- The Course: v1 has exactly one linear learning unit (ADR glossary: ONE
-- Course, no learning-path/program). The title is bilingual independent.
create table public.ppg_courses (
  course_key text primary key,
  title_th text not null,
  title_en text not null,
  created_at timestamptz not null default now()
);

comment on table public.ppg_courses is
  'PPGA #9: v1 has exactly one Course ("PowerPoint Presentation Creation") composed of ordered Modules (glossary: Course; no learning path/program).';

alter table public.ppg_courses enable row level security;

-- Read: a Learner reads the Course row iff the #8 gate stands (the map the
-- Learner sees only after the gate); a Teacher/admin reads it always (the
-- console's surface + the toggle's audit). No INSERT/UPDATE policy — the
-- migration seeds the single Course.
create policy ppg_courses_select on public.ppg_courses
  for select
  using public.ppg_learner_gated(auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

insert into public.ppg_courses (course_key, title_th, title_en)
  values (
    'powerpoint-creation',
    'ส้างสไลด PowerPoint (PowerPoint Presentation Creation)',
    'PowerPoint Presentation Creation'
  )
on conflict (course_key) do nothing;

-- The Modules: the ordered sections of the ONE Course, each tagged with one
-- Skill Domain (the tag the later badges ride). Bilingual independent title
-- + summary. The publication state (draft/published/archived, default draft)
-- decides what is VISIBLE to a Learner at the row level; the unlock rule the
-- function below decides what is OPEN at the row level. A draft/arched
-- module, or a locked one, is INACCESSIBLE server-side to a Learner — the
-- SELECT is denied by the policy, never a hidden UI.
create table public.ppg_modules (
  module_key text primary key,
  course_key text not null references public.ppg_courses (course_key) on delete cascade,
  order_index integer not null,
  skill_domain text not null references public.ppg_skill_domains (domain) on delete restrict,
  title_th text not null,
  title_en text not null,
  summary_th text not null,
  summary_en text not null,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint ppg_module_publication_check check (publication_state in ('draft', 'published', 'archived')),
  constraint ppg_module_order_check check (order_index between 1 and 10),
  constraint ppg_module_order_unique unique (course_key, order_index)
);

comment on table public.ppg_modules is
  'PPGA #9: the ordered Modules of the ONE Course; bilingual title+summary + the one Skill Domain tag (glossary: Module; unlocks when the previous Module''s Mission completes).';
comment on column public.ppg_modules.publication_state is
  'PPGA #9: draft|published|archived (ADR-0003). Default draft; a Learner''s SELECT reads published rows only — draft/arched are INVISIBLE server-side, never a hidden UI.';
comment on column public.ppg_modules.skill_domain is
  'PPGA #9: the one Skill Domain tag — the same handle the later badges + the Mission tag ride.';

alter table public.ppg_modules enable row level security;

-- Read as a Learner: the gate (#8) AND the published state AND the module
-- OPEN (the unlock function the linear rule computes). A draft/arched row
-- or a locked row never appears: the `SELECT 0`, never a smuggled read. A
-- Teacher/admin reads every row incl draft/arched (the console sees what
-- the toggle can change).
create policy ppg_modules_select on public.ppg_modules
  for select
  using (
    auth.role() = 'learner'
    AND public.ppg_learner_gated(auth.uid())
    AND publication_state = 'published'
    AND public.ppg_module_unlocked(auth.uid(), module_key)
  )
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- UPDATE: admin-only (the publication toggle rides the RPC's definer write
-- as well; the direct UPDATE policy speaks for the same authority). No
-- INSERT/DELETE policy — a migration seeds the content (ADR-0003).
create policy ppg_modules_update on public.ppg_modules
  for update
  using auth.role() = 'admin';

-- The Lessons: the study material inside a Module (glossary: Lesson). The
-- #16 story's structure is carried as columns, not a JSON blob: the what
-- (what you will learn), the why (why it matters), the body, and the what-
-- next pointer — all bilingual independent. The publication state + the
-- parent module's unlock decide what is VISIBLE to a Learner server-side.
create table public.ppg_lessons (
  lesson_key text primary key,
  module_key text not null references public.ppg_modules (module_key) on delete cascade,
  order_index integer not null,
  title_th text not null,
  title_en text not null,
  what_learn_th text not null,
  what_learn_en text not null,
  why_th text not null,
  why_en text not null,
  body_th text not null,
  body_en text not null,
  what_next_th text not null,
  what_next_en text not null,
  publication_state text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint ppg_lesson_publication_check check (publication_state in ('draft', 'published', 'archived')),
  constraint ppg_lesson_order_check check (order_index between 1 and 3),
  constraint ppg_lesson_order_unique unique (module_key, order_index)
);

comment on table public.ppg_lessons is
  'PPGA #9: the Lessons inside a Module (glossary: Lesson); the #16 story''s what/why/body/what-next structure as bilingual columns (ADR-0003: content as versioned seed).';
comment on column public.ppg_lessons.publication_state is
  'PPGA #9: draft|published|archived (ADR-0003). Default draft; a Learner''s SELECT reads published lessons of an OPEN module — draft/arched are INVISIBLE server-side, never a hidden UI.';
comment on column public.ppg_lessons.what_next_th is
  'PPGA #9: the #16 story''s "what next" pointer — what is visible here, the next step, server-side text (never a client-decided copy).';

alter table public.ppg_lessons enable row level security;

-- Read as a Learner: the gate (#8) AND the published lesson AND the parent
-- module OPEN (the unlock function reads the parent's own `module_key`).
-- A draft/arched lesson, or a lesson of a locked module, never appears —
-- `SELECT 0`. A Teacher/admin reads every row incl draft/arched.
create policy ppg_lessons_select on public.ppg_lessons
  for select
  using (
    auth.role() = 'learner'
    AND public.ppg_learner_gated(auth.uid())
    AND publication_state = 'published'
    AND public.ppg_module_unlocked(auth.uid(), module_key)
  )
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

create policy ppg_lessons_update on public.ppg_lessons
  for update
  using auth.role() = 'admin';

-- The Mission-state placeholder: the completion record the linear rule READS
-- for now (ADR glossary: Mission; #10/#11 replace this with the real
-- Knowledge/Practical missions + their Attempt state). Seeded `incomplete`
-- for every Learner on every module but module 1 — the rule sees: module 1
-- open after the #8 gate stands, the rest LOCKED, server-side. A Learner
-- reads their own completion rows; a Teacher/admin reads all; no UPDATE
-- policy — #10 wires the real writes here (not a client deciding).
create table public.ppg_module_missions (
  module_key text not null references public.ppg_modules (module_key) on delete cascade,
  learner_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'incomplete',
  seeded_at timestamptz not null default now(),
  primary key (module_key, learner_id),
  constraint ppg_mission_status_check check (status in ('incomplete', 'complete'))
);

comment on table public.ppg_module_missions is
  'PPGA #9: the Mission-completion placeholder the linear rule reads FOR NOW (the unlock function below); #10/#11 wire the real Knowledge/Practical missions + attempts here.';

alter table public.ppg_module_missions enable row level security;

create policy ppg_module_missions_select on public.ppg_module_missions
  for select
  using (auth.role() = 'learner' and learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- The placeholder's own seed lands AFTER the modules (end of file), so the
-- cross join reads the seeded modules + the seeded learner profiles; the
-- column's default speaks `incomplete` — nothing here says what a later
-- migration may wire.

-- The linear rule: the unlock the DATABASE decides. Module 1 is OPEN once
-- the #8 gate stands (the policy's own gate AND the function here). Module
-- N+1 opens when module N's Mission completes — for NOW the placeholder
-- table above says `incomplete`, so modules 2..10 are LOCKED server-side;
-- #10/#11 wire the real mission-completion writes and the rule becomes the
-- module-2 opens on module-1 complete … with NO change in what is VISIBLE
-- meanwhile (the same authority the #8 gate speaks). The function's execute
-- is granted to the CALLER's JWT roles; the definer's rights read the
-- placeholder rows FILTERED to the CALLER's own `learner_id` — an other
-- Learner''s completion may never ride this read.
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

  -- Module 1 (the first module) opens on the #8 gate alone — the policy
  -- ANDs this function with `ppg_learner_gated`, so `true` here is only
  -- the linear-rule part: no one else's completion decides module 1.
  if v_order = 1 then
    return true;
  end if;

  -- Module N+1 opens iff module N (order N-1)'s Mission completed for the
  -- CALLER (the placeholder reads `incomplete`; #10/#11 write `complete`).
  return EXISTS (
    SELECT 1
      FROM public.ppg_module_missions mi
    WHERE mi.learner_id = p_caller
      AND mi.module_key = (
        SELECT m2.module_key
          FROM public.ppg_modules m2
        WHERE m2.order_index = v_order - 1
        LIMIT 1
      )
      AND mi.status = 'complete'
  );
end;
$$;

revoke execute on function public.ppg_module_unlocked(uuid, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_unlocked(uuid, text)
  to service_role, authenticated;

comment on function public.ppg_module_unlocked(uuid, text) is
  'PPGA #9: the linear-rule authority — module 1 open on the #8 gate alone; module N+1 iff module N''s Mission is `complete` for the CALLER (the placeholder `incomplete` FOR NOW — #10/#11 wire the real completion writes; what stays LOCKED server-side meanwhile).';

-- The Course map a Learner sees: the RPC returns every SEE-ABLE module
-- (the same authority the policies speak) + each row's real LOCK STATE
-- (`open|locked`, computed by the rule function under the CALLER's JWT) —
-- the map shows the locked modules AS locked, not invisible, while a
-- draft/arched row stays INVISIBLE to a Learner (the function's own WHERE
-- denies it server-side; never a hidden UI). An admin/teacher caller sees
-- every row incl draft/arched with its real state (what the toggle may
-- change). The definer's rights make the read of the locked (published,
-- not-unlocked) rows possible — the filter is the function's own, never a
-- bypassed policy.
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
  WHERE auth.role() IN ('teacher', 'admin')
     OR (
       m.publication_state = 'published'
       AND public.ppg_learner_gated(auth.uid())
     );
$$;

revoke execute on function public.ppg_course_map()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_course_map()
  to service_role, authenticated;

comment on function public.ppg_course_map() is
  'PPGA #9: the Course map — every SEE-ABLE module (published + the #8 gate for a learner; all incl draft/arched for teacher/admin) + the real lock state per row (the linear rule under the CALLER''s JWT), so the map shows LOCKED modules as locked, never invisible; draft/arched stays invisible server-side.';

-- The module detail: the lessons an SEE-ABLE module shows (the same
-- authority the lesson policy speaks: published + gate + the module OPEN
-- for a learner; all incl draft/arched for teacher/admin) + the real
-- lock state (the module's own). The learner sees lessons ONLY when the
-- module is open — a locked module's detail read returns NO lesson rows
-- (`[]`), never a hidden UI.
create or replace function public.ppg_module_lessons(p_module_key text)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lesson_key', l.lesson_key,
        'module_key', l.module_key,
        'order_index', l.order_index,
        'title_th', l.title_th,
        'title_en', l.title_en,
        'what_learn_th', l.what_learn_th,
        'what_learn_en', l.what_learn_en,
        'why_th', l.why_th,
        'why_en', l.why_en,
        'body_th', l.body_th,
        'body_en', l.body_en,
        'what_next_th', l.what_next_th,
        'what_next_en', l.what_next_en,
        'publication_state', l.publication_state
      ) ORDER BY l.order_index
    )::jsonb,
    '[]'::jsonb
  )
  FROM public.ppg_lessons l
  JOIN public.ppg_modules m ON l.module_key = m.module_key
  WHERE auth.role() IN ('teacher', 'admin')
     OR (
       l.publication_state = 'published'
       AND public.ppg_learner_gated(auth.uid())
       AND public.ppg_module_unlocked(auth.uid(), m.module_key)
     );
$$;

revoke execute on function public.ppg_module_lessons(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_module_lessons(text)
  to service_role, authenticated;

comment on function public.ppg_module_lessons(text) is
  'PPGA #9: the module detail — lessons a SEE-ABLE module shows (published + gate + module open for a learner; all incl draft/arched for teacher/admin); a locked module returns `[]` server-side, never a hidden UI.';

-- The publication toggle: the ADMIN's only authoring surface in v1
-- (ADR-0003 — content as migrations, the UI toggles what already exists).
-- One call: one UPDATE of whichever row (the module OR the lesson) +
-- exactly one audit INSERT (action `publication`, details old/new state).
-- The invalid state reaches `invalid_publication_state`; a missing target
-- reaches `target_missing`; a learner/teacher smuggle reaches
-- `permission_denied` — never a silently-0-row UPDATE of someone else's
-- publication state. The function's own WHERE narrows the UPDATE to the
-- keyed row, so a smuggled key that is not a module/lesson writes nothing.
create or replace function public.ppg_set_publication(p_target_key text, p_new_state text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old_state text;
  v_target_type text;
begin
  if auth.role() != 'admin' then
    raise exception 'permission_denied: ppg_set_publication is admin-only (JWT role claim must be admin)';
  end if;

  if p_new_state IS NULL or p_new_state not in ('draft', 'published', 'archived') then
    raise exception 'invalid_publication_state: p_new_state must be one of draft|published|archived (ADR-0003)';
  end if;

  SELECT m.publication_state, 'module' INTO v_old_state, v_target_type
    FROM public.ppg_modules m
  WHERE m.module_key = p_target_key;

  if not FOUND then
    SELECT l.publication_state, 'lesson' INTO v_old_state, v_target_type
      FROM public.ppg_lessons l
    WHERE l.lesson_key = p_target_key;
    if not FOUND then
      raise exception 'target_missing: no module/lesson row for p_target_key';
    end if;
  end if;

  UPDATE public.ppg_modules m
     SET publication_state = p_new_state
   WHERE m.module_key = p_target_key;
  UPDATE public.ppg_lessons l
     SET publication_state = p_new_state
   WHERE l.lesson_key = p_target_key;

  insert into public.ppg_audit_events
    (actor_id, action, target_type, target_id, details, created_at)
  VALUES (
    auth.uid(),
    'publication',
    v_target_type,
    p_target_key,
    jsonb_build_object(
      'old_state', v_old_state,
      'new_state', p_new_state
    ),
    now()
  );
  return;
end;
$$;

revoke execute on function public.ppg_set_publication(text, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_set_publication(text, text)
  to service_role;

comment on function public.ppg_set_publication(text, text) is
  'PPGA #9: admin-only publication-toggle RPC; one call = one module/lesson UPDATE + exactly one audit INSERT (action `publication`, details old/new state) — an invalid state reaches `invalid_publication_state`, a missing target `target_missing`, a smuggler `permission_denied`.';

-- The seeded curriculum: the real Modules (published — the toggle's own
-- authority decides what is visible meanwhile; the default is draft by the
-- column) tagged with the real Skill Domains above, ordered 1..10, bilingual
-- independent title+summary; the real Lessons (published) inside them, 1..3
-- per module, with the #16 story's what/why/body/what-next bilingual copy —
-- concise but real content in BOTH languages (ADR-0003: content as versioned
-- seed, reviewed via git, both languages side by side).
insert into public.ppg_modules (module_key, course_key, order_index, skill_domain, title_th, title_en, summary_th, summary_en, publication_state)
  values
    ('module-01', 'powerpoint-creation', 1, 'PowerPoint Basics',          'การเปิดงาน PowerPoint กับส้างพรีเซนตใหม่',       'Opening PowerPoint & a new presentation',      'เปิดงาน PowerPoint, ส้างพรีเซนตใหม่, วิ้วพาเนล.',          'Open PowerPoint, create a new presentation, view the panes.',       'published'),
    ('module-02', 'powerpoint-creation', 2, 'Slide Creation',              'การส้างสไลดใหม่กับเลือกแบบสไลด',          'Slide Creation & slide types',      'ส้างสไลดใหม่, เลือก, ครอบสไลด, แบบ (Standard/Vert.?) .',      'Create, select, copy, delete slides; the slide types.',       'published'),
    ('module-03', 'powerpoint-creation', 3, 'Text Formatting',          'การพิมพ์ข้อความกับแบบอักษร',          'Text Formatting',      'พิมพ์ข้อความ, แบบFont, ขนาด, ส้าย/ช้าย-กลาง/ขวา.',      'Enter text; font, size, alignment: left/center/right.',       'published'),
    ('module-04', 'powerpoint-creation', 4, 'Slide Design',              'การแบบสไลดกับ-layout',          'Slide Design & layout',      'แบบ-layout, แบบ-slide, แบบ-placeholder, ครอบแบบ.',      'Design layouts, slide types, placeholders, layout wrap.',       'published'),
    ('module-05', 'powerpoint-creation', 5, 'Fonts & Text Effects',      'การแบบอักษรกับ-effect',          'Fonts & Text Effects',      'เปลี่ยนแบบFont, Color, Line, Shadow, Effect .',      'Change fonts; color, line, shadow, text effects.',       'published'),
    ('module-06', 'powerpoint-creation', 6, 'Shapes & Lines',          'การส้างรูปร่างกับเส้น',          'Shapes & Lines',      'ส้างรูปร่าง, แบบ, ส้าย, ขนาด, ครอบ, แบบ-shape .',      'Create shapes; fill, line, size, copy, shape types.',       'published'),
    ('module-07', 'powerpoint-creation', 7, 'Smart Art Graphics',          'การ Smart Art',          'Smart Art Graphics',      'ส้าง Smart Art, แบบ, แบบ-Graphic .',      'Create Smart Art; change, graphic types.',       'published'),
    ('module-08', 'powerpoint-creation', 8, 'Object Layout',              'การวางรูปรายกับภาพ',          'Object & image layout',      'วางรูปราย, ครอบ, ครอบ-Image, แบบ-Layout .',      'Place pictures; copy, image layout, wrap text.',       'published'),
    ('module-09', 'powerpoint-creation', 9, 'Transition & Animation',      'การ Transition',          'Transition & animation',      'แบบ-Transition, ครอบ-Advance, ครอบ-Slide-Show .',      'Change transitions; advance-on click, slide-show timing.',       'published'),
    ('module-10', 'powerpoint-creation', 10, 'Review Publish Export',      'การตรวจแก้มกับส้างพรีเซนต',          'Review, publish & export',      'ตรวจแก้ม, ครอบ, ส้าง-PDF.',      'Review & collaborate; publish: PDF, print, share.',       'published')
on conflict (module_key) do nothing;

insert into public.ppg_lessons (lesson_key, module_key, order_index, title_th, title_en, what_learn_th, what_learn_en, why_th, why_en, body_th, body_en, what_next_th, what_next_en, publication_state)
  values
    ('module-01-lesson-01', 'module-01', 1, 'การเปิดงาน PowerPoint', 'Opening PowerPoint',      'เปิดงาน PowerPoint กับส้างพรีเซนต', 'Open PowerPoint and create a new presentation',      'การเปิดงานเป็นขั้แรกของทุกทักษะ', 'Opening the app is the step every later skill rides',      'เปิด PowerPoint, ครอบ-Home, ส้าง-New, ครอบ-Blank, ครอบ-Slide.',      'Open PowerPoint, click Home, click New, pick Blank, add a Slide.',      'การเปลี่ยนวิ้วพาเนล (Normal / Preview)', 'Switch views (normal/preview) next.', 'published'),
    ('module-01-lesson-02', 'module-01', 2, 'การเปลี่ยนวิ้วพาเนล', 'Switching panes & views',      'เปลี่ยนวิ้วพาเนล: Normal, Preview', 'Switch panes: normal, preview',      'การวิ้วพาเนลเป็นขั้ก่อนการแบบ', 'Views come before the design step',      'วิ้ว-Normal, วิ้ว-Preview, วิ้ว-Design-View.',      'Normal view, Preview, Design view.',      'การส้างสไลด (Slide Creation)', 'Slide Creation follows.', 'published'),
    ('module-02-lesson-01', 'module-02', 1, 'การส้างสไลดใหม่', 'Creating slides',      'ส้างสไลด, ครอบ-Standard/Vert.', 'Create slides; standard & vertical',      'การส้างสไลดจะจตองก่อน-Text', 'Slides before text',      'ครอบ-Home, ครอบ-New, ครอบ-Blank, ครอบ-Vertical, ครอบ-Slide .',      'Home, New, Blank, Vertical, add slides.',      'การพิมพ์ข้อความ (Text Formatting) จตาม', 'Text Formatting follows.', 'published'),
    ('module-03-lesson-01', 'module-03', 1, 'การพิมพ์ข้อความ', 'Entering text',      'พิมพ์ข้อความ, ครอบ-Click, ครอบ-Tab, ครอบ-Enter', 'Enter text; click, tab, enter',      'ข้อความจะจตองก่อน-Design', 'Text before design',      'ครอบ-Placeholder, ครอบ-Click, ครอบ-Tab, ครอบ-Enter .',      'Click a placeholder, type with Tab/Enter.',      'การ-Font (Fonts & Text Effects) จตาม', 'Fonts follow.', 'published'),
    ('module-03-lesson-02', 'module-03', 2, 'การแบบFont', 'Font changes',      'เปลี่ยนFont, ครอบ-Size, ครอบ-Align', 'Change font, size, alignment',      'การ-Font จะจตองอ่าน-Thai', 'Font choices carry the Thai readability',      'ครอบ-Home, ครอบ-Font, ครอบ-Size, ครอบ-Align, ครอบ-Color .',      'Home, Font, size, alignment, color.',      'การ-Layout (Slide Design) จตาม', 'Slide Design follows.', 'published'),
    ('module-04-lesson-01', 'module-04', 1, 'การแบบ-layout', 'Layout & design',      'แบบ-layout, ครอบ-Placeholder', 'Layouts and placeholders',      'การ-layout จะจตองก่อน-Effects', 'Layouts before effects',      'วิ้ว-Design, ครอบ-Layout, ครอบ-Slide, ครอบ-Placeholder .',      'Design view, layouts, slide types, placeholders.',      'การ-Effect (Fonts & Text Effects) จตาม', 'Text effects follow.', 'published'),
    ('module-05-lesson-01', 'module-05', 1, 'การ-Effect', 'Text effects',      'เปลี่ยน-Color, -Line, -Shadow, -Effect', 'Color, line, shadow, effects',      'การ-Effect จะจตอง-after-Text', 'Effects after text',      'วิ้ว-Home, ครอบ-Font, ครอบ-Effect, ครอบ-Color .',      'Home tab, font menu, effects, color.',      'การ-Shapes (Shapes & Lines) จตาม', 'Shapes follow.', 'published'),
    ('module-06-lesson-01', 'module-06', 1, 'การ-Shapes', 'Shapes & lines',      'ส้างรูปร่าง, ครอบ-Fill/Line', 'Create shapes; fill & line',      'การ-Shapes จะจตอง-after-Layout', 'Shapes after layouts',      'วิ้ว-Insert, ครอบ-Shapes, ครอบ-Fill, ครอบ-Line .',      'Insert tab, shapes, fill, line.',      'การ-SmartArt (Smart Art Graphics) จตาม', 'Smart Art follows.', 'published'),
    ('module-07-lesson-01', 'module-07', 1, 'การ-SmartArt', 'Smart Art',      'ส้าง-SmartArt, ครอบ-Change', 'Create Smart Art; change it',      'การ-SmartArt จะจตอง-after-Shapes', 'Smart Art after shapes',      'วิ้ว-Insert, ครอบ-SmartArt, ครอบ-Change .',      'Insert tab, Smart Art, change types.',      'การ-Object (Object Layout) จตาม', 'Object layout follows.', 'published'),
    ('module-08-lesson-01', 'module-08', 1, 'การ-Object', 'Object & image layout',      'วาง-Image, ครอบ-Wrap', 'Place pictures; wrap text',      'การ-Object จะจตอง-after-Layout', 'Object layout after design',      'วิ้ว-Insert, ครอบ-Image, ครอบ-Wrap .',      'Insert tab, picture, wrap text.',      'การ-Transition (Transition) จตาม', 'Transition follows.', 'published'),
    ('module-09-lesson-01', 'module-09', 1, 'การ-Transition', 'Transition',      'เปลี่ยน-Transition, ครอบ-Advance', 'Change transitions; advance-on click',      'การ-Transition จะจตอง-after-Slide', 'Transitions after the slides',      'วิ้ว-SlideShow, ครอบ-Transition, ครอบ-Advance .',      'Slide Show tab, transitions, advance on click.',      'การ-Review (Review Publish Export) จตาม', 'Review & publish follow.', 'published'),
    ('module-10-lesson-01', 'module-10', 1, 'การ-Review', 'Review & collaborate',      'ตรวจ-Review, ครอบ-Collab', 'Review & collaboration',      'การ-Review จะจตอง-before-Publish', 'Review before publish',      'วิ้ว-Review, ครอบ-Check, ครอบ-Collab .',      'Review tab, checks, collaboration.',      'การ-Export (Publish) จตาม', 'Publish & export follow.', 'published'),
    ('module-10-lesson-02', 'module-10', 2, 'การ-PDF', 'Publish & export',      'ส้าง-PDF, ครอบ-Print', 'PDF, print, share',      'การ-PDF จะจตอง-final', 'The PDF is the end of the intervention',      'วิ้ว-File, ครอบ-PDF, ครอบ-Print .',      'File tab, PDF, print, share.',      'การ-Final-Project จตาม', 'The Final Project follows.', 'published')
on conflict (lesson_key) do nothing;

-- Seed the Mission placeholder AFTER the modules exist (the cross join the
-- seeded learner profiles + the seeded modules; the column's own default
-- speaks `incomplete` — nothing here says what a later migration may wire).
insert into public.ppg_module_missions (module_key, learner_id)
  select m.module_key, p.id
    from public.ppg_modules m
   cross join public.ppg_profiles p
  where p.role = 'learner'
    and m.order_index > 1
on conflict (module_key, learner_id) do nothing;