-- ============================================================================
-- BROVA — 07_fabrics.sql : คลังผ้าและตารางราคาเสื้อยืดเปล่า
-- รันต่อจาก 06_purchasing.sql
--
-- ข้อมูลทั้งหมดถอดจากเอกสาร "ตารางราคาเสื้อยืดเปล่า" ที่ผู้ใช้ให้มา
-- ครอบคลุม 10 เนื้อผ้า แยกเป็นเกรด A B C และแยกว่าเหมาะกับงานแบรนด์หรืองานอีเวนต์
--
-- โครงสร้างที่ยึด
--   fabrics       = ชนิดผ้าหนึ่งชนิด พร้อมข้อดีข้อเสียและส่วนผสม
--   fabric_sizes  = ราคาและสัดส่วน อก-ยาว ของผ้าชนิดนั้นแยกตามไซส์
--   skus          = ของจริงที่ถือไว้ในคลัง คือ ผ้า × สี × ไซส์ อ้างกลับไปที่ fabrics
--
-- เกรดในเอกสาร (A/B/C) คือคุณภาพเนื้อผ้า ส่วนกลุ่มผ้าเดิม (A–D) คือนโยบายสต็อก
-- คนละเรื่องกัน จึงเก็บแยกคอลัมน์
-- ============================================================================

create table if not exists fabrics (
  code         text primary key,
  name         text not null,
  name_th      text not null,
  grade        text not null check (grade in ('A','B','C')),
  usage_th     text not null check (usage_th in ('งานแบรนด์','งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก')),
  composition  text not null,
  gsm          int,
  stock_group  text not null default 'C' check (stock_group in ('A','B','C','D')),
  intro        text,
  pros         text[] not null default '{}',
  cons         text[] not null default '{}',
  sort_order   int not null default 0,
  status       text not null default 'Active' check (status in ('Active','Discontinued')),
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists fabric_sizes (
  fabric_code text not null references fabrics(code) on delete cascade,
  size        text not null check (size in ('S','M','L','XL','2XL','3XL')),
  chest_in    numeric,
  length_in   numeric,
  price       numeric not null,
  is_quoted   boolean not null default true,
  primary key (fabric_code, size)
);

alter table skus add column if not exists fabric_code text references fabrics(code);
alter table skus add column if not exists chest_in numeric;
alter table skus add column if not exists length_in numeric;

do $$
declare t text;
begin
  foreach t in array array['fabrics','fabric_sizes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================================
-- ชนิดผ้าทั้งหมดจากตารางราคา
-- ============================================================================
insert into fabrics (code, name, name_th, grade, usage_th, composition, gsm, stock_group,
                     intro, pros, cons, sort_order) values

 ('CB20OVS', 'Cotton 100% / Comb 20 OVS', 'ผ้าคอตตอนหวี เบอร์ 20 ทรงโอเวอร์ไซส์',
  'A', 'งานแบรนด์', 'Cotton 100%', null, 'A',
  'ผ้าคอตตอน 100% ที่ผ่านกระบวนการ "หวี" (Comb) เส้นด้ายเบอร์ 20 ให้เนื้อผ้าหนาพอสมควรแต่ยังคงความเนียนนุ่ม เหมาะกับทรงเสื้อโอเวอร์ไซส์',
  array['ผ่านการหวีเส้นใย ได้เนื้อผ้านุ่ม เนียน มัน เงา ขนน้อยที่สุดในกลุ่มคอตตอน',
        'เหนียว ทนทาน ขาดยาก สีย้อมสม่ำเสมอ เหมาะกับงานแบรนด์ที่เน้นคุณภาพ',
        'เส้นด้ายเบอร์ 20 ให้เนื้อผ้าหนา อยู่ทรงดี เหมาะกับเสื้อโอเวอร์ไซส์'],
  array['ราคาสูงที่สุดในกลุ่มคอตตอนเนื่องจากกระบวนการผลิตซับซ้อนกว่า',
        'นุ่มน้อยกว่าเส้นด้ายเบอร์เล็ก (เช่น 30/32) เพราะเส้นใยหนาแน่นกว่า'], 1),

 ('CB20FADE', 'Cotton 100% / Comb 20 OVS FADE', 'ผ้าเดียวกับข้อ 1 ผ่านการฟอกซีด (FADE WASH)',
  'A', 'งานแบรนด์', 'Cotton 100%', null, 'D',
  'เนื้อผ้าคอตตอนหวีเบอร์ 20 แบบเดียวกับข้อ 1 แต่ผ่านกระบวนการฟอก/ล้างเพิ่มเติมเพื่อให้สีซีดลงแบบวินเทจ ให้ลุคที่ผ่านการสวมใส่มาแล้ว',
  array['ได้ลุควินเทจ สีซีดไม่จัดจ้าน เหมาะกับแบรนด์แฟชั่นสตรีทแวร์',
        'คุณสมบัติเนื้อผ้าพื้นฐานยังคงนุ่ม เนียน เหมือนผ้า Comb 20 ปกติ'],
  array['ราคาสูงกว่ารุ่นไม่ฟอกซีด เพราะมีขั้นตอนการผลิตเพิ่ม',
        'สีของแต่ละตัวอาจไม่เท่ากันเล็กน้อยตามธรรมชาติของการฟอก'], 2),

 ('CLOUD', 'Cotton 50% / Polyester 50% — Cloud Tech', 'ผ้าผสมคอตตอน-โพลีเอสเตอร์ อัตราส่วน 50/50',
  'A', 'งานแบรนด์', 'Cotton 50% / Polyester 50%', null, 'B',
  'ผ้าผสมระหว่างเส้นใยธรรมชาติ (คอตตอน) และเส้นใยสังเคราะห์ (โพลีเอสเตอร์) ในอัตราส่วนเท่ากัน เพื่อรวมจุดเด่นของทั้งสองวัสดุเข้าด้วยกัน',
  array['มีความยืดหยุ่นสูง เนื้อผ้านุ่มแน่นแต่บางเบา สวมใส่สบาย',
        'คงรูปดี ไม่หดตัวง่าย ซักและรีดง่ายกว่าผ้าคอตตอน 100%',
        'แห้งเร็ว เหมาะกับเสื้อที่ต้องซักบ่อยหรือใช้งานกลางแจ้ง'],
  array['ดูดซับความชื้น/เหงื่อได้น้อยกว่าคอตตอน 100% เพราะโพลีเอสเตอร์ไม่ชอบน้ำ',
        'อาจเกิดขุยได้หากใช้งานหนักและซักบ่อยครั้งเป็นเวลานาน',
        'ระบายอากาศได้น้อยกว่าผ้าฝ้ายแท้ รู้สึกร้อนกว่าเล็กน้อยในวันอากาศร้อนจัด'], 3),

 ('SLUB', 'Cotton 100% / Slub 100', 'ผ้าเส้นด้ายปุ่ม (SLUB YARN) ผิวสัมผัสไม่เรียบเนียนโดยตั้งใจ',
  'A', 'งานแบรนด์', 'Cotton 100%', null, 'A',
  'Slub คือเส้นด้ายที่ปั่นให้มีขนาดไม่สม่ำเสมอโดยตั้งใจ เมื่อทอเป็นผืนผ้าจะได้ผิวสัมผัสเป็นปุ่มเล็ก ๆ ทั่วเนื้อผ้า ให้ลุคดิบเท่ เป็นเอกลักษณ์',
  array['ผิวผ้ามีลายเนื้อเป็นเอกลักษณ์ ให้ลุคแฟชั่น/ลำลองที่ดูมีมิติ',
        'ผ้าน้ำหนักไม่มาก ระบายอากาศดี ราคาย่อมเยา'],
  array['ผิวผ้าไม่เรียบเนียนสม่ำเสมอ ไม่เหมาะกับงานพิมพ์ลายที่ต้องการความคมชัดสูง',
        'ปุ่มเนื้อผ้าที่เกิดจากเส้นใยไม่สม่ำเสมออาจถูกมองว่าเป็นตำหนิได้หากไม่ชอบสไตล์นี้'], 4),

 ('CB30', 'Cotton 100% / Comb 30', 'ผ้าคอตตอนหวี เส้นด้ายเบอร์ 30',
  'A', 'งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก', 'Cotton 100%', null, 'C',
  'ผ้าคอตตอนหวีเบอร์ 30 ถูกพัฒนาขึ้นเพื่อแก้ปัญหาการหดตัวและความบางที่พบในผ้า Semi 32 โดยยังคงความนุ่มของกระบวนการหวีไว้',
  array['หนากว่าเนื้อผ้าเบอร์ 32 เล็กน้อย ไม่บางจนเกินไป แต่ยังนุ่มสวมใส่สบาย',
        'หดตัวและย้วยน้อยกว่าผ้า Semi เมื่อผ่านการซักซ้ำหลายครั้ง ทรงเสื้อคงอยู่ได้ดี'],
  array['ราคาสูงกว่าผ้า Semi และ OE เพราะผ่านกระบวนการหวีเส้นใย'], 5),

 ('SP32', 'Cotton 100% / 32 SoftPlus', 'ผ้าคอตตอนหวีเบอร์ 32 ผ่านกระบวนการ FINISHING เพิ่มความนุ่ม',
  'A', 'งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก', 'Cotton 100%', null, 'A',
  'ผ้าคอตตอนหวีเบอร์ 32 ที่ผ่านขั้นตอน Finishing เพิ่มเติมเพื่อเพิ่มความนุ่มเนียนเป็นพิเศษ ให้สัมผัสนุ่มขึ้นกว่าคอตตอนหวีปกติ',
  array['ผ่านกระบวนการ Finishing พิเศษ ให้เนื้อผ้านุ่มเนียน สวมใส่สบายยิ่งขึ้น',
        'ไม่หด ไม่ย้วยง่าย เหมาะกับเสื้อที่ต้องการความคงทนของทรง'],
  array['ราคาสูงกว่าคอตตอนหวีเบอร์ 30/32 ทั่วไป เพราะมีขั้นตอนการผลิตเพิ่มขึ้น'], 6),

 ('CB20', 'Cotton 100% / Comb 20', 'ผ้าคอตตอนหวี เส้นด้ายเบอร์ 20 (ไม่ใช่ทรงโอเวอร์ไซส์)',
  'A', 'งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก', 'Cotton 100%', null, 'C',
  'ผ้าคอตตอนหวีเบอร์ 20 มาตรฐาน เส้นด้ายขนาดใหญ่ ให้เนื้อผ้าหนากว่าเบอร์ 30/32 แต่ยังคงคุณสมบัติของผ้าหวีคุณภาพดี',
  array['เนื้อผ้าหนา อยู่ทรงดี ทนทาน เหมาะกับงานพิมพ์สกรีนที่ต้องการความหนาแน่นของผ้า',
        'ยังคงความนุ่มเงาจากกระบวนการหวี ดีกว่าผ้า Semi และ OE'],
  array['นุ่มน้อยกว่าเส้นด้ายเบอร์เล็ก (30/32) เพราะเส้นใยหนาแน่นกว่า สวมใส่สบายน้อยกว่าเล็กน้อย'], 7),

 ('SEMI30', 'Cotton 100% / Semi 30', 'ผ้าคอตตอนเซมิ เส้นด้ายเบอร์ 30',
  'B', 'งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก', 'Cotton 100%', null, 'C',
  'ผ้าคอตตอนเซมิผลิตด้วยวิธีสางเส้นใย (ไม่ผ่านการหวี) ได้เส้นด้ายคุณภาพระดับกลาง เป็นผ้าที่นิยมมากที่สุดในตลาดเพราะราคาย่อมเยาและคุณภาพใช้ได้ดี',
  array['คุณภาพดีกว่า OE เนื้อผ้าไม่หยาบกระด้างจนเกินไป ราคาไม่แพง เหมาะกับงบประมาณจำกัด',
        'เป็นที่นิยมและหาซื้อได้ทั่วไป เหมาะกับงานสกรีนจำนวนมาก'],
  array['หดตัวค่อนข้างมากเมื่อผ่านการซักซ้ำหลายครั้ง ทำให้ทรงเสื้อเสียรูปได้ง่าย',
        'เนื้อผ้าค่อนข้างบาง ผิวสัมผัสไม่นุ่มเท่าเกรด Comb'], 8),

 ('SEMI32', 'Cotton 100% / Semi 32', 'ผ้าคอตตอนเซมิ เส้นด้ายเบอร์ 32',
  'B', 'งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก', 'Cotton 100%', null, 'C',
  'ผ้าคอตตอนเซมิเบอร์ 32 บางกว่าเบอร์ 30 เล็กน้อย เนื้อผ้าเนียนขึ้นเล็กน้อยแต่คุณสมบัติโดยรวมใกล้เคียงกับ Semi 30',
  array['ระบายอากาศดีเยี่ยม เนื้อผ้าบางเบา สวมใส่สบายในวันที่อากาศร้อน',
        'ราคาย่อมเยา คุ้มค่าสำหรับงานที่ต้องสั่งจำนวนมาก'],
  array['หดตัวเยอะเมื่อซักหลายครั้ง ทรงเสื้อเสียรูปได้ ไม่เหมาะกับการใช้ซ้ำระยะยาว',
        'เนื้อผ้าบางและผิวสัมผัสไม่นุ่มเท่าคอตตอนหวี'], 9),

 ('OE20', 'Cotton 100% / OE 20', 'ผ้าคอตตอน OPEN-END เส้นด้ายเบอร์ 20',
  'C', 'งานอีเวนต์ / สปอนเซอร์ / เสื้อแจก', 'Cotton 100%', 185, 'C',
  'ผ้าคอตตอนที่ผลิตด้วยวิธี Open-End (OE) ไม่ผ่านกระบวนการคัดคุณภาพเส้นใยเหมือน Comb หรือ Semi ทำให้เป็นผ้าเกรดเริ่มต้นที่ราคาถูกที่สุด น้ำหนักผ้าประมาณ 180-190 กรัม/ตร.ม.',
  array['ราคาถูกที่สุดในทุกเกรด เหมาะกับงบจำกัดหรือสั่งผลิตจำนวนมาก',
        'เนื้อผ้าหนา กระด้าง อยู่ทรงดี ย้อมด้วยสีไร้กำมะถัน ไม่ระคายเคืองผิว'],
  array['ไม่ผ่านการคัดคุณภาพเส้นใย ทำให้มีขนผ้าและปมเส้นด้ายมากกว่าเกรดอื่น',
        'ผิวสัมผัสกระด้างกว่า ไม่นุ่มเท่าคอตตอน Semi หรือ Comb'], 10)

on conflict (code) do nothing;

-- ============================================================================
-- ราคาและสัดส่วนแยกตามไซส์
-- ============================================================================
insert into fabric_sizes (fabric_code, size, chest_in, length_in, price) values
 ('CB20OVS','M',40,28,120), ('CB20OVS','L',44,30,130), ('CB20OVS','XL',48,31,140), ('CB20OVS','2XL',52,32,160),
 ('CB20FADE','M',40,28,160), ('CB20FADE','L',44,30,170), ('CB20FADE','XL',48,31,180), ('CB20FADE','2XL',52,32,190),
 ('CLOUD','S',38,27,105), ('CLOUD','M',40,28,115), ('CLOUD','L',42,29,125),
 ('CLOUD','XL',44,30,135), ('CLOUD','2XL',46,31,145),
 ('SLUB','S',38,27,85), ('SLUB','M',40,28,90), ('SLUB','L',42,29,100),
 ('SLUB','XL',44,30,110), ('SLUB','2XL',46,31,125),
 ('CB30','S',32,25,70), ('CB30','M',40,28,75), ('CB30','L',44,30,80),
 ('CB30','XL',48,31,90), ('CB30','2XL',52,32,105),
 ('SP32','S',32,25,95), ('SP32','M',40,28,105), ('SP32','L',44,30,115),
 ('SP32','XL',48,31,125), ('SP32','2XL',52,32,150),
 ('CB20','S',32,25,95), ('CB20','M',40,28,100), ('CB20','L',44,30,105),
 ('CB20','XL',48,31,110), ('CB20','2XL',52,32,115),
 ('SEMI30','S',32,25,55), ('SEMI30','M',40,28,65), ('SEMI30','L',44,30,70),
 ('SEMI30','XL',48,31,80), ('SEMI30','2XL',52,32,100),
 ('SEMI32','S',32,25,60), ('SEMI32','M',40,28,65), ('SEMI32','L',44,30,70),
 ('SEMI32','XL',48,31,80), ('SEMI32','2XL',52,32,100),
 ('OE20','S',32,25,50), ('OE20','M',40,28,55), ('OE20','L',44,30,60),
 ('OE20','XL',48,31,65), ('OE20','2XL',52,32,70)
on conflict (fabric_code, size) do nothing;

-- ไซส์ 3XL ผู้ขายยังไม่ให้ราคามา ระบบประมาณจากส่วนต่าง XL → 2XL ไว้ก่อน
insert into fabric_sizes (fabric_code, size, chest_in, length_in, price, is_quoted)
select f.code, '3XL',
       s2.chest_in + (s2.chest_in - sx.chest_in),
       s2.length_in + (s2.length_in - sx.length_in),
       s2.price + (s2.price - sx.price),
       false
from fabrics f
join fabric_sizes s2 on s2.fabric_code = f.code and s2.size = '2XL'
join fabric_sizes sx on sx.fabric_code = f.code and sx.size = 'XL'
where f.code in ('CB20OVS','CB30','CB20','SEMI30','OE20')
on conflict (fabric_code, size) do nothing;

-- ============================================================================
-- ผูก SKU เดิมเข้ากับชนิดผ้าจริง แล้วปรับต้นทุนให้ตรงตารางราคา
-- ============================================================================
do $$
begin
  update skus set fabric_code = 'CB30'     where code like 'A01-BLK-%' or code like 'A01-WHT-%' or code like 'A01-GRY-%';
  update skus set fabric_code = 'CB20FADE' where code like 'A01-FDE-%';
  update skus set fabric_code = 'CLOUD'    where code like 'B02-%';
  update skus set fabric_code = 'SEMI30'   where code like 'C01-%';
  update skus set fabric_code = 'SLUB'     where code = 'D01-CRM-L';
  update skus set fabric_code = 'CB20OVS'  where code = 'D03-NVY-XL';

  update skus s set
    fabric_name  = f.name_th,
    fabric_group = f.stock_group,
    gsm          = f.gsm
  from fabrics f where f.code = s.fabric_code;

  update skus s set
    cost      = fs.price,
    chest_in  = fs.chest_in,
    length_in = fs.length_in,
    remark    = case when fs.is_quoted then s.remark
                     else 'ราคา 3XL ยังไม่ได้ยืนยันกับร้าน ระบบประมาณให้ก่อน' end
  from fabric_sizes fs
  where fs.fabric_code = s.fabric_code and fs.size = s.size;

  update skus set lead_time_hours = case fabric_group
    when 'A' then 3 when 'B' then 48 when 'C' then 3 else 240 end
  where fabric_code is not null;
end $$;

-- ============================================================================
-- SKU ที่ควรมีให้ครบตามผ้าที่สั่งประจำ
-- ============================================================================
insert into skus (code, fabric_code, fabric_group, fabric_name, gsm, color_name, color_hex, size,
                  cost, chest_in, length_in, stock_policy, qty_on_hand, qty_allocated,
                  reorder_point, safety_stock, lead_time_hours, status)
select
  f.code || '-' || c.abbr || '-' || fs.size,
  f.code, f.stock_group, f.name_th, f.gsm, c.nm, c.hex, fs.size,
  fs.price, fs.chest_in, fs.length_in,
  case when f.stock_group in ('A','C') then 'สต็อกลอย' else 'สต็อกจริง' end,
  0, 0,
  case when fs.size in ('M','L','XL') then 24 else 12 end,
  case when fs.size in ('M','L','XL') then 12 else 6 end,
  case f.stock_group when 'A' then 3 when 'B' then 48 when 'C' then 3 else 240 end,
  'Active'
from fabrics f
join fabric_sizes fs on fs.fabric_code = f.code and fs.is_quoted
cross join (values
  ('BLK','ดำ','#0A0A0A'),
  ('WHT','ขาว','#F5F4F2'),
  ('GRY','เทาท็อป','#9A9A9A')
) as c(abbr, nm, hex)
where f.code in ('CB30','CB20','SEMI30','OE20')
on conflict (code) do nothing;

-- ============================================================================
-- วิว
-- ============================================================================
create or replace view fabric_catalog_view with (security_invoker = true) as
select
  f.*,
  (select count(*) from fabric_sizes fs where fs.fabric_code = f.code)             as size_count,
  (select min(fs.price) from fabric_sizes fs where fs.fabric_code = f.code)        as price_min,
  (select max(fs.price) from fabric_sizes fs where fs.fabric_code = f.code)        as price_max,
  (select count(*) from skus s where s.fabric_code = f.code)                        as sku_count,
  (select coalesce(sum(s.qty_on_hand), 0) from skus s where s.fabric_code = f.code) as qty_on_hand
from fabrics f;

-- วิว skus_view ถูกสร้างไว้ก่อนจะมีคอลัมน์ใหม่ ต้องสร้างซ้ำให้เห็นคอลัมน์ที่เพิ่งเพิ่ม
drop view if exists skus_view;
create or replace view skus_view with (security_invoker = true) as
  select s.*, (s.qty_on_hand - s.qty_allocated) as qty_available,
         f.grade as fabric_grade, f.name as fabric_full_name
  from skus s left join fabrics f on f.code = s.fabric_code;

-- ของทั้งคลังในมุมเดียว
create or replace view stock_all_view with (security_invoker = true) as
select 'เสื้อเปล่า'::text as kind, code, fabric_name || ' ' || color_name || ' ' || size as name,
       size, color_name, 'ตัว'::text as unit, cost, qty_on_hand, qty_allocated,
       reorder_point, status
from skus
union all
select 'วัสดุอื่น'::text, code, name, null, null, unit, cost, qty_on_hand, 0,
       reorder_point, status
from supplies;
