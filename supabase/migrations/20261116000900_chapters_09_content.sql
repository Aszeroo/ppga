-- ============================================================================
-- PPGA #82: authored Chapter 9 content for the CAI Presentation Program course.
--
-- Chapter 9 (Presentation setup and applying a presentation program to
-- digital-business work) joins the active course at order_index 9, closing
-- the nine-chapter course map. It stays locked until the 70%-post-test gate
-- writes the unlock record for Chapter 8; no learner attempt, XP, badge or
-- unlock row is touched, and legacy content is never deleted. Every seed is
-- idempotent (on conflict ... do update).
--
-- All Thai/English copy is authored for the vocational subject 21910-2006.
-- PowerPoint is the example; Google Slides, LibreOffice Impress, Keynote and
-- Canva are named as equivalents. The applied scenario prepares the learner
-- for the 50-item Final Test.
-- ============================================================================

-- The chapter-09 skill-domain tag (idempotent).
insert into public.ppg_skill_domains
  (domain, label_th, label_en)
values
  ('Presentation Delivery and Application', 'การนำเสนอและการประยุกต์ใช้', 'Presentation Delivery and Application')
on conflict (domain) do update set label_th = excluded.label_th, label_en = excluded.label_en;

-- Chapter 9 joins the active course at order_index 9.
insert into public.ppg_modules
  (module_key, course_key, order_index, skill_domain, title_th, title_en, summary_th, summary_en, publication_state)
values
  ('chapter-09', 'presentation-program', 9, 'Presentation Delivery and Application', 'การตั้งค่าการนำเสนอและการประยุกต์ใช้โปรแกรมนำเสนอในงานธุรกิจดิจิทัล', 'Presentation setup and applying a presentation program to digital-business work', 'การเตรียมเอกสารประกอบและเอกสารแจก การนำเสนอ การซ้อมและการตั้งเวลา และการประยุกต์ใช้โปรแกรมนำเสนอในงานธุรกิจดิจิทัลกับสถานการณ์จริงก่อนข้อสอบสุดท้าย', 'Preparing supporting documents and handouts, delivering with rehearsal and timing, and applying the presentation program to digital-business work with a real scenario before the Final Test.', 'published')
on conflict (module_key) do update set course_key = excluded.course_key, order_index = excluded.order_index, skill_domain = excluded.skill_domain, title_th = excluded.title_th, title_en = excluded.title_en, summary_th = excluded.summary_th, summary_en = excluded.summary_en, publication_state = excluded.publication_state;

-- Three lessons for Chapter 9.
insert into public.ppg_lessons
  (lesson_key, module_key, order_index, title_th, title_en, what_learn_th, what_learn_en, why_th, why_en, body_th, body_en, what_next_th, what_next_en, publication_state)
values
  ('chapter-09-lesson-01', 'chapter-09', 1, 'การเตรียมเอกสารประกอบและเอกสารแจก', 'Preparing supporting documents and handouts', 'อธิบายเอกสารประกอบและเอกสารแจกคืออะไรและเลือกเอกสารที่จะเตรียมให้ผู้ฟังได้', 'Explain what supporting documents and handouts are, and choose the document to prepare for the audience.', 'เอกสารประกอบช่วยผู้ฟังตามและจำประเด็นหลักหลังการนำเสนอได้', 'Supporting documents help the audience follow and keep the main points after the presentation.', 'เอกสารประกอบคือเอกสารที่ใช้กับการนำเสนอ เช่น เอกสารแจก บันทึกผู้นำเสนอหรือรายงาน เอกสารแจกคือหน้าสรุปที่ให้ผู้ฟัง มีประเด็นหลัก ข้อมูลและพื้นที่จดบันทึก ไม่ใช่คัดลอกทุกสไลด์ เตรียมก่อนวันนำเสนอ ตรวจตัวเลข และทำสองฉบับ หนึ่งสำหรับผู้ฟังและหนึ่งสำหรับผู้บรรยาย', 'Supporting documents are the material that goes with a presentation, such as a handout, speaker notes, or a report. A handout is the page you give the audience: it holds the main points, data, and space for notes, not a copy of every slide. Prepare it before the presentation day, check the numbers, and make two versions: one for the audience and one for the speaker.', 'ต่อไป: การนำเสนอ การซ้อมและการควบคุมเวลา', 'Next: delivering the presentation, rehearsal, and timing.', 'published'),
  ('chapter-09-lesson-02', 'chapter-09', 2, 'การนำเสนอ การซ้อมและการควบคุมเวลา', 'Delivering the presentation, rehearsal, and timing', 'เตรียมก่อนนำเสนอ ซ้อมกับนาฬิกาจับเวลา และควบคุมจังหวะขณะที่นำเสนอได้', 'Set up before you present, rehearse with a timer, and control the pace while delivering.', 'การซ้อมและการควบคุมเวลาทำให้คุณเสร็จตรงเวลาและทำให้ผู้ฟังตามคุณได้', 'Rehearsal and timing let you finish on schedule and keep the audience with you.', 'ก่อนนำเสนอ ตรวจอุปกรณ์ เปิดไฟล์ เริ่ม Slide Show จากสไลด์แรก มุมมองผู้นำเสนอแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ขณะที่ผู้ฟังเห็นสไลด์เท่านั้น ซ้อมออกเสียงกับนาฬิกาจับเวลาและตั้งเป้าให้เสร็จก่อนเวลา จากนั้นตั้งจุดที่ต้องช้าลงหรือตัดออก ขณะที่นำเสนอ สบตากับผู้ฟัง พูดด้วยจังหวะสม่ำเสมอ หยุดที่ประเด็นหลัก และดูนาฬิกาจับเวลาในมุมมองผู้นำเสนอ', 'Before you present, check the equipment, open the file, and start Slide Show from the first slide. Presenter View shows your notes and the next slide to the speaker while the audience sees only the slide. Rehearse out loud with a timer and aim to finish early, then mark the points where you must slow down or cut. While delivering, keep eye contact, speak at a steady pace, pause at the main points, and watch the timer in Presenter View.', 'ต่อไป: ประยุกต์ใช้โปรแกรมนำเสนอในงานธุรกิจดิจิทัล', 'Next: applying the presentation program to digital-business work.', 'published'),
  ('chapter-09-lesson-03', 'chapter-09', 3, 'ประยุกต์ใช้โปรแกรมนำเสนอในงานธุรกิจดิจิทัล', 'Applying a presentation program to digital-business work', 'ประยุกต์ใช้โปรแกรมนำเสนอกับงานธุรกิจดิจิทัล ส่งออกหรือแชร์ไฟล์ และนำเสนอในสถานการณ์จริงได้', 'Apply the presentation program to digital-business work, export or share the file, and present in a real situation.', 'งานธุรกิจดิจิทัลบ่อยมีการนำเสนอออนไลน์ แชร์ไฟล์ หรือส่งชุดที่ผู้ฟังเปิดภายหลัง', 'Digital-business work often means presenting online, sharing a file, or sending a deck the audience opens later.', 'สถานการณ์: ทีมคุณต้องนำเสนอแพ็กเกจบริการสำหรับลูกค้าออนไลน์ คุณเปิดไฟล์ ใช้ซ้ำธีม แทรกแผนภูมิของผลบริการ เพิ่มแผนภาพกระบวนการสั้น และตั้งการเปลี่ยนสไลด์หนึ่งแบบชัดเจน ก่อนประชุม ส่งออกเอกสารแจกเป็น PDF แชร์ลิงก์สำหรับคนที่เข้าร่วมออนไลน์ และซ้อมกับนาฬิกาจับเวลา ขณะที่ประชุม แชร์หน้าจอ ใช้มุมมองผู้นำเสนอ และหลังนำเสนอติดตามด้วย PDF และข้อมูลติดต่อ', 'Scenario: your team must pitch a service package to an online customer. You open the file, reuse the theme, insert a chart of the service results, add a short process diagram, and set one clear transition. Before the meeting you export a PDF handout, share a link for those who join online, and rehearse with a timer. During the meeting you share your screen, use Presenter View, and after presenting you follow up with the PDF and contact details.', 'ต่อไป: ภารกิจความรู้และข้อสอบหลังเรียน จากนั้นข้อสอบสุดท้าย', 'Next: the Knowledge Mission and the chapter post-test, then the Final Test.', 'published')
on conflict (lesson_key) do update set module_key = excluded.module_key, order_index = excluded.order_index, title_th = excluded.title_th, title_en = excluded.title_en, what_learn_th = excluded.what_learn_th, what_learn_en = excluded.what_learn_en, why_th = excluded.why_th, why_en = excluded.why_en, body_th = excluded.body_th, body_en = excluded.body_en, what_next_th = excluded.what_next_th, what_next_en = excluded.what_next_en, publication_state = excluded.publication_state;

-- Six ordered CAI steps per lesson; one formative mini-check per lesson.
insert into public.ppg_lesson_steps
  (lesson_key, order_index, kind, body_th, body_en, check_prompt_th, check_prompt_en, check_answer_key, check_explanation_th, check_explanation_en)
values
  ('chapter-09-lesson-01', 1, 'objective', 'เมื่อจบบทเรียนนี้คุณจะอธิบายเอกสารประกอบและเอกสารแจกและเลือกอะไรจะเตรียมได้', 'By the end you can explain supporting documents and handouts and choose what to prepare.', null, null, null, null, null),
  ('chapter-09-lesson-01', 2, 'explanation', 'เอกสารประกอบคือเอกสารที่ใช้กับการนำเสนอ เช่น เอกสารแจก บันทึกผู้นำเสนอหรือรายงาน', 'Supporting documents are the material that goes with the presentation, such as a handout, speaker notes, or a report.', null, null, null, null, null),
  ('chapter-09-lesson-01', 3, 'example', 'ตัวอย่าง: ทีมขายให้เอกสารแจกหนึ่งหน้าที่มีสรุปราคาและข้อมูลติดต่อ', 'Example: the sales team gives a one-page handout with a price summary and contact details.', null, null, null, null, null),
  ('chapter-09-lesson-01', 4, 'explanation', 'เอกสารแจกมีประเด็นหลัก ข้อมูลและพื้นที่จดบันทึก ไม่ใช่คัดลอกทุกสไลด์', 'A handout holds the main points, data, and space for notes; it does not copy every slide.', null, null, null, null, null),
  ('chapter-09-lesson-01', 5, 'check', '', '', 'ข้อใดคือเอกสารแจก', 'Which item is a handout?', 'a', 'เอกสารแจกคือหน้าสรุปสำหรับผู้ฟัง บันทึกผู้นำเสนอสำหรับผู้บรรยาย และพิมพ์ทุกสไลด์ไม่ใช่เอกสารแจก', 'A handout is a summary page for the audience; speaker notes are for the speaker, and printing every slide is not a handout.'),
  ('chapter-09-lesson-01', 6, 'summary', 'เตรียมเอกสารก่อนวันนำเสนอ ตรวจตัวเลข และเก็บหนึ่งฉบับสำหรับผู้ฟังและหนึ่งสำหรับผู้บรรยาย', 'Prepare the documents before the presentation day, check the numbers, and keep one version for the audience and one for the speaker.', null, null, null, null, null),
  ('chapter-09-lesson-02', 1, 'objective', 'เมื่อจบบทเรียนนี้คุณจะเตรียมก่อนนำเสนอและซ้อมกับนาฬิกาจับเวลาได้', 'By the end you can set up before presenting and rehearse with a timer.', null, null, null, null, null),
  ('chapter-09-lesson-02', 2, 'explanation', 'มุมมองผู้นำเสนอแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ขณะที่ผู้ฟังเห็นสไลด์เท่านั้น', 'Presenter View shows your notes and the next slide to the speaker while the audience sees only the slide.', null, null, null, null, null),
  ('chapter-09-lesson-02', 3, 'example', 'ตัวอย่าง: อบรมซ้อมกับนาฬิกาจับเวลาและเสร็จก่อนเวลาสองนาทีเพื่อให้มีเวลาสำหรับคำถาม', 'Example: a training session rehearses with a timer and finishes two minutes early to leave time for questions.', null, null, null, null, null),
  ('chapter-09-lesson-02', 4, 'explanation', 'ซ้อมออกเสียงกับนาฬิกาจับเวลาและตั้งจุดที่ต้องช้าลงหรือตัดออกเพื่อให้เสร็จก่อนเวลา', 'Rehearse out loud with a timer and mark where you must slow down or cut so you finish before time.', null, null, null, null, null),
  ('chapter-09-lesson-02', 5, 'check', '', '', 'เครื่องมือใดแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ขณะที่ผู้ฟังเห็นสไลด์เท่านั้น', 'Which tool shows the notes and the next slide to the speaker while the audience sees only the slide?', 'a', 'มุมมองผู้นำเสนอแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ตัวเรียงสไลด์แสดงสไลด์ทั้งหมดและหน้าบันทึกแสดงบันทึก', 'Presenter View shows the notes and the next slide to the speaker; Slide Sorter shows all slides and Notes Page shows the notes page.'),
  ('chapter-09-lesson-02', 6, 'summary', 'ตรวจอุปกรณ์ เปิดไฟล์ เริ่ม Slide Show จากสไลด์แรก ซ้อมกับนาฬิกาจับเวลา และพูดด้วยจังหวะสม่ำเสมอขณะที่นำเสนอ', 'Check the equipment, open the file, start Slide Show from the first slide, rehearse with a timer, and keep eye contact and a steady pace while presenting.', null, null, null, null, null),
  ('chapter-09-lesson-03', 1, 'objective', 'เมื่อจบบทเรียนนี้คุณจะประยุกต์ใช้โปรแกรมนำเสนอกับงานธุรกิจดิจิทัลและส่งออกหรือแชร์ไฟล์ได้', 'By the end you can apply the presentation program to digital-business work and export or share the file.', null, null, null, null, null),
  ('chapter-09-lesson-03', 2, 'explanation', 'การนำเสนอในงานธุรกิจดิจิทัลบ่อยเกิดขึ้นออนไลน์ แชร์หน้าจอ ส่งลิงก์ หรือส่งออก PDF', 'A digital-business presentation often happens online: share the screen, send a link, or export a PDF.', null, null, null, null, null),
  ('chapter-09-lesson-03', 3, 'example', 'ตัวอย่าง: ทีมคุณต้องนำเสนอแพ็กเกจบริการสำหรับลูกค้าออนไลน์ ส่งออกเอกสารแจกเป็น PDF แชร์ลิงก์ และซ้อมกับนาฬิกาจับเวลา', 'Example scenario: your team must pitch a service package to an online customer; you export a PDF handout, share a link, and rehearse with a timer.', null, null, null, null, null),
  ('chapter-09-lesson-03', 4, 'explanation', 'เลือกผลลัพธ์ที่เหมาะสม PDF สำหรับอ่าน ลิงก์สำหรับผู้ฟังออนไลน์ และไฟล์สไลด์สำหรับผู้บรรยาย', 'Choose the output that fits: a PDF for reading, a link for an online audience, and the slide file for the speaker.', null, null, null, null, null),
  ('chapter-09-lesson-03', 5, 'check', '', '', 'ผลลัพธ์ใดเหมาะสมกับผู้ฟังที่เปิดไฟล์หลังและแก้ไขไม่ได้', 'Which output suits an audience that will open the file later and cannot edit it?', 'a', 'PDF คือไฟล์อ่านอย่างเดียวและเปิดภายหลังได้ ไฟล์สไลด์ที่แก้ไขได้สำหรับผู้บรรยาย', 'A PDF is a read-only file the audience can open later; the editable slide file is for the speaker.'),
  ('chapter-09-lesson-03', 6, 'summary', 'เตรียมเอกสารและซ้อม นำเสนอกับมุมมองผู้นำเสนอและแชร์หน้าจอ จากนั้นติดตามด้วย PDF และข้อมูลติดต่อ สถานการณ์นี้เตรียมคุณสำหรับข้อสอบสุดท้าย', 'Prepare the documents and rehearse, present with Presenter View and screen sharing, then follow up with the PDF and contact details. This scenario prepares you for the Final Test.', null, null, null, null, null)
on conflict (lesson_key, order_index) do update set kind = excluded.kind, body_th = excluded.body_th, body_en = excluded.body_en, check_prompt_th = excluded.check_prompt_th, check_prompt_en = excluded.check_prompt_en, check_answer_key = excluded.check_answer_key, check_explanation_th = excluded.check_explanation_th, check_explanation_en = excluded.check_explanation_en;

-- Three bilingual options per mini-check (the key lives on the step row).
insert into public.ppg_lesson_step_options
  (lesson_key, step_order_index, option_key, option_th, option_en)
values
  ('chapter-09-lesson-01', 5, 'a', 'สรุปหนึ่งหน้าสำหรับผู้ฟัง', 'A one-page summary for the audience'),
  ('chapter-09-lesson-01', 5, 'b', 'บันทึกผู้นำเสนอ', 'The speaker notes'),
  ('chapter-09-lesson-01', 5, 'c', 'พิมพ์ทุกสไลด์', 'Printing every slide'),
  ('chapter-09-lesson-02', 5, 'a', 'มุมมองผู้นำเสนอ', 'Presenter View'),
  ('chapter-09-lesson-02', 5, 'b', 'ตัวเรียงสไลด์', 'Slide Sorter'),
  ('chapter-09-lesson-02', 5, 'c', 'บันทึกย่อ', 'Notes Page'),
  ('chapter-09-lesson-03', 5, 'a', 'ส่งออก PDF', 'Export to PDF'),
  ('chapter-09-lesson-03', 5, 'b', 'ไฟล์สไลด์ที่แก้ไขได้', 'The editable slide file'),
  ('chapter-09-lesson-03', 5, 'c', 'บันทึกผู้นำเสนอ', 'The speaker notes')
on conflict (lesson_key, step_order_index, option_key) do update set option_th = excluded.option_th, option_en = excluded.option_en;

-- One Knowledge Mission for Chapter 9.
insert into public.ppg_knowledge_missions
  (module_key, instructions_th, instructions_en)
values
  ('chapter-09', 'ภารกิจความรู้: ตอบคำถามหกข้อเกี่ยวกับเอกสารประกอบ เอกสารแจก การนำเสนอ และงานธุรกิจดิจิทัล ผ่านที่ 70% และทำซ้ำได้ไม่จำกัด', 'Knowledge Mission: answer six questions about supporting documents, handouts, delivery, and digital-business work. 70% passes; you can retry without limit.')
on conflict (module_key) do update set instructions_th = excluded.instructions_th, instructions_en = excluded.instructions_en;

-- Six mission questions, three options each, one server-side key.
insert into public.ppg_knowledge_mission_questions
  (module_key, order_index, option_key, prompt_th, prompt_en, option_th, option_en, is_correct, explanation_th, explanation_en, review_th, review_en)
values
  ('chapter-09', 1, 'a', 'ข้อใดคือเอกสารแจก', 'Which item is a handout?', 'สรุปหนึ่งหน้าสำหรับผู้ฟัง', 'A one-page summary for the audience', true, 'เอกสารแจกคือหน้าสรุปสำหรับผู้ฟัง บันทึกผู้นำเสนอสำหรับผู้บรรยาย และอุปกรณ์สำหรับนำเสนอ', 'A handout is a summary page for the audience; speaker notes are for the speaker, and equipment is for presenting.', 'ทบทวนบทเรียนที่ 1', 'Review lesson 1'),
  ('chapter-09', 1, 'b', 'ข้อใดคือเอกสารแจก', 'Which item is a handout?', 'บันทึกผู้นำเสนอ', 'The speaker notes', false, 'เอกสารแจกคือหน้าสรุปสำหรับผู้ฟัง บันทึกผู้นำเสนอสำหรับผู้บรรยาย และอุปกรณ์สำหรับนำเสนอ', 'A handout is a summary page for the audience; speaker notes are for the speaker, and equipment is for presenting.', 'ทบทวนบทเรียนที่ 1', 'Review lesson 1'),
  ('chapter-09', 1, 'c', 'ข้อใดคือเอกสารแจก', 'Which item is a handout?', 'อุปกรณ์สำหรับนำเสนอ', 'The equipment for presenting', false, 'เอกสารแจกคือหน้าสรุปสำหรับผู้ฟัง บันทึกผู้นำเสนอสำหรับผู้บรรยาย และอุปกรณ์สำหรับนำเสนอ', 'A handout is a summary page for the audience; speaker notes are for the speaker, and equipment is for presenting.', 'ทบทวนบทเรียนที่ 1', 'Review lesson 1'),
  ('chapter-09', 2, 'a', 'เอกสารแจกไม่ควรทำอะไร', 'What should a handout not do?', 'คัดลอกทุกสไลด์', 'Copy every slide', true, 'เอกสารแจกควรเก็บประเด็นหลักและพื้นที่จดบันทึก ไม่ใช่คัดลอกทุกสไลด์', 'A handout should keep the main points and space for notes; it should not copy every slide.', 'ทบทวนบทเรียนที่ 1', 'Review lesson 1'),
  ('chapter-09', 2, 'b', 'เอกสารแจกไม่ควรทำอะไร', 'What should a handout not do?', 'เก็บประเด็นหลัก', 'Keep the main points', false, 'เอกสารแจกควรเก็บประเด็นหลักและพื้นที่จดบันทึก ไม่ใช่คัดลอกทุกสไลด์', 'A handout should keep the main points and space for notes; it should not copy every slide.', 'ทบทวนบทเรียนที่ 1', 'Review lesson 1'),
  ('chapter-09', 2, 'c', 'เอกสารแจกไม่ควรทำอะไร', 'What should a handout not do?', 'มีพื้นที่จดบันทึก', 'Have space for notes', false, 'เอกสารแจกควรเก็บประเด็นหลักและพื้นที่จดบันทึก ไม่ใช่คัดลอกทุกสไลด์', 'A handout should keep the main points and space for notes; it should not copy every slide.', 'ทบทวนบทเรียนที่ 1', 'Review lesson 1'),
  ('chapter-09', 3, 'a', 'มุมมองผู้นำเสนอแสดงอะไรสำหรับผู้บรรยาย', 'What does Presenter View show to the speaker?', 'บันทึกและสไลด์ต่อไป', 'The notes and the next slide', true, 'มุมมองผู้นำเสนอแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ขณะที่ผู้ฟังเห็นสไลด์เท่านั้น', 'Presenter View shows the notes and the next slide to the speaker while the audience sees only the slide.', 'ทบทวนบทเรียนที่ 2', 'Review lesson 2'),
  ('chapter-09', 3, 'b', 'มุมมองผู้นำเสนอแสดงอะไรสำหรับผู้บรรยาย', 'What does Presenter View show to the speaker?', 'สไลด์ทั้งหมดเท่านั้น', 'All the slides only', false, 'มุมมองผู้นำเสนอแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ขณะที่ผู้ฟังเห็นสไลด์เท่านั้น', 'Presenter View shows the notes and the next slide to the speaker while the audience sees only the slide.', 'ทบทวนบทเรียนที่ 2', 'Review lesson 2'),
  ('chapter-09', 3, 'c', 'มุมมองผู้นำเสนอแสดงอะไรสำหรับผู้บรรยาย', 'What does Presenter View show to the speaker?', 'ข้อมูลติดต่อลูกค้า', 'The customer contact details', false, 'มุมมองผู้นำเสนอแสดงบันทึกและสไลด์ต่อไปสำหรับผู้บรรยาย ขณะที่ผู้ฟังเห็นสไลด์เท่านั้น', 'Presenter View shows the notes and the next slide to the speaker while the audience sees only the slide.', 'ทบทวนบทเรียนที่ 2', 'Review lesson 2'),
  ('chapter-09', 4, 'a', 'ทำไมต้องซ้อมกับนาฬิกาจับเวลา', 'Why should you rehearse with a timer?', 'เพื่อเสร็จตรงเวลา', 'To finish on schedule', true, 'ซ้อมกับนาฬิกาจับเวลาช่วยคุณเสร็จตรงเวลาและตัดจุดที่ไม่จำเป็น', 'Rehearsing with a timer helps you finish on schedule and cut points that are not necessary.', 'ทบทวนบทเรียนที่ 2', 'Review lesson 2'),
  ('chapter-09', 4, 'b', 'ทำไมต้องซ้อมกับนาฬิกาจับเวลา', 'Why should you rehearse with a timer?', 'เพื่อเพิ่มหลายสไลด์', 'To add many slides', false, 'ซ้อมกับนาฬิกาจับเวลาช่วยคุณเสร็จตรงเวลาและตัดจุดที่ไม่จำเป็น', 'Rehearsing with a timer helps you finish on schedule and cut points that are not necessary.', 'ทบทวนบทเรียนที่ 2', 'Review lesson 2'),
  ('chapter-09', 4, 'c', 'ทำไมต้องซ้อมกับนาฬิกาจับเวลา', 'Why should you rehearse with a timer?', 'เพื่อลบเอกสาร', 'To delete the documents', false, 'ซ้อมกับนาฬิกาจับเวลาช่วยคุณเสร็จตรงเวลาและตัดจุดที่ไม่จำเป็น', 'Rehearsing with a timer helps you finish on schedule and cut points that are not necessary.', 'ทบทวนบทเรียนที่ 2', 'Review lesson 2'),
  ('chapter-09', 5, 'a', 'ผลลัพธ์ใดเหมาะสมกับการแชร์ไฟล์อ่านอย่างเดียว', 'Which output suits sharing a read-only file?', 'ส่งออก PDF', 'Export to PDF', true, 'PDF เปิดภายหลังได้และแก้ไขไม่ได้ ไฟล์สไลด์ที่แก้ไขได้สำหรับผู้บรรยาย', 'A PDF can be opened later and cannot be edited; the editable slide file is for the speaker.', 'ทบทวนบทเรียนที่ 3', 'Review lesson 3'),
  ('chapter-09', 5, 'b', 'ผลลัพธ์ใดเหมาะสมกับการแชร์ไฟล์อ่านอย่างเดียว', 'Which output suits sharing a read-only file?', 'ไฟล์สไลด์ที่แก้ไขได้', 'The editable slide file', false, 'PDF เปิดภายหลังได้และแก้ไขไม่ได้ ไฟล์สไลด์ที่แก้ไขได้สำหรับผู้บรรยาย', 'A PDF can be opened later and cannot be edited; the editable slide file is for the speaker.', 'ทบทวนบทเรียนที่ 3', 'Review lesson 3'),
  ('chapter-09', 5, 'c', 'ผลลัพธ์ใดเหมาะสมกับการแชร์ไฟล์อ่านอย่างเดียว', 'Which output suits sharing a read-only file?', 'อุปกรณ์', 'The equipment', false, 'PDF เปิดภายหลังได้และแก้ไขไม่ได้ ไฟล์สไลด์ที่แก้ไขได้สำหรับผู้บรรยาย', 'A PDF can be opened later and cannot be edited; the editable slide file is for the speaker.', 'ทบทวนบทเรียนที่ 3', 'Review lesson 3'),
  ('chapter-09', 6, 'a', 'ในสถานการณ์การนำเสนอออนไลน์ควรทำอะไรก่อนประชุม', 'In the online pitch, what should you do before the meeting?', 'เตรียมเอกสาร ซ้อมและแชร์ลิงก์', 'Prepare the documents, rehearse, and share the link', true, 'ก่อนประชุมควรเตรียมเอกสาร ซ้อมกับนาฬิกาจับเวลาและแชร์ลิงก์สำหรับคนที่เข้าร่วมออนไลน์', 'Before the meeting you should prepare the documents, rehearse with a timer, and share the link for those who join online.', 'ทบทวนบทเรียนที่ 3', 'Review lesson 3'),
  ('chapter-09', 6, 'b', 'ในสถานการณ์การนำเสนอออนไลน์ควรทำอะไรก่อนประชุม', 'In the online pitch, what should you do before the meeting?', 'ลบไฟล์ทั้งหมด', 'Delete all the files', false, 'ก่อนประชุมควรเตรียมเอกสาร ซ้อมกับนาฬิกาจับเวลาและแชร์ลิงก์สำหรับคนที่เข้าร่วมออนไลน์', 'Before the meeting you should prepare the documents, rehearse with a timer, and share the link for those who join online.', 'ทบทวนบทเรียนที่ 3', 'Review lesson 3'),
  ('chapter-09', 6, 'c', 'ในสถานการณ์การนำเสนอออนไลน์ควรทำอะไรก่อนประชุม', 'In the online pitch, what should you do before the meeting?', 'พิมพ์ทุกสไลด์', 'Print every slide', false, 'ก่อนประชุมควรเตรียมเอกสาร ซ้อมกับนาฬิกาจับเวลาและแชร์ลิงก์สำหรับคนที่เข้าร่วมออนไลน์', 'Before the meeting you should prepare the documents, rehearse with a timer, and share the link for those who join online.', 'ทบทวนบทเรียนที่ 3', 'Review lesson 3')
on conflict (module_key, order_index, option_key) do update set prompt_th = excluded.prompt_th, prompt_en = excluded.prompt_en, option_th = excluded.option_th, option_en = excluded.option_en, is_correct = excluded.is_correct, explanation_th = excluded.explanation_th, explanation_en = excluded.explanation_en, review_th = excluded.review_th, review_en = excluded.review_en;

-- Parallel 10+10 pre/post banks over the same 10 objective keys.
insert into public.ppg_chapter_test_questions
  (chapter_key, phase, form, order_index, objective_key, option_key, prompt_th, prompt_en, option_th, option_en, is_correct)
values
  ('chapter-09', 'pre', 'a', 1, 'support_docs_purpose', 'a', 'ทำไมต้องเตรียมเอกสารประกอบ', 'Why prepare supporting documents?', 'ผู้ฟังตามและเก็บประเด็นหลักภายหลังได้', 'So the audience can follow and keep the main points later', true),
  ('chapter-09', 'pre', 'a', 1, 'support_docs_purpose', 'b', 'ทำไมต้องเตรียมเอกสารประกอบ', 'Why prepare supporting documents?', 'เพิ่มหลายสไลด์', 'To add many more slides', false),
  ('chapter-09', 'pre', 'a', 1, 'support_docs_purpose', 'c', 'ทำไมต้องเตรียมเอกสารประกอบ', 'Why prepare supporting documents?', 'ลบคำถามทั้งหมด', 'To delete all the questions', false),
  ('chapter-09', 'pre', 'a', 2, 'support_docs_types', 'a', 'ข้อใดคือเอกสารประกอบ', 'Which item is a supporting document?', 'เอกสารแจก', 'A handout', true),
  ('chapter-09', 'pre', 'a', 2, 'support_docs_types', 'b', 'ข้อใดคือเอกสารประกอบ', 'Which item is a supporting document?', 'พื้นหลังสไลด์', 'The slide background', false),
  ('chapter-09', 'pre', 'a', 2, 'support_docs_types', 'c', 'ข้อใดคือเอกสารประกอบ', 'Which item is a supporting document?', 'อุปกรณ์สำหรับนำเสนอ', 'The presenting equipment', false),
  ('chapter-09', 'pre', 'a', 3, 'handout_content', 'a', 'เอกสารแจกควรมีอะไร', 'What should a handout contain?', 'ประเด็นหลัก ข้อมูลและพื้นที่จดบันทึก', 'Main points, data, and space for notes', true),
  ('chapter-09', 'pre', 'a', 3, 'handout_content', 'b', 'เอกสารแจกควรมีอะไร', 'What should a handout contain?', 'ทุกคำของผู้บรรยาย', 'Every word the speaker says', false),
  ('chapter-09', 'pre', 'a', 3, 'handout_content', 'c', 'เอกสารแจกควรมีอะไร', 'What should a handout contain?', 'รหัสผ่านของไฟล์', 'The file password', false),
  ('chapter-09', 'pre', 'a', 4, 'handout_export', 'a', 'ส่งออกเอกสารแจกสำหรับพิมพ์อย่างไร', 'How do you produce a handout for printing?', 'ส่งออก PDF จากโปรแกรมการนำเสนอ', 'Export a PDF from the presentation program', true),
  ('chapter-09', 'pre', 'a', 4, 'handout_export', 'b', 'ส่งออกเอกสารแจกสำหรับพิมพ์อย่างไร', 'How do you produce a handout for printing?', 'ลบสไลด์ทั้งหมด', 'Delete all the slides', false),
  ('chapter-09', 'pre', 'a', 4, 'handout_export', 'c', 'ส่งออกเอกสารแจกสำหรับพิมพ์อย่างไร', 'How do you produce a handout for printing?', 'แทรกวิดีโอ', 'Insert a video', false),
  ('chapter-09', 'pre', 'a', 5, 'deliver_setup', 'a', 'ก่อนนำเสนอควรตรวจอะไร', 'Before presenting, what should you check?', 'อุปกรณ์และไฟล์', 'The equipment and the file', true),
  ('chapter-09', 'pre', 'a', 5, 'deliver_setup', 'b', 'ก่อนนำเสนอควรตรวจอะไร', 'Before presenting, what should you check?', 'ราคาของสินค้า', 'The product price', false),
  ('chapter-09', 'pre', 'a', 5, 'deliver_setup', 'c', 'ก่อนนำเสนอควรตรวจอะไร', 'Before presenting, what should you check?', 'ข้อมูลติดต่อลูกค้า', 'The customer contact details', false),
  ('chapter-09', 'pre', 'a', 6, 'rehearsal', 'a', 'ทำไมควรซ้อมก่อนนำเสนอ', 'Why should you rehearse before presenting?', 'เพื่อควบคุมเวลาและหาปัญหา', 'To control the time and find problems', true),
  ('chapter-09', 'pre', 'a', 6, 'rehearsal', 'b', 'ทำไมควรซ้อมก่อนนำเสนอ', 'Why should you rehearse before presenting?', 'เพื่อทำให้สไลด์ต่างกันทุกครั้ง', 'To make every slide different', false),
  ('chapter-09', 'pre', 'a', 6, 'rehearsal', 'c', 'ทำไมควรซ้อมก่อนนำเสนอ', 'Why should you rehearse before presenting?', 'เพื่อลบผู้ฟัง', 'To delete the audience', false),
  ('chapter-09', 'pre', 'a', 7, 'timing', 'a', 'อะไรช่วยคุณเสร็จตรงเวลา', 'What helps you finish on schedule?', 'ซ้อมกับนาฬิกาจับเวลาและตรวจจังหวะ', 'Rehearse with a timer and check the pace', true),
  ('chapter-09', 'pre', 'a', 7, 'timing', 'b', 'อะไรช่วยคุณเสร็จตรงเวลา', 'What helps you finish on schedule?', 'เพิ่มหลายสไลด์', 'Keep adding more slides', false),
  ('chapter-09', 'pre', 'a', 7, 'timing', 'c', 'อะไรช่วยคุณเสร็จตรงเวลา', 'What helps you finish on schedule?', 'พูดเร็วเสมอ', 'Always speak fast', false),
  ('chapter-09', 'pre', 'a', 8, 'delivery_skills', 'a', 'ขณะที่นำเสนอควรทำอะไร', 'What should you do while delivering?', 'สบตากับผู้ฟังและพูดด้วยจังหวะสม่ำเสมอ', 'Keep eye contact and speak at a steady pace', true),
  ('chapter-09', 'pre', 'a', 8, 'delivery_skills', 'b', 'ขณะที่นำเสนอควรทำอะไร', 'What should you do while delivering?', 'อ่านทุกคำจากสไลด์', 'Read every word from the slide', false),
  ('chapter-09', 'pre', 'a', 8, 'delivery_skills', 'c', 'ขณะที่นำเสนอควรทำอะไร', 'What should you do while delivering?', 'ดูนาฬิกาจับเวลาเท่านั้น', 'Only watch the timer', false),
  ('chapter-09', 'pre', 'a', 9, 'digital_apply', 'a', 'สำหรับผู้ฟังออนไลน์ควรเตรียมอะไร', 'For an online audience, what should you prepare?', 'ลิงก์และเอกสารแจก PDF', 'A link and a PDF handout', true),
  ('chapter-09', 'pre', 'a', 9, 'digital_apply', 'b', 'สำหรับผู้ฟังออนไลน์ควรเตรียมอะไร', 'For an online audience, what should you prepare?', 'อุปกรณ์สำหรับพิมพ์', 'Equipment for printing', false),
  ('chapter-09', 'pre', 'a', 9, 'digital_apply', 'c', 'สำหรับผู้ฟังออนไลน์ควรเตรียมอะไร', 'For an online audience, what should you prepare?', 'พื้นหลังสำหรับพิมพ์', 'A background for printing', false),
  ('chapter-09', 'pre', 'a', 10, 'final_scenario', 'a', 'สถานการณ์: การนำเสนอแพ็กเกจบริการออนไลน์ ก่อนประชุมควรเตรียมอะไร', 'Applied scenario: before an online service pitch, what do you prepare?', 'แผนภูมิ เอกสารแจก PDF ลิงก์และซ้อม', 'A chart, a PDF handout, a link, and rehearsal', true),
  ('chapter-09', 'pre', 'a', 10, 'final_scenario', 'b', 'สถานการณ์: การนำเสนอแพ็กเกจบริการออนไลน์ ก่อนประชุมควรเตรียมอะไร', 'Applied scenario: before an online service pitch, what do you prepare?', 'ลบไฟล์และจบ', 'Delete the file and stop', false),
  ('chapter-09', 'pre', 'a', 10, 'final_scenario', 'c', 'สถานการณ์: การนำเสนอแพ็กเกจบริการออนไลน์ ก่อนประชุมควรเตรียมอะไร', 'Applied scenario: before an online service pitch, what do you prepare?', 'พิมพ์ทุกสไลด์เท่านั้น', 'Print every slide only', false),
  ('chapter-09', 'post', 'b', 1, 'support_docs_purpose', 'a', 'ประโยชน์หลักของเอกสารประกอบคืออะไร', 'What is the main benefit of supporting documents?', 'ผู้ฟังทบทวนประเด็นหลักภายหลังได้', 'The audience can review the main points later', true),
  ('chapter-09', 'post', 'b', 1, 'support_docs_purpose', 'b', 'ประโยชน์หลักของเอกสารประกอบคืออะไร', 'What is the main benefit of supporting documents?', 'ทำให้นำเสนอเร็ว', 'They make the presentation faster', false),
  ('chapter-09', 'post', 'b', 1, 'support_docs_purpose', 'c', 'ประโยชน์หลักของเอกสารประกอบคืออะไร', 'What is the main benefit of supporting documents?', 'เพิ่มจำนวนสไลด์', 'They increase the number of slides', false),
  ('chapter-09', 'post', 'b', 2, 'support_docs_types', 'a', 'ข้อใดไม่ใช่เอกสารประกอบ', 'Which item is NOT a supporting document?', 'อุปกรณ์สำหรับนำเสนอ', 'The presenting equipment', true),
  ('chapter-09', 'post', 'b', 2, 'support_docs_types', 'b', 'ข้อใดไม่ใช่เอกสารประกอบ', 'Which item is NOT a supporting document?', 'เอกสารแจก', 'A handout', false),
  ('chapter-09', 'post', 'b', 2, 'support_docs_types', 'c', 'ข้อใดไม่ใช่เอกสารประกอบ', 'Which item is NOT a supporting document?', 'รายงาน', 'A report', false),
  ('chapter-09', 'post', 'b', 3, 'handout_content', 'a', 'เอกสารแจกไม่ควรมีอะไร', 'What should a handout avoid?', 'คัดลอกทุกสไลด์', 'Copying every slide', true),
  ('chapter-09', 'post', 'b', 3, 'handout_content', 'b', 'เอกสารแจกไม่ควรมีอะไร', 'What should a handout avoid?', 'ประเด็นหลัก', 'The main points', false),
  ('chapter-09', 'post', 'b', 3, 'handout_content', 'c', 'เอกสารแจกไม่ควรมีอะไร', 'What should a handout avoid?', 'พื้นที่จดบันทึก', 'Space for notes', false),
  ('chapter-09', 'post', 'b', 4, 'handout_export', 'a', 'ผลลัพธ์ใดควรให้ผู้ฟังที่อ่านไฟล์ภายหลัง', 'Which output should you give an audience that will read the file later?', 'ส่งออก PDF', 'An exported PDF', true),
  ('chapter-09', 'post', 'b', 4, 'handout_export', 'b', 'ผลลัพธ์ใดควรให้ผู้ฟังที่อ่านไฟล์ภายหลัง', 'Which output should you give an audience that will read the file later?', 'ไฟล์สไลด์ที่แก้ไขได้', 'The editable slide file', false),
  ('chapter-09', 'post', 'b', 4, 'handout_export', 'c', 'ผลลัพธ์ใดควรให้ผู้ฟังที่อ่านไฟล์ภายหลัง', 'Which output should you give an audience that will read the file later?', 'บันทึกย่อ', 'The notes page', false),
  ('chapter-09', 'post', 'b', 5, 'deliver_setup', 'a', 'ก่อนผู้ฟังเข้าร่วมประชุมควรเปิดอะไร', 'Before the audience joins the meeting, what should you open?', 'ไฟล์และมุมมองผู้นำเสนอ', 'The file and Presenter View', true),
  ('chapter-09', 'post', 'b', 5, 'deliver_setup', 'b', 'ก่อนผู้ฟังเข้าร่วมประชุมควรเปิดอะไร', 'Before the audience joins the meeting, what should you open?', 'ราคาของสินค้า', 'The product price', false),
  ('chapter-09', 'post', 'b', 5, 'deliver_setup', 'c', 'ก่อนผู้ฟังเข้าร่วมประชุมควรเปิดอะไร', 'Before the audience joins the meeting, what should you open?', 'รหัสผ่านหใม่', 'A new password', false),
  ('chapter-09', 'post', 'b', 6, 'rehearsal', 'a', 'ควรซ้อมอย่างไร', 'How should you rehearse?', 'ออกเสียงกับนาฬิกาจับเวลา', 'Out loud, with a timer', true),
  ('chapter-09', 'post', 'b', 6, 'rehearsal', 'b', 'ควรซ้อมอย่างไร', 'How should you rehearse?', 'อ่านเท่านั้น', 'By reading only', false),
  ('chapter-09', 'post', 'b', 6, 'rehearsal', 'c', 'ควรซ้อมอย่างไร', 'How should you rehearse?', 'เปิด Slide Show เท่านั้น', 'By opening Slide Show only', false),
  ('chapter-09', 'post', 'b', 7, 'timing', 'a', 'ถ้าเวลาสายควรทำอะไร', 'If you are running late, what should you do?', 'ตัดจุดที่ไม่จำเป็นและเก็บประเด็นหลัก', 'Cut points that are not necessary and keep the main points', true),
  ('chapter-09', 'post', 'b', 7, 'timing', 'b', 'ถ้าเวลาสายควรทำอะไร', 'If you are running late, what should you do?', 'เพิ่มสไลด์หลาย', 'Add more slides', false),
  ('chapter-09', 'post', 'b', 7, 'timing', 'c', 'ถ้าเวลาสายควรทำอะไร', 'If you are running late, what should you do?', 'พูดช้าลงทุกคำ', 'Slow down on every word', false),
  ('chapter-09', 'post', 'b', 8, 'delivery_skills', 'a', 'อะไรช่วยให้ผู้ฟังอยู่กับคุณ', 'What helps keep the audience with you?', 'หยุดที่ประเด็นหลักและดูจังหวะ', 'Pausing at the main points and watching the pace', true),
  ('chapter-09', 'post', 'b', 8, 'delivery_skills', 'b', 'อะไรช่วยให้ผู้ฟังอยู่กับคุณ', 'What helps keep the audience with you?', 'อ่านทุกคำเร็ว', 'Reading every word fast', false),
  ('chapter-09', 'post', 'b', 8, 'delivery_skills', 'c', 'อะไรช่วยให้ผู้ฟังอยู่กับคุณ', 'What helps keep the audience with you?', 'ไม่สบตา', 'Avoiding eye contact', false),
  ('chapter-09', 'post', 'b', 9, 'digital_apply', 'a', 'แชร์ลิงก์ทำให้ผู้ฟังทำอะไร', 'What does sharing a link let the audience do?', 'เปิดไฟล์และเข้าร่วมออนไลน์ได้', 'Open the file and join online', true),
  ('chapter-09', 'post', 'b', 9, 'digital_apply', 'b', 'แชร์ลิงก์ทำให้ผู้ฟังทำอะไร', 'What does sharing a link let the audience do?', 'แก้ไขไฟล์ผู้บรรยายเท่านั้น', 'Edit the file, for the speaker only', false),
  ('chapter-09', 'post', 'b', 9, 'digital_apply', 'c', 'แชร์ลิงก์ทำให้ผู้ฟังทำอะไร', 'What does sharing a link let the audience do?', 'พิมพ์อุปกรณ์', 'Print the equipment', false),
  ('chapter-09', 'post', 'b', 10, 'final_scenario', 'a', 'หลังนำเสนอแพ็กเกจบริการออนไลน์ควรติดตามอย่างไร', 'Applied scenario: after the online pitch, what is the right follow-up?', 'ส่งเอกสารแจก PDF และข้อมูลติดต่อ', 'Send the PDF handout and contact details', true),
  ('chapter-09', 'post', 'b', 10, 'final_scenario', 'b', 'หลังนำเสนอแพ็กเกจบริการออนไลน์ควรติดตามอย่างไร', 'Applied scenario: after the online pitch, what is the right follow-up?', 'ลบไฟล์และจบ', 'Delete the file and stop', false),
  ('chapter-09', 'post', 'b', 10, 'final_scenario', 'c', 'หลังนำเสนอแพ็กเกจบริการออนไลน์ควรติดตามอย่างไร', 'Applied scenario: after the online pitch, what is the right follow-up?', 'พิมพ์ทุกสไลด์เท่านั้น', 'Print every slide only', false)
on conflict (chapter_key, phase, form, order_index, option_key) do update set objective_key = excluded.objective_key, prompt_th = excluded.prompt_th, prompt_en = excluded.prompt_en, option_th = excluded.option_th, option_en = excluded.option_en, is_correct = excluded.is_correct;
