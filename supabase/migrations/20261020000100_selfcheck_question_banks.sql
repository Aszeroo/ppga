-- PPGA #60: real Self-Check question banks for ALL 13 published Lessons.
--
-- Only Module 1's two Lessons had authored questions (20260926000700, and
-- that copy was corrupted); 20260930000200 completed Modules 2-10 with
-- provisional transliterated copy. This migration re-authors the
-- whole bank from each Lesson's own body/what_next/why copy (the repaired
-- Thai of 20261019000200 is the wording source): 13 Lessons x 2 questions
-- x 3 options (a/b/c), exactly one is_correct per question, bilingual,
-- natural Thai mirrored by the English.
--
-- ADR-0003: the applied seeds stay immutable; this is the versioned
-- replacement. Idempotent: the scoped DELETE + INSERT re-run converges on
-- the same 78 rows (and drops stale rows from the old banks). No function,
-- threshold, XP value (+50, once) or badge rule changes; the answer key
-- stays server-side (`is_correct` never rides the read RPC). The correct
-- option is keyed 'a' on every question, preserving the existing seam and
-- e2e answer keys (`{"1":"a","2":"a"}`).

delete from public.ppg_self_check_questions
 where lesson_key in (
   'module-01-lesson-01',
   'module-01-lesson-02',
   'module-02-lesson-01',
   'module-03-lesson-01',
   'module-03-lesson-02',
   'module-04-lesson-01',
   'module-05-lesson-01',
   'module-06-lesson-01',
   'module-07-lesson-01',
   'module-08-lesson-01',
   'module-09-lesson-01',
   'module-10-lesson-01',
   'module-10-lesson-02'
 );

insert into public.ppg_self_check_questions
  (lesson_key, order_index, option_key, prompt_th, prompt_en, option_th, option_en, is_correct)
values
  -- module-01-lesson-01 Q1
  ('module-01-lesson-01', 1, 'a', 'ในบทเรียนนี้หลังจากเปิด PowerPoint แล้วขั้นแรกเพื่อเริ่มงานนำเสนอใหม่คืออะไร', 'In this lesson, after opening PowerPoint, what is the first step to start a new presentation?', 'คลิก New แล้วเลือก Blank', 'Click New, then choose Blank', true),
  ('module-01-lesson-01', 1, 'b', 'ในบทเรียนนี้หลังจากเปิด PowerPoint แล้วขั้นแรกเพื่อเริ่มงานนำเสนอใหม่คืออะไร', 'In this lesson, after opening PowerPoint, what is the first step to start a new presentation?', 'คลิก Print แล้วเลือก Blank', 'Click Print, then choose Blank', false),
  ('module-01-lesson-01', 1, 'c', 'ในบทเรียนนี้หลังจากเปิด PowerPoint แล้วขั้นแรกเพื่อเริ่มงานนำเสนอใหม่คืออะไร', 'In this lesson, after opening PowerPoint, what is the first step to start a new presentation?', 'ปิดโปรแกรมแล้วเปิดใหม่', 'Close the app and open it again', false),
  -- module-01-lesson-01 Q2
  ('module-01-lesson-01', 2, 'a', 'เหตุใดบทเรียนนี้จึงเริ่มจากการเปิดโปรแกรม', 'Why does this lesson start with opening the app?', 'การเปิดโปรแกรมเป็นขั้นแรกที่ทุกทักษะต่อยอด', 'Opening the app is the first step every later skill builds on', true),
  ('module-01-lesson-01', 2, 'b', 'เหตุใดบทเรียนนี้จึงเริ่มจากการเปิดโปรแกรม', 'Why does this lesson start with opening the app?', 'ต้องปิดโปรแกรมก่อนใช้งานทุกครั้ง', 'The app must be closed before every use', false),
  ('module-01-lesson-01', 2, 'c', 'เหตุใดบทเรียนนี้จึงเริ่มจากการเปิดโปรแกรม', 'Why does this lesson start with opening the app?', 'การปิดโปรแกรมช่วยประหยัดแบตเตอรี่', 'Closing the app saves battery', false),
  -- module-01-lesson-02 Q1
  ('module-01-lesson-02', 1, 'a', 'มุมมองใดแสดงรายการสไลด์ข้างสไลด์ที่กำลังแก้ไข', 'Which view shows the slide list beside the slide you are editing?', 'มุมมองปกติ', 'The normal view', true),
  ('module-01-lesson-02', 1, 'b', 'มุมมองใดแสดงรายการสไลด์ข้างสไลด์ที่กำลังแก้ไข', 'Which view shows the slide list beside the slide you are editing?', 'ตัวอย่างก่อนพิมพ์', 'The print preview', false),
  ('module-01-lesson-02', 1, 'c', 'มุมมองใดแสดงรายการสไลด์ข้างสไลด์ที่กำลังแก้ไข', 'Which view shows the slide list beside the slide you are editing?', 'หน้าต่างจัดการไฟล์', 'The file manager window', false),
  -- module-01-lesson-02 Q2
  ('module-01-lesson-02', 2, 'a', 'เมื่อจบบทเรียนนี้แล้วบทเรียนถัดไปคือเรื่องใด', 'After this lesson, what is the next lesson about?', 'การสร้างสไลด์', 'Creating slides', true),
  ('module-01-lesson-02', 2, 'b', 'เมื่อจบบทเรียนนี้แล้วบทเรียนถัดไปคือเรื่องใด', 'After this lesson, what is the next lesson about?', 'การเผยแพร่เป็นไฟล์ PDF', 'Publishing to a PDF file', false),
  ('module-01-lesson-02', 2, 'c', 'เมื่อจบบทเรียนนี้แล้วบทเรียนถัดไปคือเรื่องใด', 'After this lesson, what is the next lesson about?', 'โครงงานสุดท้าย', 'The Final Project', false),
  -- module-02-lesson-01 Q1
  ('module-02-lesson-01', 1, 'a', 'ในบทเรียนนี้เราเพิ่มสไลด์ได้อย่างไร', 'In this lesson, how do you add a slide?', 'คลิก New บนแท็บ Home', 'Click New on the Home tab', true),
  ('module-02-lesson-01', 1, 'b', 'ในบทเรียนนี้เราเพิ่มสไลด์ได้อย่างไร', 'In this lesson, how do you add a slide?', 'กดปุ่มสลับภาษา', 'Press the language-switch key', false),
  ('module-02-lesson-01', 1, 'c', 'ในบทเรียนนี้เราเพิ่มสไลด์ได้อย่างไร', 'In this lesson, how do you add a slide?', 'ปิดโปรแกรมแล้วเปิดใหม่', 'Close the app and open it again', false),
  -- module-02-lesson-01 Q2
  ('module-02-lesson-01', 2, 'a', 'บทเรียนนี้ให้เลือกสไลด์ชนิดใดบ้าง', 'Which slide types does this lesson let you choose?', 'สไลด์มาตรฐานและสไลด์แนวตั้ง', 'The standard slide and the vertical slide', true),
  ('module-02-lesson-01', 2, 'b', 'บทเรียนนี้ให้เลือกสไลด์ชนิดใดบ้าง', 'Which slide types does this lesson let you choose?', 'สไลด์ขาวดำเท่านั้น', 'Only the black-and-white slide', false),
  ('module-02-lesson-01', 2, 'c', 'บทเรียนนี้ให้เลือกสไลด์ชนิดใดบ้าง', 'Which slide types does this lesson let you choose?', 'สไลด์กระดาษพิมพ์เท่านั้น', 'Only the printed-paper slide', false),
  -- module-03-lesson-01 Q1
  ('module-03-lesson-01', 1, 'a', 'ต้องคลิกที่ใดก่อนพิมพ์ข้อความลงสไลด์', 'Where do you click before typing text onto a slide?', 'ในตัวแทนข้อความบนเลย์เอาต์', 'Inside the content box on the layout', true),
  ('module-03-lesson-01', 1, 'b', 'ต้องคลิกที่ใดก่อนพิมพ์ข้อความลงสไลด์', 'Where do you click before typing text onto a slide?', 'บนไอคอนบันทึก', 'On the save icon', false),
  ('module-03-lesson-01', 1, 'c', 'ต้องคลิกที่ใดก่อนพิมพ์ข้อความลงสไลด์', 'Where do you click before typing text onto a slide?', 'บนปุ่มปิดหน้าต่าง', 'On the button that closes the window', false),
  -- module-03-lesson-01 Q2
  ('module-03-lesson-01', 2, 'a', 'ในกล่องข้อความปุ่ม Tab แล้ว Enter ทำหน้าที่ใด', 'Inside a text box, what do the Tab and Enter keys do?', 'ย้ายข้อความแล้วขึ้นบรรทัดใหม่', 'Move the text and start a new line', true),
  ('module-03-lesson-01', 2, 'b', 'ในกล่องข้อความปุ่ม Tab แล้ว Enter ทำหน้าที่ใด', 'Inside a text box, what do the Tab and Enter keys do?', 'ปิดโปรแกรมทันที', 'Close the program at once', false),
  ('module-03-lesson-01', 2, 'c', 'ในกล่องข้อความปุ่ม Tab แล้ว Enter ทำหน้าที่ใด', 'Inside a text box, what do the Tab and Enter keys do?', 'ลบสไลด์ทั้งชุด', 'Delete every slide in the deck', false),
  -- module-03-lesson-02 Q1
  ('module-03-lesson-02', 1, 'a', 'เราเปลี่ยนแบบอักษรขนาดและการจัดตำแหน่งบนแท็บใด', 'On which tab do you change the font, size, and alignment?', 'แท็บ Home', 'The Home tab', true),
  ('module-03-lesson-02', 1, 'b', 'เราเปลี่ยนแบบอักษรขนาดและการจัดตำแหน่งบนแท็บใด', 'On which tab do you change the font, size, and alignment?', 'แท็บ View', 'The View tab', false),
  ('module-03-lesson-02', 1, 'c', 'เราเปลี่ยนแบบอักษรขนาดและการจัดตำแหน่งบนแท็บใด', 'On which tab do you change the font, size, and alignment?', 'เมนู Help', 'The Help menu', false),
  -- module-03-lesson-02 Q2
  ('module-03-lesson-02', 2, 'a', 'เหตุใดบทเรียนนี้จึงเน้นการเลือกแบบอักษรสำหรับภาษา Thai', 'Why does this lesson stress choosing the right font for Thai text?', 'แบบอักษรที่เลือกส่งผลต่อการอ่านภาษา Thai', 'The font you pick affects how readable Thai is', true),
  ('module-03-lesson-02', 2, 'b', 'เหตุใดบทเรียนนี้จึงเน้นการเลือกแบบอักษรสำหรับภาษา Thai', 'Why does this lesson stress choosing the right font for Thai text?', 'ภาษา Thai พิมพ์ใน PowerPoint ไม่ได้', 'Thai cannot be typed in PowerPoint', false),
  ('module-03-lesson-02', 2, 'c', 'เหตุใดบทเรียนนี้จึงเน้นการเลือกแบบอักษรสำหรับภาษา Thai', 'Why does this lesson stress choosing the right font for Thai text?', 'ตัวใหญ่ขึ้นจะใส่ข้อความได้มากขึ้นเสมอ', 'A larger font always fits more text', false),
  -- module-04-lesson-01 Q1
  ('module-04-lesson-01', 1, 'a', 'ตัวแทนข้อความในบทเรียนนี้คือสิ่งใด', 'What is a content box in this lesson?', 'ช่องที่เลย์เอาต์กั้นไว้สำหรับเนื้อหา', 'The box the layout reserves for your content', true),
  ('module-04-lesson-01', 1, 'b', 'ตัวแทนข้อความในบทเรียนนี้คือสิ่งใด', 'What is a content box in this lesson?', 'สไลด์ที่ถูกลบโดยบังเอิญ', 'A slide deleted by accident', false),
  ('module-04-lesson-01', 1, 'c', 'ตัวแทนข้อความในบทเรียนนี้คือสิ่งใด', 'What is a content box in this lesson?', 'ชื่อไฟล์ที่แสดงบนดิสก์', 'The file name shown on disk', false),
  -- module-04-lesson-01 Q2
  ('module-04-lesson-01', 2, 'a', 'ตามบทเรียนนี้สิ่งใดมาก่อนเอฟเฟกต์', 'According to this lesson, what comes before the effects?', 'เลย์เอาต์มาก่อนเอฟเฟกต์', 'The layout comes before the effects', true),
  ('module-04-lesson-01', 2, 'b', 'ตามบทเรียนนี้สิ่งใดมาก่อนเอฟเฟกต์', 'According to this lesson, what comes before the effects?', 'เครื่องพิมพ์มาก่อนเลย์เอาต์', 'The printer comes before the layout', false),
  ('module-04-lesson-01', 2, 'c', 'ตามบทเรียนนี้สิ่งใดมาก่อนเอฟเฟกต์', 'According to this lesson, what comes before the effects?', 'ไม่ต้องเรียงลำดับสิ่งใด', 'Nothing needs any order', false),
  -- module-05-lesson-01 Q1
  ('module-05-lesson-01', 1, 'a', 'บทเรียนนี้ได้สีและเอฟเฟกต์ข้อความจากที่ใด', 'Where does the lesson get text color and effects?', 'จากเมนูแบบอักษรบนแท็บ Home', 'From the font menu on the Home tab', true),
  ('module-05-lesson-01', 1, 'b', 'บทเรียนนี้ได้สีและเอฟเฟกต์ข้อความจากที่ใด', 'Where does the lesson get text color and effects?', 'จากไม้บรรทัดขอบหน้า', 'From the page-margin ruler', false),
  ('module-05-lesson-01', 1, 'c', 'บทเรียนนี้ได้สีและเอฟเฟกต์ข้อความจากที่ใด', 'Where does the lesson get text color and effects?', 'จากกล่องตรวจคำสะกด', 'From the spell-check dialog', false),
  -- module-05-lesson-01 Q2
  ('module-05-lesson-01', 2, 'a', 'ลำดับที่ถูกต้องระหว่างข้อความกับเอฟเฟกต์คือข้อใด', 'What is the right order between text and effects?', 'พิมพ์ข้อความก่อนแล้วจึงใส่เอฟเฟกต์', 'Type the text first, then apply the effects', true),
  ('module-05-lesson-01', 2, 'b', 'ลำดับที่ถูกต้องระหว่างข้อความกับเอฟเฟกต์คือข้อใด', 'What is the right order between text and effects?', 'ใส่เอฟเฟกต์ก่อนเปิดโปรแกรม', 'Apply effects before opening the app', false),
  ('module-05-lesson-01', 2, 'c', 'ลำดับที่ถูกต้องระหว่างข้อความกับเอฟเฟกต์คือข้อใด', 'What is the right order between text and effects?', 'ใส่เอฟเฟกต์ก่อนแล้วจึงขยายสไลด์', 'Apply effects first, then enlarge the slide', false),
  -- module-06-lesson-01 Q1
  ('module-06-lesson-01', 1, 'a', 'บทเรียนนี้สร้างรูปร่างจากแท็บใด', 'From which tab does this lesson create shapes?', 'แท็บ Insert', 'The Insert tab', true),
  ('module-06-lesson-01', 1, 'b', 'บทเรียนนี้สร้างรูปร่างจากแท็บใด', 'From which tab does this lesson create shapes?', 'แท็บ File', 'The File tab', false),
  ('module-06-lesson-01', 1, 'c', 'บทเรียนนี้สร้างรูปร่างจากแท็บใด', 'From which tab does this lesson create shapes?', 'เมนู Help', 'The Help menu', false),
  -- module-06-lesson-01 Q2
  ('module-06-lesson-01', 2, 'a', 'สีเติมและเส้นกำหนดสิ่งใดของรูปร่าง', 'What do fill and line set on a shape?', 'สีด้านในและขอบของรูปร่าง', 'The inside color and the border of the shape', true),
  ('module-06-lesson-01', 2, 'b', 'สีเติมและเส้นกำหนดสิ่งใดของรูปร่าง', 'What do fill and line set on a shape?', 'หมายเลขของสไลด์ในชุด', 'The slide number in the deck', false),
  ('module-06-lesson-01', 2, 'c', 'สีเติมและเส้นกำหนดสิ่งใดของรูปร่าง', 'What do fill and line set on a shape?', 'ความสว่างของจอ', 'The brightness of the screen', false),
  -- module-07-lesson-01 Q1
  ('module-07-lesson-01', 1, 'a', 'บทเรียนนี้สร้างกราฟิก SmartArt จากที่ใด', 'Where does this lesson create a SmartArt graphic?', 'จากแท็บ Insert', 'From the Insert tab', true),
  ('module-07-lesson-01', 1, 'b', 'บทเรียนนี้สร้างกราฟิก SmartArt จากที่ใด', 'Where does this lesson create a SmartArt graphic?', 'จากกล่องสั่งพิมพ์', 'From the print dialog', false),
  ('module-07-lesson-01', 1, 'c', 'บทเรียนนี้สร้างกราฟิก SmartArt จากที่ใด', 'Where does this lesson create a SmartArt graphic?', 'จากหน้าลงชื่อเข้าใช้', 'From the sign-in screen', false),
  -- module-07-lesson-01 Q2
  ('module-07-lesson-01', 2, 'a', 'เมื่อเปลี่ยนรูปแบบ SmartArt จะเกิดอะไรขึ้น', 'What happens when you change a SmartArt layout?', 'ข้อความคงเดิมแต่กราฟิกเปลี่ยนรูปแบบใหม่', 'The text stays the same; the graphic takes a new layout', true),
  ('module-07-lesson-01', 2, 'b', 'เมื่อเปลี่ยนรูปแบบ SmartArt จะเกิดอะไรขึ้น', 'What happens when you change a SmartArt layout?', 'โปรแกรมลบตัวเองออกจากเครื่อง', 'The program uninstalls itself', false),
  ('module-07-lesson-01', 2, 'c', 'เมื่อเปลี่ยนรูปแบบ SmartArt จะเกิดอะไรขึ้น', 'What happens when you change a SmartArt layout?', 'ไฟล์สั่งพิมพ์ทันที', 'The file starts printing at once', false),
  -- module-08-lesson-01 Q1
  ('module-08-lesson-01', 1, 'a', 'บทเรียนนี้นำรูปภาพวางบนสไลด์อย่างไร', 'How does this lesson put a picture on a slide?', 'แท็บ Insert แล้วเลือก Picture', 'Insert tab, then choose Picture', true),
  ('module-08-lesson-01', 1, 'b', 'บทเรียนนี้นำรูปภาพวางบนสไลด์อย่างไร', 'How does this lesson put a picture on a slide?', 'แท็บ Review แล้วนับจำนวนคำ', 'Review tab, then count the words', false),
  ('module-08-lesson-01', 1, 'c', 'บทเรียนนี้นำรูปภาพวางบนสไลด์อย่างไร', 'How does this lesson put a picture on a slide?', 'ซูมมุมมองจนภาพปรากฏ', 'Zoom the view until the picture appears', false),
  -- module-08-lesson-01 Q2
  ('module-08-lesson-01', 2, 'a', 'การตัดข้อความล้อมรูปควบคุมสิ่งใด', 'What does text wrap control?', 'การจัดข้อความให้ล้อมรอบรูปภาพ', 'How the text flows around the picture', true),
  ('module-08-lesson-01', 2, 'b', 'การตัดข้อความล้อมรูปควบคุมสิ่งใด', 'What does text wrap control?', 'ความเร็วในการเปลี่ยนสไลด์', 'The speed of the slide transition', false),
  ('module-08-lesson-01', 2, 'c', 'การตัดข้อความล้อมรูปควบคุมสิ่งใด', 'What does text wrap control?', 'ขนาดของแบบอักษรทั้งชุด', 'The font size of the whole deck', false),
  -- module-09-lesson-01 Q1
  ('module-09-lesson-01', 1, 'a', 'บทเรียนนี้ตั้งค่าการเปลี่ยนสไลด์บนแท็บใด', 'On which tab does this lesson set the slide transition?', 'แท็บ Slide Show', 'The Slide Show tab', true),
  ('module-09-lesson-01', 1, 'b', 'บทเรียนนี้ตั้งค่าการเปลี่ยนสไลด์บนแท็บใด', 'On which tab does this lesson set the slide transition?', 'แท็บ Insert', 'The Insert tab', false),
  ('module-09-lesson-01', 1, 'c', 'บทเรียนนี้ตั้งค่าการเปลี่ยนสไลด์บนแท็บใด', 'On which tab does this lesson set the slide transition?', 'หน้าลงชื่อออก', 'The sign-out screen', false),
  -- module-09-lesson-01 Q2
  ('module-09-lesson-01', 2, 'a', 'การเลื่อนเมื่อคลิกในบทเรียนนี้หมายความว่าอย่างไร', 'What does advance on click mean in this lesson?', 'สไลด์ถัดไปจะแสดงเมื่อเราคลิก', 'The next slide appears when you click', true),
  ('module-09-lesson-01', 2, 'b', 'การเลื่อนเมื่อคลิกในบทเรียนนี้หมายความว่าอย่างไร', 'What does advance on click mean in this lesson?', 'ทุกสไลด์เปลี่ยนตามเวลาที่ตั้งไว้เอง', 'Every slide changes on its own timer', false),
  ('module-09-lesson-01', 2, 'c', 'การเลื่อนเมื่อคลิกในบทเรียนนี้หมายความว่าอย่างไร', 'What does advance on click mean in this lesson?', 'ชุดสไลด์จะบันทึกทุกครั้งที่คลิก', 'The deck saves every time you click', false),
  -- module-10-lesson-01 Q1
  ('module-10-lesson-01', 1, 'a', 'การตรวจคำสะกดและความคิดเห็นอยู่บนแท็บใด', 'On which tab are the spelling check and comments?', 'แท็บ Review', 'The Review tab', true),
  ('module-10-lesson-01', 1, 'b', 'การตรวจคำสะกดและความคิดเห็นอยู่บนแท็บใด', 'On which tab are the spelling check and comments?', 'แท็บ File', 'The File tab', false),
  ('module-10-lesson-01', 1, 'c', 'การตรวจคำสะกดและความคิดเห็นอยู่บนแท็บใด', 'On which tab are the spelling check and comments?', 'ปุ่มเปิดเครื่อง', 'The power button', false),
  -- module-10-lesson-01 Q2
  ('module-10-lesson-01', 2, 'a', 'เหตุใดต้องตรวจทานงานก่อนเผยแพร่', 'Why review the deck before publishing it?', 'งานที่เผยแพร่จะไปถึงผู้ชมจริง', 'The published deck reaches a real audience', true),
  ('module-10-lesson-01', 2, 'b', 'เหตุใดต้องตรวจทานงานก่อนเผยแพร่', 'Why review the deck before publishing it?', 'เครื่องพิมพ์จะเขียนข้อความใหม่ให้', 'The printer will rewrite the text for you', false),
  ('module-10-lesson-01', 2, 'c', 'เหตุใดต้องตรวจทานงานก่อนเผยแพร่', 'Why review the deck before publishing it?', 'การตรวจทานจะลบสไลด์ทั้งหมด', 'Reviewing deletes every slide', false),
  -- module-10-lesson-02 Q1
  ('module-10-lesson-02', 1, 'a', 'บทเรียนนี้เผยแพร่ไฟล์ PDF จากที่ใด', 'Where does this lesson publish the deck as a PDF?', 'จากแท็บ File โดยส่งออกหรือบันทึกเป็น PDF', 'From the File tab, by exporting or saving as PDF', true),
  ('module-10-lesson-02', 1, 'b', 'บทเรียนนี้เผยแพร่ไฟล์ PDF จากที่ใด', 'Where does this lesson publish the deck as a PDF?', 'จากแท็บ Insert โดยแทรกรูปภาพ', 'From the Insert tab, by inserting a picture', false),
  ('module-10-lesson-02', 1, 'c', 'บทเรียนนี้เผยแพร่ไฟล์ PDF จากที่ใด', 'Where does this lesson publish the deck as a PDF?', 'จากเครื่องตรวจคำสะกด', 'From the spell checker', false),
  -- module-10-lesson-02 Q2
  ('module-10-lesson-02', 2, 'a', 'หลังบทเรียนนี้สิ่งใดตามมาในหลักสูตร', 'After this lesson, what comes next in the course?', 'โครงงานสุดท้าย', 'The Final Project', true),
  ('module-10-lesson-02', 2, 'b', 'หลังบทเรียนนี้สิ่งใดตามมาในหลักสูตร', 'After this lesson, what comes next in the course?', 'บทเรียนแรกของโมดูล 1', 'The first lesson of Module 1', false),
  ('module-10-lesson-02', 2, 'c', 'หลังบทเรียนนี้สิ่งใดตามมาในหลักสูตร', 'After this lesson, what comes next in the course?', 'ไม่มีสิ่งใดอีกและหลักสูตรจบแล้ว', 'Nothing else, the course is over', false)
on conflict (lesson_key, order_index, option_key) do update
  set prompt_th = excluded.prompt_th,
      prompt_en = excluded.prompt_en,
      option_th = excluded.option_th,
      option_en = excluded.option_en,
      is_correct = excluded.is_correct;

comment on table public.ppg_self_check_questions is
  'PPGA #10/#60: the per-Lesson Self-Check questions (2 per published
Lesson, 3 options a|b|c, exactly one correct); bilingual prompt+option;
the answer key (is_correct) is SERVER-side only (no SELECT policy lets a
browser read a key, the check function sums it). #60 re-authored all 13
published Lesson banks; the answer key stays on option a for every
question (the seam/e2e answer-key contract).';
