-- PPGA #18 (production verification): the Self-Check completion seed.
--
-- Verification finding #1 (the linear course is traversable only for Module 1):
-- the linear rule (the replaced `ppg_module_unlocked` of #10) and the Mission
-- visibility rule (#11's `ppg_knowledge_mission_visible`) BOTH require a PASSED
-- Self-Check on the module's LAST Lesson, but `20260926000700` seeded
-- `ppg_self_check_questions` for the Module 1 Lessons ONLY. A learner who
-- finished Module 1 for real reached Module 2, saw its Lesson (no Self-Check
-- questions -> the screen's empty state), could NEVER pass a check, and so
-- could NEVER see the Mission — the #10/#11 user story stopped dead at the
-- browser after Module 1. The seam tests never caught it (they call the RPCs
-- with the answer jsonb directly, never through the screen's form).
--
-- This migration completes the seed for EVERY published Lesson of Modules 2..10
-- that lacks questions (Module 11 — the Final Project — has no Lessons: the
-- practical IS its screen). The copy follows the exact PLACEHOLDER-BUT-VALID
-- pattern the #11 Mission seed documented for Modules 2..7: real bilingual
-- (th/en) prompts/options, one true + distractors, `is_correct` server-side
-- only (the key never rides the read RPC). The #9/#11/#13 content pass replaces
-- this copy verbatim, exactly as the Mission placeholders wait for theirs.
-- Idempotent: ON CONFLICT DO NOTHING against the (lesson_key, order_index,
-- option_key) PK — a re-run of `supabase db reset` re-seeds the same rows.

insert into public.ppg_self_check_questions
  (lesson_key, order_index, option_key, prompt_th, prompt_en, option_th, option_en, is_correct)
values
  -- Module 2, Lesson 1 (Slide Creation):
  ('module-02-lesson-01', 1, 'a', 'Home-New ส้าง-สไลด-ใหม่', 'Home > New creates…', 'a new slide (New)', 'a new slide (New)', true),
  ('module-02-lesson-01', 1, 'b', 'Home-New ส้าง-สไลด-ใหม่', 'Home > New creates…', 'a new file (File > New)', 'a new file (File > New)', false),
  ('module-02-lesson-01', 1, 'c', 'Home-New ส้าง-สไลด-ใหม่', 'Home > New creates…', 'nothing (the tab is dead)', 'nothing (the tab is dead)', false),
  ('module-02-lesson-01', 2, 'a', 'ครอบ-สไลด-กอน-พิมพ', 'Slides come before…', 'typing the text (text needs a slide)', 'typing the text (text needs a slide)', true),
  ('module-02-lesson-01', 2, 'b', 'ครอบ-สไลด-กอน-พิมพ', 'Slides come before…', 'printing (print first)', 'printing (print first)', false),
  ('module-02-lesson-01', 2, 'c', 'ครอบ-สไลด-กอน-พิมพ', 'Slides come before…', 'exporting a PDF (export first)', 'exporting a PDF (export first)', false),
  -- Module 3, Lesson 1 (Entering text):
  ('module-03-lesson-01', 1, 'a', 'พิมพ-ใน-ใด', 'Text is typed inside a…', 'placeholder (click, type)', 'placeholder (click, type)', true),
  ('module-03-lesson-01', 1, 'b', 'พิมพ-ใน-ใด', 'Text is typed inside a…', 'printer dialog', 'printer dialog', false),
  ('module-03-lesson-01', 1, 'c', 'พิมพ-ใน-ใด', 'Text is typed inside a…', 'slide-show fullscreen', 'slide-show fullscreen', false),
  ('module-03-lesson-01', 2, 'a', 'Tab-Enter-ใน-TEXT', 'Inside a text box Tab/Enter…', 'move and break the text (new lines)', 'move and break the text (new lines)', true),
  ('module-03-lesson-01', 2, 'b', 'Tab-Enter-ใน-TEXT', 'Inside a text box Tab/Enter…', 'close the app', 'close the app', false),
  ('module-03-lesson-01', 2, 'c', 'Tab-Enter-ใน-TEXT', 'Inside a text box Tab/Enter…', 'start the slide show', 'start the slide show', false),
  -- Module 3, Lesson 2 (Font changes):
  ('module-03-lesson-02', 1, 'a', 'Font-Size-Align-อยู่-ใด', 'Font, size, alignment live on…', 'the Home tab', 'the Home tab', true),
  ('module-03-lesson-02', 1, 'b', 'Font-Size-Align-อยู่-ใด', 'Font, size, alignment live on…', 'the View tab', 'the View tab', false),
  ('module-03-lesson-02', 1, 'c', 'Font-Size-Align-อยู่-ใด', 'Font, size, alignment live on…', 'the Help pane', 'the Help pane', false),
  ('module-03-lesson-02', 2, 'a', 'Thai อ่าน-ง่าย-ด้วย-ใด', 'Thai text reads easily with…', 'a Thai font at a readable size', 'a Thai font at a readable size', true),
  ('module-03-lesson-02', 2, 'b', 'Thai อ่าน-ง่าย-ด้วย-ใด', 'Thai text reads easily with…', '8-pt decoration only', '8-pt decoration only', false),
  ('module-03-lesson-02', 2, 'c', 'Thai อ่าน-ง่าย-ด้วย-ใด', 'Thai text reads easily with…', 'white-on-white color', 'white-on-white color', false),
  -- Module 4, Lesson 1 (Layout & design):
  ('module-04-lesson-01', 1, 'a', 'Layout-อยู่-ที่-ใด', 'Layouts are picked in…', 'the Design view (Layout)', 'the Design view (Layout)', true),
  ('module-04-lesson-01', 1, 'b', 'Layout-อยู่-ที่-ใด', 'Layouts are picked in…', 'File > Print', 'File > Print', false),
  ('module-04-lesson-01', 1, 'c', 'Layout-อยู่-ที่-ใด', 'Layouts are picked in…', 'the clock settings', 'the clock settings', false),
  ('module-04-lesson-01', 2, 'a', 'Placeholder คือ', 'A placeholder is…', 'the box the layout reserves for content', 'the box the layout reserves for content', true),
  ('module-04-lesson-01', 2, 'b', 'Placeholder คือ', 'A placeholder is…', 'a deleted slide', 'a deleted slide', false),
  ('module-04-lesson-01', 2, 'c', 'Placeholder คือ', 'A placeholder is…', 'a file name', 'a file name', false),
  -- Module 5, Lesson 1 (Text effects):
  ('module-05-lesson-01', 1, 'a', 'Color-Shadow-Effect-อยู่-ใด', 'Color/shadow/effects ride…', 'the Home font menu', 'the Home font menu', true),
  ('module-05-lesson-01', 1, 'b', 'Color-Shadow-Effect-อยู่-ใด', 'Color/shadow/effects ride…', 'the status bar', 'the status bar', false),
  ('module-05-lesson-01', 1, 'c', 'Color-Shadow-Effect-อยู่-ใด', 'Color/shadow/effects ride…', 'the recycle bin', 'the recycle bin', false),
  ('module-05-lesson-01', 2, 'a', 'Effect อ่าน-ยาก-เมื่อ', 'Effects hurt readability when…', 'they drown the text', 'they drown the text', true),
  ('module-05-lesson-01', 2, 'b', 'Effect อ่าน-ยาก-เมื่อ', 'Effects hurt readability when…', 'they are absent', 'they are absent', false),
  ('module-05-lesson-01', 2, 'c', 'Effect อ่าน-ยาก-เมื่อ', 'Effects hurt readability when…', 'the font is large', 'the font is large', false),
  -- Module 6, Lesson 1 (Shapes):
  ('module-06-lesson-01', 1, 'a', 'Shapes อยู่-ที่-ใด', 'Shapes are inserted from…', 'the Insert tab (Shapes)', 'the Insert tab (Shapes)', true),
  ('module-06-lesson-01', 1, 'b', 'Shapes อยู่-ที่-ใด', 'Shapes are inserted from…', 'the Review tab', 'the Review tab', false),
  ('module-06-lesson-01', 1, 'c', 'Shapes อยู่-ที่-ใด', 'Shapes are inserted from…', 'View > Slide Show', 'View > Slide Show', false),
  ('module-06-lesson-01', 2, 'a', 'Fill-Line คือ', 'Fill and line are…', 'a shape interior and border', 'a shape interior and border', true),
  ('module-06-lesson-01', 2, 'b', 'Fill-Line คือ', 'Fill and line are…', 'slide numbers', 'slide numbers', false),
  ('module-06-lesson-01', 2, 'c', 'Fill-Line คือ', 'Fill and line are…', 'printer trays', 'printer trays', false),
  -- Module 7, Lesson 1 (Smart Art):
  ('module-07-lesson-01', 1, 'a', 'SmartArt อยู่-ที่-ใด', 'Smart Art is inserted from…', 'Insert > Smart Art', 'Insert > Smart Art', true),
  ('module-07-lesson-01', 1, 'b', 'SmartArt อยู่-ที่-ใด', 'Smart Art is inserted from…', 'File > Save As', 'File > Save As', false),
  ('module-07-lesson-01', 1, 'c', 'SmartArt อยู่-ที่-ใด', 'Smart Art is inserted from…', 'the spell-checker', 'the spell-checker', false),
  ('module-07-lesson-01', 2, 'a', 'Change- ได้-อะไร', 'Changing a Smart Art layout…', 'keeps the text, restyles the graphic', 'keeps the text, restyles the graphic', true),
  ('module-07-lesson-01', 2, 'b', 'Change- ได้-อะไร', 'Changing a Smart Art layout…', 'deletes the presentation', 'deletes the presentation', false),
  ('module-07-lesson-01', 2, 'c', 'Change- ได้-อะไร', 'Changing a Smart Art layout…', 'sends an email', 'sends an email', false),
  -- Module 8, Lesson 1 (Object & image layout):
  ('module-08-lesson-01', 1, 'a', 'Image อยู่-ที่-ใด', 'A picture is inserted from…', 'Insert > Picture', 'Insert > Picture', true),
  ('module-08-lesson-01', 1, 'b', 'Image อยู่-ที่-ใด', 'A picture is inserted from…', 'Review > Word Count', 'Review > Word Count', false),
  ('module-08-lesson-01', 1, 'c', 'Image อยู่-ที่-ใด', 'A picture is inserted from…', 'the file manager only', 'the file manager only', false),
  ('module-08-lesson-01', 2, 'a', 'Wrap-Text คือ', 'Wrap text controls…', 'how text flows around a picture', 'how text flows around a picture', true),
  ('module-08-lesson-01', 2, 'b', 'Wrap-Text คือ', 'Wrap text controls…', 'the save format', 'the save format', false),
  ('module-08-lesson-01', 2, 'c', 'Wrap-Text คือ', 'Wrap text controls…', 'the slide count', 'the slide count', false),
  -- Module 9, Lesson 1 (Transition):
  ('module-09-lesson-01', 1, 'a', 'Transition อยู่-ที่-ใด', 'Transitions are set on the…', 'Transitions tab', 'Transitions tab', true),
  ('module-09-lesson-01', 1, 'b', 'Transition อยู่-ที่-ใด', 'Transitions are set on the…', 'Help tab', 'Help tab', false),
  ('module-09-lesson-01', 1, 'c', 'Transition อยู่-ที่-ใด', 'Transitions are set on the…', 'clipboard', 'clipboard', false),
  ('module-09-lesson-01', 2, 'a', 'Advance-on-Click คือ', 'Advance on click means the slide moves…', 'when the presenter clicks', 'when the presenter clicks', true),
  ('module-09-lesson-01', 2, 'b', 'Advance-on-Click คือ', 'Advance on click means the slide moves…', 'on a timer never', 'on a timer never', false),
  ('module-09-lesson-01', 2, 'c', 'Advance-on-Click คือ', 'Advance on click means the slide moves…', 'when the printer warms', 'when the printer warms', false),
  -- Module 10, Lesson 1 (Review & collaborate):
  ('module-10-lesson-01', 1, 'a', 'Review อยู่-ที่-ใด', 'Spelling/comments ride the…', 'Review tab', 'Review tab', true),
  ('module-10-lesson-01', 1, 'b', 'Review อยู่-ที่-ใด', 'Spelling/comments ride the…', 'View tab', 'View tab', false),
  ('module-10-lesson-01', 1, 'c', 'Review อยู่-ที่-ใด', 'Spelling/comments ride the…', 'power switch', 'power switch', false),
  ('module-10-lesson-01', 2, 'a', 'ตรวจ-ก่อน-ส่ง-เพราะ', 'Checking before publishing matters because…', 'the deck reaches an audience', 'the deck reaches an audience', true),
  ('module-10-lesson-01', 2, 'b', 'ตรวจ-ก่อน-ส่ง-เพราะ', 'Checking before publishing matters because…', 'the printer judges it', 'the printer judges it', false),
  ('module-10-lesson-01', 2, 'c', 'ตรวจ-ก่อน-ส่ง-เพราะ', 'Checking before publishing matters because…', 'fonts self-correct', 'fonts self-correct', false),
  -- Module 10, Lesson 2 (the LAST Lesson — the linear rule reads this one):
  ('module-10-lesson-02', 1, 'a', 'PDF อยู่-ที่-ใด', 'Publishing to PDF runs through…', 'File > Export/Save As PDF', 'File > Export/Save As PDF', true),
  ('module-10-lesson-02', 1, 'b', 'PDF อยู่-ที่-ใด', 'Publishing to PDF runs through…', 'Insert > Shapes', 'Insert > Shapes', false),
  ('module-10-lesson-02', 1, 'c', 'PDF อยู่-ที่-ใด', 'Publishing to PDF runs through…', 'the scroll lock key', 'the scroll lock key', false),
  ('module-10-lesson-02', 2, 'a', 'PDF คือ-สิ่ง-ใด', 'The PDF is the Course''s…', 'final deliverable (the end of the intervention)', 'final deliverable (the end of the intervention)', true),
  ('module-10-lesson-02', 2, 'b', 'PDF คือ-สิ่ง-ใด', 'The PDF is the Course''s…', 'first draft', 'first draft', false),
  ('module-10-lesson-02', 2, 'c', 'PDF คือ-สิ่ง-ใด', 'The PDF is the Course''s…', 'login screen', 'login screen', false)
on conflict (lesson_key, order_index, option_key) do nothing;

comment on table public.ppg_self_check_questions is
  'PPGA #10 seeded through #18: Self-Check questions for EVERY published Lesson of Modules 1..10 (#18 completed the seed — #10 shipped Module 1 only, which dead-ended the linear rule at Module 2: the Mission visibility (#11) and the unlock (#10''s replaced linear rule) both require the LAST Lesson''s passed check; Module 11 — the Final Project — has no Lessons (the practical IS its screen). The `is_correct` key column stays server-side (the read RPC never carries it).';
