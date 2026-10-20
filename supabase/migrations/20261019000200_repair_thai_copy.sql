-- #58: repair corrupted Thai copy in the seeded curriculum, rubric and badges.
-- The original seeds (20260926000600..001200) shipped Thai values damaged by an
-- encoding accident (missing letters, misplaced tone/vowel marks, untranslated
-- English inside *_th columns). Per ADR-0003 applied migrations are immutable —
-- so the repair is this ONE idempotent migration: plain UPDATEs keyed by each
-- row's natural key, with the English twin column as the meaning source.
-- Re-running is a no-op (each UPDATE sets the same value again).

-- public.ppg_skill_domains — label_th
update public.ppg_skill_domains set label_th = 'พื้นฐาน PowerPoint' where domain = 'PowerPoint Basics';
update public.ppg_skill_domains set label_th = 'การสร้างสไลด์' where domain = 'Slide Creation';
update public.ppg_skill_domains set label_th = 'การจัดรูปแบบข้อความ' where domain = 'Text Formatting';
update public.ppg_skill_domains set label_th = 'การออกแบบสไลด์และเลย์เอาต์' where domain = 'Slide Design';
update public.ppg_skill_domains set label_th = 'แบบอักษรและเอฟเฟกต์ข้อความ' where domain = 'Fonts & Text Effects';
update public.ppg_skill_domains set label_th = 'รูปร่างและเส้น' where domain = 'Shapes & Lines';
update public.ppg_skill_domains set label_th = 'กราฟิก SmartArt' where domain = 'Smart Art Graphics';
update public.ppg_skill_domains set label_th = 'การจัดวางวัตถุ' where domain = 'Object Layout';
update public.ppg_skill_domains set label_th = 'การเปลี่ยนสไลด์และแอนิเมชัน' where domain = 'Transition & Animation';
update public.ppg_skill_domains set label_th = 'การตรวจทาน การเผยแพร่ และการส่งออก' where domain = 'Review Publish Export';

-- public.ppg_courses — title_th
update public.ppg_courses set title_th = 'การสร้างงานนำเสนอ PowerPoint' where course_key = 'powerpoint-creation';

-- public.ppg_modules — title_th, summary_th
update public.ppg_modules set title_th = 'การเปิด PowerPoint และสร้างงานนำเสนอใหม่', summary_th = 'เปิด PowerPoint สร้างงานนำเสนอใหม่ และดูแผงควบคุม' where module_key = 'module-01';
update public.ppg_modules set title_th = 'การสร้างสไลด์และการเลือกชนิดสไลด์', summary_th = 'สร้าง เลือก คัดลอก และลบสไลด์ รวมถึงชนิดสไลด์มาตรฐานและแนวตั้ง' where module_key = 'module-02';
update public.ppg_modules set title_th = 'การจัดรูปแบบข้อความ', summary_th = 'พิมพ์ข้อความ กำหนดแบบอักษร ขนาด และการจัดตำแหน่งซ้าย/กลาง/ขวา' where module_key = 'module-03';
update public.ppg_modules set title_th = 'การออกแบบสไลด์และเลย์เอาต์', summary_th = 'เลย์เอาต์ ชนิดสไลด์ ตัวแทนข้อความ และการปรับเลย์เอาต์' where module_key = 'module-04';
update public.ppg_modules set title_th = 'แบบอักษรและเอฟเฟกต์ข้อความ', summary_th = 'เปลี่ยนแบบอักษร สี เส้น เงา และเอฟเฟกต์ข้อความ' where module_key = 'module-05';
update public.ppg_modules set title_th = 'รูปร่างและเส้น', summary_th = 'สร้างรูปร่าง ปรับสีเติม เส้น ขนาด คัดลอก และเลือกชนิดรูปร่าง' where module_key = 'module-06';
update public.ppg_modules set title_th = 'กราฟิก SmartArt', summary_th = 'สร้าง SmartArt เปลี่ยนรูปแบบและชนิดกราฟิก' where module_key = 'module-07';
update public.ppg_modules set title_th = 'การจัดวางวัตถุและรูปภาพ', summary_th = 'วางรูปภาพ คัดลอก จัดเลย์เอาต์ และตัดข้อความล้อมรูป' where module_key = 'module-08';
update public.ppg_modules set title_th = 'การเปลี่ยนสไลด์และแอนิเมชัน', summary_th = 'เปลี่ยนทราบซิชัน เลื่อนอัตโนมัติเมื่อคลิก และตั้งเวลาสไลด์โชว์' where module_key = 'module-09';
update public.ppg_modules set title_th = 'การตรวจทาน การเผยแพร่ และการส่งออก', summary_th = 'ตรวจทานและทำงานร่วมกัน เผยแพร่เป็น PDF พิมพ์ และแชร์' where module_key = 'module-10';

-- public.ppg_lessons — title/what_learn/why/body/what_next
update public.ppg_lessons set title_th = 'การเปิด PowerPoint', what_learn_th = 'เปิด PowerPoint และสร้างงานนำเสนอใหม่', why_th = 'การเปิดโปรแกรมเป็นขั้นแรกที่ทุกทักษะต่อยอด', body_th = 'เปิด PowerPoint คลิก Home คลิก New เลือก Blank แล้วเพิ่มสไลด์', what_next_th = 'ต่อไปคือการสลับมุมมอง' where lesson_key = 'module-01-lesson-01';
update public.ppg_lessons set title_th = 'การสลับแผงและมุมมอง', what_learn_th = 'สลับมุมมอง: ปกติ และตัวอย่าง', why_th = 'มุมมองมาก่อนขั้นออกแบบ', body_th = 'มุมมองปกติ มุมมองตัวอย่าง และมุมมองออกแบบ', what_next_th = 'ต่อไปคือการสร้างสไลด์' where lesson_key = 'module-01-lesson-02';
update public.ppg_lessons set title_th = 'การสร้างสไลด์', what_learn_th = 'สร้างสไลด์ทั้งแบบมาตรฐานและแนวตั้ง', why_th = 'สไลด์มาก่อนข้อความ', body_th = 'Home, New, Blank, Vertical แล้วเพิ่มสไลด์', what_next_th = 'ต่อไปคือการจัดรูปแบบข้อความ' where lesson_key = 'module-02-lesson-01';
update public.ppg_lessons set title_th = 'การพิมพ์ข้อความ', what_learn_th = 'พิมพ์ข้อความด้วยการคลิก แท็บ และ Enter', why_th = 'ข้อความมาก่อนการออกแบบ', body_th = 'คลิกตัวแทนข้อความ แล้วพิมพ์ด้วย Tab/Enter', what_next_th = 'ต่อไปคือแบบอักษร' where lesson_key = 'module-03-lesson-01';
update public.ppg_lessons set title_th = 'การเปลี่ยนแบบอักษร', what_learn_th = 'เปลี่ยนแบบอักษร ขนาด และการจัดตำแหน่ง', why_th = 'การเลือกแบบอักษรส่งผลต่อการอ่านภาษาไทย', body_th = 'Home, แบบอักษร, ขนาด, การจัดตำแหน่ง, สี', what_next_th = 'ต่อไปคือการออกแบบสไลด์' where lesson_key = 'module-03-lesson-02';
update public.ppg_lessons set title_th = 'เลย์เอาต์และการออกแบบ', what_learn_th = 'เลย์เอาต์และตัวแทนข้อความ', why_th = 'เลย์เอาต์มาก่อนเอฟเฟกต์', body_th = 'มุมมองออกแบบ เลย์เอาต์ ชนิดสไลด์ ตัวแทนข้อความ', what_next_th = 'ต่อไปคือเอฟเฟกต์ข้อความ' where lesson_key = 'module-04-lesson-01';
update public.ppg_lessons set title_th = 'เอฟเฟกต์ข้อความ', what_learn_th = 'สี เส้น เงา และเอฟเฟกต์', why_th = 'เอฟเฟกต์มาหลังข้อความ', body_th = 'แท็บ Home เมนูแบบอักษร เอฟเฟกต์ สี', what_next_th = 'ต่อไปคือรูปร่าง' where lesson_key = 'module-05-lesson-01';
update public.ppg_lessons set title_th = 'รูปร่างและเส้น', what_learn_th = 'สร้างรูปร่าง ปรับสีเติมและเส้น', why_th = 'รูปร่างมาหลังเลย์เอาต์', body_th = 'แท็บ Insert รูปร่าง สีเติม เส้น', what_next_th = 'ต่อไปคือ SmartArt' where lesson_key = 'module-06-lesson-01';
update public.ppg_lessons set title_th = 'กราฟิก SmartArt', what_learn_th = 'สร้าง SmartArt และเปลี่ยนรูปแบบ', why_th = 'SmartArt มาหลังรูปร่าง', body_th = 'แท็บ Insert SmartArt เปลี่ยนชนิด', what_next_th = 'ต่อไปคือการจัดวางวัตถุ' where lesson_key = 'module-07-lesson-01';
update public.ppg_lessons set title_th = 'การจัดวางวัตถุและรูปภาพ', what_learn_th = 'วางรูปภาพและตัดข้อความล้อมรูป', why_th = 'การจัดวางวัตถุมาหลังการออกแบบ', body_th = 'แท็บ Insert รูปภาพ ตัดข้อความล้อมรูป', what_next_th = 'ต่อไปคือการเปลี่ยนสไลด์' where lesson_key = 'module-08-lesson-01';
update public.ppg_lessons set title_th = 'การเปลี่ยนสไลด์', what_learn_th = 'เปลี่ยนทราบซิชันและเลื่อนเมื่อคลิก', why_th = 'ทราบซิชันมาหลังสไลด์', body_th = 'แท็บ Slide Show ทราบซิชัน เลื่อนเมื่อคลิก', what_next_th = 'ต่อไปคือการตรวจทานและเผยแพร่' where lesson_key = 'module-09-lesson-01';
update public.ppg_lessons set title_th = 'การตรวจทานและทำงานร่วมกัน', what_learn_th = 'ตรวจทานและทำงานร่วมกัน', why_th = 'ตรวจทานก่อนเผยแพร่', body_th = 'แท็บ Review การตรวจสอบ การทำงานร่วมกัน', what_next_th = 'ต่อไปคือการเผยแพร่และส่งออก' where lesson_key = 'module-10-lesson-01';
update public.ppg_lessons set title_th = 'การเผยแพร่และส่งออก', what_learn_th = 'PDF การพิมพ์ และการแชร์', why_th = 'PDF คือจุดสิ้นสุดของกิจกรรม', body_th = 'แท็บ File PDF พิมพ์ แชร์', what_next_th = 'ต่อไปคือโครงงานสุดท้าย' where lesson_key = 'module-10-lesson-02';

-- public.ppg_practical_missions — scenario/requirements/expected_out
update public.ppg_practical_missions set scenario_th = 'นำบทเรียนของคุณขึ้นระบบ LMS จริง: เผยแพร่บทเรียนบนระบบจริง (การออกแบบบทเรียน)', requirements_th = 'ส่งออกบทเรียนของโมดูลคุณ: บทเรียนโมดูล 8 (8.1–8.4) + ส่วนการออกแบบ (8.5)', expected_out_th = 'ชุดสไลด์ที่สอนได้จริง: ไฟล์ .pptx — สไลด์ชื่อเรื่องและสรุป สิ่งส่งมอบ และหมายเหตุว่าไม่มีข้อมูลปลอม' where module_key = 'module-08';
update public.ppg_practical_missions set scenario_th = 'นำภารกิจความรู้ของคุณขึ้นระบบ LMS จริง: เผยแพร่ภารกิจความรู้ของโมดูลบนระบบจริง (การออกแบบการประเมิน)', requirements_th = 'ส่งออกภารกิจความรู้ของโมดูลคุณ: บทเรียนโมดูล 9 (9.1–9.4) + ส่วนการออกแบบ (9.5)', expected_out_th = 'ชุดสไลด์ที่สอนได้จริง: ไฟล์ .pptx — สไลด์ชื่อเรื่องและสรุป สิ่งส่งมอบ และหมายเหตุว่าไม่มีข้อมูลปลอม' where module_key = 'module-09';
update public.ppg_practical_missions set scenario_th = 'นำโครงงานออกแบบของคุณขึ้นระบบ LMS จริง: เผยแพร่โครงงานออกแบบของโมดูลบนระบบจริง (การออกแบบการเผยแพร่)', requirements_th = 'ส่งออกโครงงานออกแบบของโมดูลคุณ: บทเรียนโมดูล 10 (10.1–10.4) + ส่วนการออกแบบ (10.5)', expected_out_th = 'ชุดสไลด์ที่สอนได้จริง: ไฟล์ .pptx — สไลด์ชื่อเรื่องและสรุป สิ่งส่งมอบ และหมายเหตุว่าไม่มีข้อมูลปลอม' where module_key = 'module-10';

-- public.ppg_rubric_criteria — label_th
update public.ppg_rubric_criteria set label_th = 'เนื้อหาและโครงสร้าง' where criterion_key = 'content_structure';
update public.ppg_rubric_criteria set label_th = 'การจัดรูปแบบข้อความ' where criterion_key = 'text_formatting';
update public.ppg_rubric_criteria set label_th = 'รูปภาพและองค์ประกอบภาพ' where criterion_key = 'images_visual';
update public.ppg_rubric_criteria set label_th = 'การออกแบบสไลด์' where criterion_key = 'slide_design';
update public.ppg_rubric_criteria set label_th = 'การใช้เครื่องมือ PowerPoint' where criterion_key = 'powerpoint_tool_usage';
update public.ppg_rubric_criteria set label_th = 'ความคิดสร้างสรรค์' where criterion_key = 'creativity';
update public.ppg_rubric_criteria set label_th = 'ความครบถ้วน' where criterion_key = 'completeness';

-- public.ppg_rub_descriptors — descriptor_th (7 criteria × bands 1–5)
update public.ppg_rub_descriptors set descriptor_th = 'เนื้อหากระจัดกระจาย: สไลด์มีข้อความลอย ไม่มีโครงร่างชัดเจน และขาดบางหัวข้อ' where criterion_key = 'content_structure' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'โครงร่างพื้นฐานครบ: สไลด์ส่วนใหญ่มีข้อความตามที่ตั้งใจ บางหัวข้อยังไม่สมบูรณ์' where criterion_key = 'content_structure' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'โครงร่างพอใช้: สไลด์หลักมีข้อความครบ บางหัวข้อเบี่ยงออกจากโครงร่าง' where criterion_key = 'content_structure' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'เนื้อหาตามโครงร่าง: ทุกสไลด์มีหัวข้อตามที่ตั้งใจ ชุดสไลด์อ่านได้ตามแผน' where criterion_key = 'content_structure' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'เนื้อหาครบถ้วนและเป็นระเบียบ: ทุกหัวข้อครบ เรียงลำดับ และตรงกับแผนทีละสไลด์' where criterion_key = 'content_structure' and score_band = 5;
update public.ppg_rub_descriptors set descriptor_th = 'ข้อความยังไม่ได้จัดรูปแบบ: แบบอักษรและขนาดไม่สม่ำเสมอ ดูเหมือนนำข้อความมาวาง' where criterion_key = 'text_formatting' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'จัดรูปแบบบางส่วน: แบบอักษรหลากหลาย ป้ายหรือขนาดบางจุดไม่สม่ำเสมอ' where criterion_key = 'text_formatting' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'จัดรูปแบบแล้ว: แบบอักษรสม่ำเสมอในสไลด์ส่วนใหญ่ ป้ายบางจุดยังไม่ตรงมาตรฐาน' where criterion_key = 'text_formatting' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'จัดรูปแบบสม่ำเสมอ: ทุกสไลด์ใช้ชุดแบบอักษรและขนาดเดียวกัน เหลือเพียงบางกรณีขอบ' where criterion_key = 'text_formatting' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'การจัดรูปแบบสม่ำเสมอทั้งชุด: แบบอักษรเดียว ขนาดเข้าคู่ ขอบเรียบสะอาด' where criterion_key = 'text_formatting' and score_band = 5;
update public.ppg_rub_descriptors set descriptor_th = 'ไม่มีรูปภาพ: สไลด์มีแต่ข้อความ ไม่มีองค์ประกอบภาพ' where criterion_key = 'images_visual' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'รูปภาพหลวม: บางสไลด์มีภาพแต่ขนาดไม่พอดีหรือซ้ำกัน' where criterion_key = 'images_visual' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'มีรูปภาพ: ชุดสไลด์ใช้ภาพในสไลด์ส่วนใหญ่ บางภาพยังไม่พอดี' where criterion_key = 'images_visual' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'รูปภาพจัดวางดี: ทุกสไลด์มีภาพที่ปรับขนาดและตรงหัวข้อ เหลือเพียงช่องว่างเล็กน้อย' where criterion_key = 'images_visual' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'ภาพสอดคล้องทั้งชุด: ทุกสไลด์มีภาพปรับขนาดตรงหัวข้อ และกราฟิกสนับสนุนเนื้อหาทั้งหมด' where criterion_key = 'images_visual' and score_band = 5;
update public.ppg_rub_descriptors set descriptor_th = 'ไม่มีการออกแบบสไลด์: เลย์เอาต์ไม่สมดุล ชุดสไลด์ขาดการออกแบบ' where criterion_key = 'slide_design' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'ออกแบบบางส่วน: บางเลย์เอาต์สมดุล ส่วนใหญ่ยังเป็นตัวแทนทั่วไป' where criterion_key = 'slide_design' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'การออกแบบพอใช้: เลย์เอาต์สมดุลในสไลด์ส่วนใหญ่ บางสไลด์ยังไม่สมดุล' where criterion_key = 'slide_design' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'การออกแบบสมดุล: ทุกสไลด์มีระยะห่างและเลย์เอาต์สม่ำเสมอ มีช่องว่างเป็นครั้งคราว' where criterion_key = 'slide_design' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'การออกแบบสอดคล้อง: เลย์เอาต์ ระยะห่าง และจังหวะตรงกันทั้งชุด' where criterion_key = 'slide_design' and score_band = 5;
update public.ppg_rub_descriptors set descriptor_th = 'ไม่ได้ใช้เครื่องมือ PowerPoint: ชุดสไลด์ดูเหมือนนำมาวาง ไม่ได้สร้างใน PowerPoint' where criterion_key = 'powerpoint_tool_usage' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'ใช้เครื่องมือบางส่วน: บางสไลด์ใช้ชุดเครื่องมือ ส่วนใหญ่ยังดูเหมือนนำมาวาง' where criterion_key = 'powerpoint_tool_usage' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'ใช้เครื่องมือ PowerPoint: สไลด์ส่วนใหญ่สร้างด้วยชุดเครื่องมือ บางสไลด์ยังดูเหมือนนำมาวาง' where criterion_key = 'powerpoint_tool_usage' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'ใช้เครื่องมือสม่ำเสมอ: ทุกสไลด์สร้างใน PowerPoint ด้วยฟีเจอร์ของตัวเอง' where criterion_key = 'powerpoint_tool_usage' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'สร้างด้วย PowerPoint ทั้งชุด: ใช้ชุดเครื่องมือตลอดทั้งงาน (มาสเตอร์ แอนิเมชัน เลย์เอาต์)' where criterion_key = 'powerpoint_tool_usage' and score_band = 5;
update public.ppg_rub_descriptors set descriptor_th = 'ไม่มีความคิดสร้างสรรค์: ชุดสไลด์ซ้ำตัวอย่างในบทเรียน ไม่มีมุมมองของผู้เรียน' where criterion_key = 'creativity' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'มีความคิดสร้างสรรค์เล็กน้อย: มีรายละเอียดแปลกใหม่บางจุด แต่ยังอิงตัวอย่างในบทเรียน' where criterion_key = 'creativity' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'มีความคิดสร้างสรรค์: บางสไลด์มีมุมมองเฉพาะตัว บางสไลด์ยังเป็นตำรา' where criterion_key = 'creativity' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'ความคิดสร้างสรรค์ชัดเจน: ชุดสไลด์มีรายละเอียดริเริ่ม เหลือบางส่วนที่ยังทั่วไป' where criterion_key = 'creativity' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'ความคิดสร้างสรรค์ทั่วทั้งชุด: เสียงเฉพาะตัวที่สม่ำเสมอและริเริ่มเกินตัวอย่างในบทเรียน' where criterion_key = 'creativity' and score_band = 5;
update public.ppg_rub_descriptors set descriptor_th = 'ชุดสไลด์ไม่ครบ: ขาดสิ่งส่งมอบหรือหมายเหตุที่กำหนด และจบก่อนกำหนด' where criterion_key = 'completeness' and score_band = 1;
update public.ppg_rub_descriptors set descriptor_th = 'ครบถ้วนบางส่วน: มีสิ่งส่งมอบที่กำหนดเพียงบางรายการ ส่วนใหญ่ยังขาด' where criterion_key = 'completeness' and score_band = 2;
update public.ppg_rub_descriptors set descriptor_th = 'ครบถ้วนพอใช้: มีสิ่งส่งมอบ แต่ยังขาดหมายเหตุว่าไม่มีข้อมูลปลอมหรือบางหัวข้อ' where criterion_key = 'completeness' and score_band = 3;
update public.ppg_rub_descriptors set descriptor_th = 'เกือบครบถ้วน: มีสิ่งส่งมอบและหมายเหตุว่าไม่มีข้อมูลปลอม เหลือช่องว่างเล็กน้อย' where criterion_key = 'completeness' and score_band = 4;
update public.ppg_rub_descriptors set descriptor_th = 'ครบถ้วน: มีสิ่งส่งมอบและหมายเหตุว่าไม่มีข้อมูลปลอม ทุกหัวข้อที่กำหนดครบ' where criterion_key = 'completeness' and score_band = 5;

-- public.ppg_badge_types — label_th, award_rule_th
update public.ppg_badge_types set label_th = 'พร้อมภารกิจ', award_rule_th = 'ผ่าน Self-Check ครั้งแรก — ภารกิจความรู้แรกจะปลดล็อกต่อไป (+100 XP ครั้งเดียว)' where badge_key = 'mission_ready';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 1', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 1 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_01_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 2', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 2 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_02_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 3', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 3 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_03_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 4', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 4 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_04_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 5', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 5 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_05_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 6', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 6 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_06_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 7', award_rule_th = 'ผ่านภารกิจความรู้ครั้งแรกที่ 70% — ป้ายโมดูล 7 (เหตุการณ์จริง, +100 XP ครั้งเดียว)' where badge_key = 'module_07_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 8', award_rule_th = 'ภารกิจภาคปฏิบัติโมดูล 8 — มอบเมื่อส่งงานครั้งแรกที่ได้รับอนุมัติ (เหตุการณ์จริง, +150 XP ครั้งเดียว)' where badge_key = 'module_08_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 9', award_rule_th = 'ภารกิจภาคปฏิบัติโมดูล 9 — มอบเมื่อส่งงานครั้งแรกที่ได้รับอนุมัติ (เหตุการณ์จริง, +150 XP ครั้งเดียว)' where badge_key = 'module_09_mission';
update public.ppg_badge_types set label_th = 'ภารกิจโมดูล 10', award_rule_th = 'ภารกิจภาคปฏิบัติโมดูล 10 — มอบเมื่อส่งงานครั้งแรกที่ได้รับอนุมัติ (เหตุการณ์จริง, +150 XP ครั้งเดียว)' where badge_key = 'module_10_mission';
update public.ppg_badge_types set label_th = 'บอสสุดท้าย', award_rule_th = 'บอสสุดท้าย — มอบเมื่อ Final Project ได้รับอนุมัติ (เหตุการณ์จริง, +300 XP ครั้งเดียว)' where badge_key = 'final_boss';
update public.ppg_badge_types set label_th = 'ระดับ 5', award_rule_th = 'ระดับ 5 — มอบเมื่อยอด XP รวมจริงถึง 400 XP (floor(total/100)+1 = 5) ณ การอนุมัติ Final Project' where badge_key = 'level_5';
update public.ppg_badge_types set label_th = 'จบหลักสูตร', award_rule_th = 'จบหลักสูตร — มอบเมื่อ Final Project ได้รับอนุมัติ: หลักสูตรเชิงเส้นทั้งหมดเสร็จสิ้น (เหตุการณ์จริง ครั้งเดียว)' where badge_key = 'course_complete';
