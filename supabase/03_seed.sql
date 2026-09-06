-- ============================================================================
-- BROVA — 03_seed.sql : ข้อมูลตั้งต้นและงานตัวอย่าง
-- รันต่อจาก 02_rls.sql
--
-- งานตัวอย่าง 4 งานไว้ให้กดเล่นจนเข้าใจระบบ
-- พร้อมใช้จริงเมื่อไร ให้รัน 08_go_live.sql ล้างทิ้งแล้วเริ่มนับใหม่
-- ============================================================================

-- ---------------------------------------------------------------- หน่วยธุรกิจ
insert into business_units(code, name, scope, target_revenue_month) values
 ('BU1','Service & Supply','รับผลิต ขายเสื้อเปล่า เป็นเจ้าของสต็อกและกำลังผลิตทั้งหมด', 250000),
 ('BU2','In-house Brand','แบรนด์ของบริษัท ซื้อจาก BU1 ด้วยราคาโอนภายใน', 80000),
 ('BU3','Merchandise','เสื้อคำพูด เสื้อกระแส รอบสั้น ล็อตเล็ก', 60000),
 ('BU4','Special SKU / Affiliate','ไลฟ์สดและ fulfillment ให้ตัวแทน', 40000)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- ซัพพลายเออร์
insert into suppliers(code, name, contact, phone, fabric_groups, lead_time_hours, payment_terms, rating) values
 ('SUP-001','โรงงานผ้าเจ้าหลัก','คุณเอ','081-000-0001', array['A','C'], 3, 'เงินสด', 5),
 ('SUP-002','ผ้ากีฬาไทย','คุณบี','081-000-0002', array['B'], 48, '7 วัน', 4),
 ('SUP-003','นำเข้าผ้าพิเศษ','คุณซี','081-000-0003', array['D'], 720, '30 วัน', 4)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- SKU ตั้งต้น
insert into skus(code, fabric_group, fabric_name, gsm, color_name, color_hex, size, cost,
                 stock_policy, qty_on_hand, reorder_point, safety_stock, lead_time_hours)
values
 ('A01-BLK-M','A','Comb Cotton 32',180,'ดำ','#0A0A0A','M',78,'สต็อกลอย',40,60,20,3),
 ('A01-BLK-L','A','Comb Cotton 32',180,'ดำ','#0A0A0A','L',78,'สต็อกลอย',18,60,20,3),
 ('A01-BLK-XL','A','Comb Cotton 32',180,'ดำ','#0A0A0A','XL',82,'สต็อกลอย',52,60,20,3),
 ('A01-WHT-M','A','Comb Cotton 32',180,'ขาว','#F5F4F2','M',75,'สต็อกลอย',34,60,20,3),
 ('A01-WHT-L','A','Comb Cotton 32',180,'ขาว','#F5F4F2','L',75,'สต็อกลอย',66,60,20,3),
 ('A01-GRY-L','A','Comb Cotton 32',180,'เทาท็อป','#9A9A9A','L',76,'สต็อกลอย',48,60,20,3),
 ('B02-BLK-L','B','Micro Dry-Fit',150,'ดำ','#0A0A0A','L',68,'สต็อกจริง',52,50,25,48),
 ('B02-NVY-L','B','Micro Dry-Fit',150,'กรมท่า','#1B2A41','L',68,'สต็อกจริง',30,50,25,48),
 ('C01-BLK-L','C','TC Standard',160,'ดำ','#0A0A0A','L',58,'สต็อกลอย',120,80,0,3),
 ('C01-WHT-L','C','TC Standard',160,'ขาว','#F5F4F2','L',56,'สต็อกลอย',95,80,0,3),
 ('D01-CRM-L','D','Heavyweight Import',260,'ครีม','#E8E2D6','L',185,'สต็อกจริง',12,30,30,720),
 ('D03-NVY-XL','D','Heavyweight Import',260,'กรมท่า','#1B2A41','XL',190,'สต็อกจริง',6,40,40,720)
on conflict (code) do nothing;

update skus s set supplier_primary = (select id from suppliers where code='SUP-001')
where s.fabric_group in ('A','C') and s.supplier_primary is null;
update skus s set supplier_primary = (select id from suppliers where code='SUP-002')
where s.fabric_group = 'B' and s.supplier_primary is null;
update skus s set supplier_primary = (select id from suppliers where code='SUP-003')
where s.fabric_group = 'D' and s.supplier_primary is null;

-- ---------------------------------------------------------------- ลูกค้าตัวอย่าง
insert into customers(code, name, type, tax_id, contact_name, phone, line_id,
                      address_bill, address_ship, source, credit_terms, credit_days) values
 ('CUS-00001','บริษัท กรีนเลิฟ จำกัด','นิติบุคคล','0105558000001','คุณกิ่ง','081-111-1111','@greenleaf',
  '99/1 ถนนสุขุมวิท กรุงเทพฯ 10110','99/1 ถนนสุขุมวิท กรุงเทพฯ 10110','Referral','เครดิต 30 วัน',30),
 ('CUS-00002','คาเฟ่ บ้านสวน','บุคคลธรรมดา',null,'คุณฝน','082-222-2222','@baansuan',
  '12 ซอยอารีย์ 4 กรุงเทพฯ 10400','12 ซอยอารีย์ 4 กรุงเทพฯ 10400','Facebook','มัดจำ 50%',0),
 ('CUS-00003','ชมรมถ่ายภาพ ม.ราชภัฏ','หน่วยงานราชการ',null,'คุณต้น','083-333-3333','@photoclub',
  'มหาวิทยาลัยราชภัฏ','มหาวิทยาลัยราชภัฏ','LINE','มัดจำ 50%',0)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- บรีฟตัวอย่าง
insert into inquiries(code, customer_id, channel, brief_who, brief_where, brief_duration,
                      qty_estimate, budget_per_unit, deadline, recommended_fabric_group, status)
select 'INQ-2569-000' || n,
       (select id from customers where code = c),
       ch, who, wh, dur, qty, budget, current_date + d, fg, st
from (values
 (1,'CUS-00001','LINE','พนักงานออฟฟิศ 300 คน','ในออฟฟิศติดแอร์','ใส่ทุกวันทำงาน ประมาณ 2 ปี',300,165,10,'A','ปิดการขาย'),
 (2,'CUS-00002','Facebook','บาริสต้าและพนักงานเสิร์ฟ 60 คน','ในร้านคาเฟ่ ยืนทั้งวัน','ใส่ทุกวัน ซัก 3 ครั้งต่อสัปดาห์',60,190,18,'A','ปิดการขาย'),
 (3,'CUS-00003','LINE','สมาชิกชมรม 150 คน','ใส่ออกทริปถ่ายภาพ','ใส่เฉพาะกิจกรรม ปีละ 10 ครั้ง',150,175,4,'C','ปิดการขาย'),
 (4,'CUS-00002','LINE','ลูกค้าร้านที่มาร่วมงานเปิดสาขา','แจกหน้าร้าน','ของที่ระลึก',80,190,-6,'C','ปิดการขาย'),
 (5,'CUS-00001','Facebook','ทีมขายภาคสนาม 40 คน','ออกพบลูกค้ากลางแจ้ง','ใส่ทุกวัน 1 ปี',40,220,25,'B','กำลังเสนอราคา'),
 (6,'CUS-00003','LINE','นักศึกษาปี 1 ทั้งคณะ','งานรับน้อง','ใส่ครั้งเดียว',250,120,30,'C','กำลังเสนอราคา'),
 (7,'CUS-00002','Walk-in','ทีมงานอีเวนต์','งานเปิดตัวสินค้า','ใส่วันงาน',30,210,12,'A','ใหม่'),
 (8,'CUS-00001','LINE','ทีมช่างโรงงาน','หน้างานร้อน','ใส่ทุกวัน',120,150,45,'B','ใหม่')
) as t(n, c, ch, who, wh, dur, qty, budget, d, fg, st)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- ใบเสนอราคาตัวอย่าง
insert into quotations(code, customer_id, bu_code, status, issued_at, valid_until,
                       lead_time_days, deposit_pct, excluded_items, note)
values ('QT-2569-0001', (select id from customers where code='CUS-00001'), 'BU1', 'Accepted',
        current_date - 22, current_date - 7, 12, 50,
        'ไม่รวมค่าส่ง · ไม่รวมค่าแก้แบบเกิน 2 ครั้ง', 'ยูนิฟอร์มพนักงานสาขาใหม่')
on conflict (code) do nothing;

insert into quote_items(quotation_id, sku_code, description, technique, colors,
                        qty_m, qty_l, qty_xl, qty_2xl, unit_cost, unit_price)
select (select id from quotations where code='QT-2569-0001'),
       'A01-BLK-L','เสื้อยูนิฟอร์มพนักงาน สกรีนอกซ้าย 2 สี','สกรีนซิลค์',2, 80,120,100,0, 78, 165
where not exists (select 1 from quote_items qi
                  join quotations q on q.id = qi.quotation_id where q.code='QT-2569-0001');

-- ---------------------------------------------------------------- งานตัวอย่าง 4 งาน
insert into jobs(code, quotation_id, customer_id, bu_code, title, status, owner_role,
                 qty_total, total_amount, cost_estimate, payment_terms, due_date, promised_date,
                 brief_who, brief_where, brief_duration, item_description,
                 confirmed_by, confirm_evidence, confirmed_at, track_token)
values
 ('JOB-2569-0001',(select id from quotations where code='QT-2569-0001'),
  (select id from customers where code='CUS-00001'),'BU1',
  'เสื้อยูนิฟอร์มพนักงาน 300 ตัว','65','Production',
  300, 49500, 31200, 'เครดิต', current_date - 2, current_date,
  'พนักงานออฟฟิศ 300 คน','ในออฟฟิศติดแอร์','ใส่ทุกวันทำงาน ประมาณ 2 ปี',
  'สกรีนซิลค์สกรีน 2 สี อกซ้าย + หลังเต็ม · ผ้า Comb Cotton 32',
  'คุณกิ่ง (ฝ่ายบุคคล)','line-confirm-0184.png', now() - interval '17 days','74487c9eb244'),

 ('JOB-2569-0002',null,(select id from customers where code='CUS-00002'),'BU1',
  'เสื้อพนักงานคาเฟ่ 60 ตัว','45','Design',
  60, 11400, 6900, 'มัดจำ 50%', current_date + 8, current_date + 10,
  'บาริสต้าและพนักงานเสิร์ฟ 60 คน','ในร้านคาเฟ่ ยืนทั้งวัน','ใส่ทุกวัน ซัก 3 ครั้งต่อสัปดาห์',
  'ปักโลโก้อกซ้าย · ผ้า Comb Cotton 32 สีดำและขาว',
  null,null,null,'7ba832380dd8'),

 ('JOB-2569-0003',null,(select id from customers where code='CUS-00003'),'BU1',
  'เสื้อชมรมถ่ายภาพ 150 ตัว','75','Production',
  150, 26250, 15600, 'มัดจำ 50%', current_date, current_date + 2,
  'สมาชิกชมรม 150 คน','ใส่ออกทริปถ่ายภาพ','ใส่เฉพาะกิจกรรม ปีละ 10 ครั้ง',
  'DTF ลายหลังเต็ม 4 สี · ผ้า TC Standard',
  'คุณต้น (ประธานชมรม)','line-confirm-0201.png', now() - interval '9 days','958f194148f9'),

 ('JOB-2569-0004',null,(select id from customers where code='CUS-00002'),'BU3',
  'เสื้อที่ระลึกเปิดสาขา 80 ตัว','99','Sales',
  80, 15200, 8800, 'มัดจำ 50%', current_date - 20, current_date - 18,
  'ลูกค้าร้านที่มาร่วมงานเปิดสาขา','แจกหน้าร้าน','ของที่ระลึก',
  'DTF อกซ้าย 1 จุด · ผ้า TC Standard',
  'คุณฝน (เจ้าของร้าน)','line-confirm-0166.png', now() - interval '30 days','e1899128913b')
on conflict (code) do nothing;

update jobs set carrier='Flash', tracking_no='TH01234567890', boxes=3, weight_kg=12.5,
       ship_cost=320, shipped_at = now() - interval '22 days', delivered_at = now() - interval '20 days'
where code='JOB-2569-0004' and tracking_no is null;

-- รายการในงาน
insert into job_items(job_id, sku_code, description, technique, colors,
                      qty_m, qty_l, qty_xl, qty_2xl, unit_cost, unit_price, size_locked)
select j.id, v.sku, v.des, v.tech, v.col, v.m, v.l, v.xl, v.x2, v.cost, v.price, v.lock
from (values
 ('JOB-2569-0001','A01-BLK-L','อกซ้าย + หลังเต็ม 2 สี','สกรีนซิลค์',2, 80,120,100,0, 104, 165, true),
 ('JOB-2569-0002','A01-BLK-M','ปักโลโก้อกซ้าย','ปัก',1, 30,20,10,0, 115, 190, true),
 ('JOB-2569-0003','C01-BLK-L','DTF หลังเต็ม 4 สี','DTF',4, 40,70,40,0, 104, 175, true),
 ('JOB-2569-0004','C01-WHT-L','DTF อกซ้าย','DTF',1, 30,30,20,0, 110, 190, true)
) as v(job, sku, des, tech, col, m, l, xl, x2, cost, price, lock)
join jobs j on j.code = v.job
where not exists (select 1 from job_items ji where ji.job_id = j.id);

-- ---------------------------------------------------------------- ประวัติการเดินสถานะ
insert into status_logs(job_id, from_status, to_status, note, by_user, created_at)
select j.id, v.f, v.t, v.n, 'ระบบ', now() - (v.d || ' days')::interval
from (values
 ('JOB-2569-0001','10','20','ปิดการขายจากใบเสนอราคา', 23),
 ('JOB-2569-0001','20','30','รับมัดจำ 50%', 21),
 ('JOB-2569-0001','30','35','เริ่มทำม็อคอัพ', 20),
 ('JOB-2569-0001','35','40','ส่งม็อคอัพให้ลูกค้า', 19),
 ('JOB-2569-0001','40','45','ลูกค้าคอนเฟิร์มแบบ', 18),
 ('JOB-2569-0001','45','50','ล็อกแบบและไซส์', 17),
 ('JOB-2569-0001','50','60','เตรียมวัตถุดิบ', 15),
 ('JOB-2569-0001','60','65','เข้าไลน์ผลิต', 13),
 ('JOB-2569-0002','10','20','เปิดงานจากบรีฟ', 6),
 ('JOB-2569-0002','20','30','รับมัดจำ', 5),
 ('JOB-2569-0002','30','35','ทำม็อคอัพ', 4),
 ('JOB-2569-0002','35','40','ส่งม็อคอัพ', 3),
 ('JOB-2569-0002','40','45','รอลูกค้าคอนเฟิร์ม', 2),
 ('JOB-2569-0003','10','20','เปิดงาน', 14),
 ('JOB-2569-0003','20','30','รับมัดจำ', 13),
 ('JOB-2569-0003','30','45','คอนเฟิร์มแบบเร็ว', 11),
 ('JOB-2569-0003','45','50','ล็อกแบบ', 10),
 ('JOB-2569-0003','50','65','เข้าไลน์ผลิต', 7),
 ('JOB-2569-0003','65','70','ตรวจคุณภาพ', 3),
 ('JOB-2569-0003','70','75','ผลิตเสร็จ รอชำระยอดคงเหลือ', 1),
 ('JOB-2569-0004','10','20','เปิดงาน', 34),
 ('JOB-2569-0004','20','30','รับมัดจำ', 33),
 ('JOB-2569-0004','30','50','ล็อกแบบ', 30),
 ('JOB-2569-0004','50','65','ผลิต', 27),
 ('JOB-2569-0004','65','75','ผลิตเสร็จ', 24),
 ('JOB-2569-0004','75','80','ชำระครบ', 23),
 ('JOB-2569-0004','80','85','จัดส่ง', 22),
 ('JOB-2569-0004','85','90','ลูกค้ารับของแล้ว', 20),
 ('JOB-2569-0004','90','99','ปิดงาน', 19)
) as v(job, f, t, n, d)
join jobs j on j.code = v.job
where not exists (select 1 from status_logs s where s.job_id = j.id);

-- ---------------------------------------------------------------- ม็อคอัพ
insert into mockups(job_id, rev_no, file_url, size_cm, note, approved, created_at)
select j.id, v.r, v.u, v.s, v.n, v.a, now() - (v.d || ' days')::interval
from (values
 ('JOB-2569-0001',1,'https://drive.google.com/file/mockup-uniform-r1.png','อก 25 ซม. × สูง 8 ซม.','ร่างแรก', false, 20),
 ('JOB-2569-0001',2,'https://drive.google.com/file/mockup-uniform-r2.png','อก 24 ซม. × สูง 8 ซม.','ลูกค้าขอลดขนาดโลโก้', true, 19),
 ('JOB-2569-0002',1,'https://drive.google.com/file/mockup-cafe-r1.png','อก 10 ซม. × สูง 6 ซม.','รอลูกค้าดู', false, 3)
) as v(job, r, u, s, n, a, d)
join jobs j on j.code = v.job
where not exists (select 1 from mockups m where m.job_id = j.id);

-- ---------------------------------------------------------------- ผลิตและ QC
insert into production_logs(job_id, step, qty_in, qty_out, qty_defect, defect_reason, machine, by_user, created_at)
select j.id, v.st, v.i, v.o, v.df, v.rs, v.mc, 'ทีมผลิต', now() - (v.d || ' days')::interval
from (values
 ('JOB-2569-0001','ตัดฟิล์ม',300,300,0,null,'CUT-01', 12),
 ('JOB-2569-0001','พิมพ์',300,296,4,'หมึกเลอะขอบลาย','DTF-02', 11),
 ('JOB-2569-0003','ตัดฟิล์ม',150,150,0,null,'CUT-01', 6),
 ('JOB-2569-0003','พิมพ์',150,148,2,'ตำแหน่งเคลื่อน','DTF-01', 5),
 ('JOB-2569-0003','รีด',148,148,0,null,'HP-01', 4)
) as v(job, st, i, o, df, rs, mc, d)
join jobs j on j.code = v.job
where not exists (select 1 from production_logs p where p.job_id = j.id);

insert into qc_records(job_id, checked_qty, pass_qty, fail_reasons, wash_test_done, result, by_user, created_at)
select j.id, v.c, v.p, v.f, v.w, v.r, 'ทีม QC', now() - (v.d || ' days')::interval
from (values
 ('JOB-2569-0003',148,144,'ตำแหน่งเกิน 1 ซม. 4 ตัว', true,'ส่งซ่อม', 3),
 ('JOB-2569-0004',80,80,null,true,'ผ่าน', 25)
) as v(job, c, p, f, w, r, d)
join jobs j on j.code = v.job
where not exists (select 1 from qc_records q where q.job_id = j.id);

-- ---------------------------------------------------------------- จัดส่ง
insert into shipments(code, job_id, carrier, tracking_no, boxes, weight_kg, cost,
                      status, shipped_at, delivered_at)
select 'SH-2569-0001', j.id, 'Flash','TH01234567890',3,12.5,320,'ถึงแล้ว',
       now() - interval '22 days', now() - interval '20 days'
from jobs j where j.code='JOB-2569-0004'
on conflict (code) do nothing;

-- ---------------------------------------------------------------- แบบประเมิน
insert into feedback(job_id, score, comment, coupon_code, coupon_expire)
select j.id, 9, 'งานเรียบร้อย ส่งตรงเวลา สีตรงแบบ', 'BROVA-5-0001', current_date + 70
from jobs j where j.code='JOB-2569-0004'
and not exists (select 1 from feedback f where f.job_id = j.id);

-- ---------------------------------------------------------------- ตัวแทน
insert into affiliates(code, name, phone, gp_pct) values
 ('AFF-001','คุณมิ้นท์ ไลฟ์สด','089-999-0001',25),
 ('AFF-002','เพจรีวิวเสื้อ','089-999-0002',20)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- คลังความรู้
insert into knowledge(code, title, symptom, root_cause, action_taken, prevention, tags) values
 ('KB-0001','หมึก DTF ลอกหลังซักครั้งแรก',
  'ลายหลุดเป็นแผ่นหลังซักครั้งแรก เฉพาะงานผ้า TC',
  'อุณหภูมิรีดต่ำกว่ามาตรฐาน 15 องศา เพราะเครื่องยังไม่อุ่นพอ',
  'รีดซ้ำทั้งล็อตที่ 165 องศา 15 วินาที แล้วทดสอบซัก 5 รอบ',
  'อุ่นเครื่องรีด 10 นาทีก่อนเริ่มงานทุกครั้ง และวัดอุณหภูมิจริงด้วยเทอร์โมมิเตอร์',
  array['DTF','ผ้า TC','การรีด']),
 ('KB-0002','สีเสื้อต่างกันระหว่างล็อต',
  'เสื้อสีดำล็อตใหม่เข้มกว่าล็อตเดิมอย่างเห็นได้ชัด',
  'โรงงานเปลี่ยนรอบย้อม สีระหว่างล็อตต่างกันได้ตามธรรมชาติ',
  'แจ้งลูกค้าก่อนส่ง และสลับให้ล็อตเดียวกันอยู่ในกลุ่มเดียวกัน',
  'งานที่เกิน 200 ตัวให้สั่งผ้าล็อตเดียวกันทั้งหมด และขอตัวอย่างสีก่อนตัด',
  array['ผ้า','สี','การสั่งซื้อ'])
on conflict (code) do nothing;

-- ปรับตัวนับให้ตรงกับเลขที่ที่ข้อมูลตัวอย่างใช้ไปแล้ว เอกสารใบจริงใบแรกจะได้ไม่เลขซ้ำ
select sync_counters();
