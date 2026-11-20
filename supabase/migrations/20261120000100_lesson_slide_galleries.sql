-- ============================================================================
-- Lesson slide galleries for chapters 1-3.
--
-- The owner's unit slide decks are teaching material, not research answers,
-- so the WebP files live in the public `ppg-lesson-slides` Storage bucket and
-- this table is the ordered catalog the chapter page reads. The page gate
-- still decides whether a learner may see the chapter at all; this table's
-- RLS only requires an authenticated learner/teacher/admin. There is no
-- client write policy: slides are seeded here and managed out-of-band.
-- ============================================================================

begin;

create table if not exists public.ppg_lesson_slides (
  module_key text not null references public.ppg_modules(module_key) on delete cascade,
  order_index int not null check (order_index > 0),
  storage_path text not null,
  alt_th text not null,
  alt_en text not null,
  created_at timestamptz not null default now(),
  primary key (module_key, order_index)
);

alter table public.ppg_lesson_slides enable row level security;

drop policy if exists ppg_lesson_slides_select on public.ppg_lesson_slides;
create policy ppg_lesson_slides_select on public.ppg_lesson_slides
  for select
  to authenticated
  using (auth.role() in ('learner', 'teacher', 'admin'));

grant select on public.ppg_lesson_slides to authenticated;

insert into public.ppg_lesson_slides (module_key, order_index, storage_path, alt_th, alt_en)
values
  ('chapter-01', 1, 'chapter-01/01.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 1', 'Unit 1 slide 1'),
  ('chapter-01', 2, 'chapter-01/02.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 2', 'Unit 1 slide 2'),
  ('chapter-01', 3, 'chapter-01/03.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 3', 'Unit 1 slide 3'),
  ('chapter-01', 4, 'chapter-01/04.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 4', 'Unit 1 slide 4'),
  ('chapter-01', 5, 'chapter-01/05.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 5', 'Unit 1 slide 5'),
  ('chapter-01', 6, 'chapter-01/06.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 6', 'Unit 1 slide 6'),
  ('chapter-01', 7, 'chapter-01/07.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 7', 'Unit 1 slide 7'),
  ('chapter-01', 8, 'chapter-01/08.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 8', 'Unit 1 slide 8'),
  ('chapter-01', 9, 'chapter-01/09.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 9', 'Unit 1 slide 9'),
  ('chapter-01', 10, 'chapter-01/10.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 10', 'Unit 1 slide 10'),
  ('chapter-01', 11, 'chapter-01/11.webp', 'สไลด์ประกอบ หน่วยที่ 1 หน้า 11', 'Unit 1 slide 11'),
  ('chapter-02', 1, 'chapter-02/01.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 1', 'Unit 2 slide 1'),
  ('chapter-02', 2, 'chapter-02/02.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 2', 'Unit 2 slide 2'),
  ('chapter-02', 3, 'chapter-02/03.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 3', 'Unit 2 slide 3'),
  ('chapter-02', 4, 'chapter-02/04.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 4', 'Unit 2 slide 4'),
  ('chapter-02', 5, 'chapter-02/05.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 5', 'Unit 2 slide 5'),
  ('chapter-02', 6, 'chapter-02/06.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 6', 'Unit 2 slide 6'),
  ('chapter-02', 7, 'chapter-02/07.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 7', 'Unit 2 slide 7'),
  ('chapter-02', 8, 'chapter-02/08.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 8', 'Unit 2 slide 8'),
  ('chapter-02', 9, 'chapter-02/09.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 9', 'Unit 2 slide 9'),
  ('chapter-02', 10, 'chapter-02/10.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 10', 'Unit 2 slide 10'),
  ('chapter-02', 11, 'chapter-02/11.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 11', 'Unit 2 slide 11'),
  ('chapter-02', 12, 'chapter-02/12.webp', 'สไลด์ประกอบ หน่วยที่ 2 หน้า 12', 'Unit 2 slide 12'),
  ('chapter-03', 1, 'chapter-03/01.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 1', 'Unit 3 slide 1'),
  ('chapter-03', 2, 'chapter-03/02.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 2', 'Unit 3 slide 2'),
  ('chapter-03', 3, 'chapter-03/03.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 3', 'Unit 3 slide 3'),
  ('chapter-03', 4, 'chapter-03/04.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 4', 'Unit 3 slide 4'),
  ('chapter-03', 5, 'chapter-03/05.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 5', 'Unit 3 slide 5'),
  ('chapter-03', 6, 'chapter-03/06.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 6', 'Unit 3 slide 6'),
  ('chapter-03', 7, 'chapter-03/07.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 7', 'Unit 3 slide 7'),
  ('chapter-03', 8, 'chapter-03/08.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 8', 'Unit 3 slide 8'),
  ('chapter-03', 9, 'chapter-03/09.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 9', 'Unit 3 slide 9'),
  ('chapter-03', 10, 'chapter-03/10.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 10', 'Unit 3 slide 10'),
  ('chapter-03', 11, 'chapter-03/11.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 11', 'Unit 3 slide 11'),
  ('chapter-03', 12, 'chapter-03/12.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 12', 'Unit 3 slide 12'),
  ('chapter-03', 13, 'chapter-03/13.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 13', 'Unit 3 slide 13'),
  ('chapter-03', 14, 'chapter-03/14.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 14', 'Unit 3 slide 14'),
  ('chapter-03', 15, 'chapter-03/15.webp', 'สไลด์ประกอบ หน่วยที่ 3 หน้า 15', 'Unit 3 slide 15')
on conflict (module_key, order_index) do update
  set storage_path = excluded.storage_path,
      alt_th = excluded.alt_th,
      alt_en = excluded.alt_en;

commit;
