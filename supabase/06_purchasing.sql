-- ============================================================================
-- BROVA — 06_purchasing.sql : ใบสั่งซื้อจากซัพพลายเออร์ และการนับสต็อกรอบ
-- รันต่อจาก 05_editor.sql
--
-- มาแทนสองชีตที่ใช้อยู่
--   ชีตเสื้อเปล่า  — ชื่อร้าน / order / ไซส์ / สี / จำนวน / นำไปใช้ / เหลือ / สถานะจัดส่ง / วันที่ได้รับ
--   ชีตของอื่น     — ชื่อร้าน / order / ยืนยันแบบ / จำนวนสั่ง / เหลือ / สถานะจัดส่ง / วันที่ได้รับ
--   ทั้งสองชีตมีคอลัมน์ "เช็ค Stock ครั้งที่ N" ซึ่งกลายมาเป็นใบนับสต็อกในไฟล์นี้
--
-- หลักที่ยึด
--   1. "เหลือ" ไม่ต้องกรอกเอง ระบบคิดจากยอดรับเข้าลบยอดที่ตัดจ่ายออกไป
--   2. รับของครั้งเดียวหรือทยอยรับก็ได้ ทุกครั้งเดินผ่าน stock_movements เสมอ
--   3. นับสต็อกนับรวมทั้งคลังแยกไซส์-สี ไม่ต้องแยกว่ามาจากล็อตไหน
--   4. ปิดรอบนับแล้วส่วนต่างจะกลายเป็นรายการปรับปรุง ตรวจย้อนหลังได้ว่าใครปรับ
-- ============================================================================

-- ---------------------------------------------------------------- วัสดุที่ไม่ใช่เสื้อ
-- ถุงแก้ว ป้ายแขวน กล่อง เทป — ของที่ไม่มีไซส์และสี จึงไม่เข้าตาราง skus
create table if not exists supplies (
  code          text primary key,
  name          text not null,
  category      text not null default 'บรรจุภัณฑ์'
                check (category in ('บรรจุภัณฑ์','ป้ายและสติกเกอร์','วัสดุผลิต','บริการ','อื่น ๆ')),
  unit          text not null default 'ชิ้น',
  cost          numeric not null default 0,
  qty_on_hand   int not null default 0,
  reorder_point int not null default 0,
  status        text not null default 'Active' check (status in ('Active','Discontinued')),
  remark        text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- สมุดเดินสต็อกรับวัสดุอื่นด้วย
alter table stock_movements alter column sku_code drop not null;
alter table stock_movements add column if not exists supply_code text references supplies(code);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_move_one_target') then
    alter table stock_movements add constraint stock_move_one_target check (
      (sku_code is not null and supply_code is null) or
      (sku_code is null and supply_code is not null)
    );
  end if;
end $$;

-- ---------------------------------------------------------------- ใบสั่งซื้อ
alter table purchase_orders add column if not exists supplier_name text;
alter table purchase_orders add column if not exists title text;
alter table purchase_orders add column if not exists category text not null default 'เสื้อเปล่า';
alter table purchase_orders add column if not exists confirmed_at date;
alter table purchase_orders add column if not exists note_receive text;
alter table purchase_orders add column if not exists created_by text;
alter table purchase_orders add column if not exists cancelled_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'po_category_check') then
    alter table purchase_orders add constraint po_category_check
      check (category in ('เสื้อเปล่า','วัสดุอื่น','บริการ'));
  end if;
end $$;

create table if not exists purchase_order_items (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references purchase_orders(id) on delete cascade,
  seq          int not null default 1,
  sku_code     text references skus(code),
  supply_code  text references supplies(code),
  item_name    text,
  size         text,
  color_name   text,
  qty_ordered  int not null default 0 check (qty_ordered >= 0),
  qty_received int not null default 0 check (qty_received >= 0),
  unit_cost    numeric not null default 0,
  note         text,
  constraint po_item_target check (
    sku_code is not null or supply_code is not null or item_name is not null
  )
);
create index if not exists po_items_po on purchase_order_items(po_id, seq);

-- ---------------------------------------------------------------- ใบนับสต็อก
create table if not exists stock_counts (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  round_no    int not null default 1,
  count_date  date not null default (now() at time zone 'Asia/Bangkok')::date,
  scope       text not null default 'ทั้งคลัง'
              check (scope in ('ทั้งคลัง','เฉพาะเสื้อเปล่า','เฉพาะวัสดุอื่น')),
  status      text not null default 'ร่าง' check (status in ('ร่าง','ปิดแล้ว','ยกเลิก')),
  counted_by  text,
  note        text,
  closed_at   timestamptz,
  closed_by   text,
  created_at  timestamptz not null default now()
);

create table if not exists stock_count_items (
  id          uuid primary key default gen_random_uuid(),
  count_id    uuid not null references stock_counts(id) on delete cascade,
  sku_code    text references skus(code),
  supply_code text references supplies(code),
  qty_system  int not null default 0,
  qty_counted int,
  note        text,
  constraint count_item_target check (
    (sku_code is not null and supply_code is null) or
    (sku_code is null and supply_code is not null)
  )
);
create index if not exists count_items_count on stock_count_items(count_id);

-- ---------------------------------------------------------------- วิวสำหรับหน้าจอ
create or replace view purchase_orders_view with (security_invoker = true) as
select
  po.*,
  coalesce(s.name, po.supplier_name, 'ไม่ระบุร้าน')          as shop_name,
  coalesce(i.lines, 0)                                        as line_count,
  coalesce(i.qty_ordered, 0)                                  as qty_ordered,
  coalesce(i.qty_received, 0)                                 as qty_received,
  greatest(coalesce(i.qty_ordered, 0) - coalesce(i.qty_received, 0), 0) as qty_outstanding,
  coalesce(i.amount, 0)                                       as amount,
  case
    when po.status = 'Cancelled' then 'ยกเลิก'
    when po.status = 'Received'  then 'สำเร็จ'
    when po.status = 'Partial'   then 'รับบางส่วน'
    when po.status = 'Ordered'   then 'ดำเนินการ'
    else 'ร่าง'
  end                                                          as status_th,
  case
    when po.status in ('Draft','Cancelled','Received') then null
    when po.expected_at is null then null
    else (current_date - po.expected_at)
  end                                                          as overdue_days
from purchase_orders po
left join suppliers s on s.id = po.supplier_id
left join (
  select po_id, count(*) as lines, sum(qty_ordered) as qty_ordered,
         sum(qty_received) as qty_received, sum(qty_ordered * unit_cost) as amount
  from purchase_order_items group by po_id
) i on i.po_id = po.id;

create or replace view stock_counts_view with (security_invoker = true) as
select
  c.*,
  coalesce(i.lines, 0)                                          as line_count,
  coalesce(i.counted, 0)                                        as counted_lines,
  coalesce(i.lines, 0) - coalesce(i.counted, 0)                 as pending_lines,
  coalesce(i.diff_lines, 0)                                     as diff_lines,
  coalesce(i.diff_qty, 0)                                       as diff_qty
from stock_counts c
left join (
  select count_id,
         count(*) as lines,
         count(qty_counted) as counted,
         count(*) filter (where qty_counted is not null and qty_counted <> qty_system) as diff_lines,
         coalesce(sum(qty_counted - qty_system) filter (where qty_counted is not null), 0) as diff_qty
  from stock_count_items group by count_id
) i on i.count_id = c.id;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['supplies','purchase_order_items','stock_counts','stock_count_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================================
-- ข้อมูลตั้งต้น — ถอดจากชีตที่ใช้อยู่จริง
-- ============================================================================

-- ไซส์และสีที่ชีตมีแต่ยังไม่มีในระบบ
insert into skus(code, fabric_group, fabric_name, gsm, color_name, color_hex, size, cost,
                 stock_policy, qty_on_hand, reorder_point, safety_stock, lead_time_hours)
values
 ('A01-BLK-2XL','A','Comb Cotton 32',180,'ดำ','#0A0A0A','2XL',88,'สต็อกลอย',0,24,12,3),
 ('A01-BLK-3XL','A','Comb Cotton 32',180,'ดำ','#0A0A0A','3XL',94,'สต็อกลอย',0,12,6,3),
 ('A01-WHT-XL','A','Comb Cotton 32',180,'ขาว','#F5F4F2','XL',79,'สต็อกลอย',0,24,12,3),
 ('A01-WHT-2XL','A','Comb Cotton 32',180,'ขาว','#F5F4F2','2XL',85,'สต็อกลอย',0,24,12,3),
 ('A01-WHT-3XL','A','Comb Cotton 32',180,'ขาว','#F5F4F2','3XL',91,'สต็อกลอย',0,12,6,3),
 ('A01-FDE-M','A','Comb Cotton 32',180,'ฟอกเฟด','#6E6A66','M',82,'สต็อกลอย',0,24,12,3),
 ('A01-FDE-L','A','Comb Cotton 32',180,'ฟอกเฟด','#6E6A66','L',82,'สต็อกลอย',0,24,12,3),
 ('A01-FDE-XL','A','Comb Cotton 32',180,'ฟอกเฟด','#6E6A66','XL',86,'สต็อกลอย',0,24,12,3),
 ('A01-FDE-2XL','A','Comb Cotton 32',180,'ฟอกเฟด','#6E6A66','2XL',92,'สต็อกลอย',0,24,12,3)
on conflict (code) do nothing;

-- วัสดุอื่นที่ซื้อประจำ
insert into supplies(code, name, category, unit, cost, qty_on_hand, reorder_point, remark) values
 ('SUP-BAG-01','ถุงแก้วใส 12x18 นิ้ว','บรรจุภัณฑ์','ใบ',1.20,0,200,'ใส่เสื้อพับก่อนส่ง'),
 ('SUP-TAG-01','ป้ายแขวนแบรนด์ลูกค้า','ป้ายและสติกเกอร์','ใบ',0.90,0,300,'สั่งตามแบบที่ลูกค้ายืนยัน'),
 ('SUP-BOX-01','กล่องไปรษณีย์ เบอร์ D','บรรจุภัณฑ์','ใบ',9.50,40,30,null)
on conflict (code) do nothing;

-- ร้านที่สั่งประจำ
insert into suppliers(code, name, contact, phone, fabric_groups, lead_time_hours, payment_terms, rating) values
 ('SUP-004','ร้านเสื้อเปล่า','หน้าร้าน','-', array['A'], 48, 'เงินสด', 4),
 ('SUP-005','ido4idea','แอดมินเพจ','-', array['A'], 72, 'เงินสด', 4),
 ('SUP-006','ฮั่ง ซอ','หน้าร้าน','-', array[]::text[], 24, 'เงินสด', 4),
 ('SUP-007','Stand Out - Creative and Design','ทีมออกแบบ','-', array[]::text[], 168, 'โอนก่อน', 4)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- ใบสั่งซื้อจากชีต
do $$
declare
  po1 uuid; po2 uuid; po3 uuid; po4 uuid;
  s4 uuid; s5 uuid; s6 uuid; s7 uuid;
  cnt1 uuid; cnt2 uuid;
  r record;
begin
  if exists (select 1 from purchase_orders where code like 'PO-%') then return; end if;

  select id into s4 from suppliers where code = 'SUP-004';
  select id into s5 from suppliers where code = 'SUP-005';
  select id into s6 from suppliers where code = 'SUP-006';
  select id into s7 from suppliers where code = 'SUP-007';

  insert into purchase_orders(code, supplier_id, supplier_name, title, category, status,
                              ordered_at, expected_at, received_at, note_receive, created_by)
  values (next_code('PO'), s4, 'ร้านเสื้อเปล่า', 'เสื้อเปล่า Comb Cotton 32 เติมสต็อก',
          'เสื้อเปล่า', 'Received',
          now() - interval '14 days', current_date - 12, now() - interval '12 days',
          'รับครบตามใบสั่ง ตรวจหน้าร้านแล้ว', 'ระบบ')
  returning id into po1;

  insert into purchase_order_items(po_id, seq, sku_code, size, color_name, qty_ordered, qty_received, unit_cost)
  select po1, row_number() over (order by c.ord, s.ord),
         'A01-' || c.abbr || '-' || s.sz, s.sz, c.nm, 12, 12,
         (select cost from skus where code = 'A01-' || c.abbr || '-' || s.sz)
  from (values ('BLK','ดำ',1), ('FDE','ฟอกเฟด',2), ('WHT','ขาว',3)) as c(abbr, nm, ord)
  cross join (values ('M',1), ('L',2), ('XL',3), ('2XL',4)) as s(sz, ord);

  insert into purchase_orders(code, supplier_id, supplier_name, title, category, status,
                              ordered_at, expected_at, received_at, note_receive, created_by)
  values (next_code('PO'), s5, 'ido4idea (เสื้อแถม)', 'เสื้อแถมไซส์ใหญ่',
          'เสื้อเปล่า', 'Received',
          now() - interval '44 days', current_date - 40, now() - interval '40 days',
          'รับครบ', 'ระบบ')
  returning id into po2;

  insert into purchase_order_items(po_id, seq, sku_code, size, color_name, qty_ordered, qty_received, unit_cost)
  values
   (po2, 1, 'A01-BLK-XL',  'XL',  'ดำ',  10, 10, 82),
   (po2, 2, 'A01-BLK-2XL', '2XL', 'ดำ',  10, 10, 88),
   (po2, 3, 'A01-BLK-3XL', '3XL', 'ดำ',  10, 10, 94),
   (po2, 4, 'A01-WHT-2XL', '2XL', 'ขาว', 10, 10, 85),
   (po2, 5, 'A01-WHT-3XL', '3XL', 'ขาว', 10, 10, 91);

  insert into purchase_orders(code, supplier_id, supplier_name, title, category, status,
                              ordered_at, expected_at, received_at, note_receive, created_by)
  values (next_code('PO'), s6, 'ฮั่ง ซอ (ถุงแก้ว / ซื้อหน้าร้าน)', 'ถุงแก้วใส่เสื้อ',
          'วัสดุอื่น', 'Received',
          now() - interval '13 days', current_date - 13, now() - interval '13 days',
          'ซื้อหน้าร้าน รับของทันที', 'ระบบ')
  returning id into po3;

  insert into purchase_order_items(po_id, seq, supply_code, qty_ordered, qty_received, unit_cost)
  values (po3, 1, 'SUP-BAG-01', 450, 450, 1.20);

  insert into purchase_orders(code, supplier_id, supplier_name, title, category, status,
                              ordered_at, confirmed_at, expected_at, created_by)
  values (next_code('PO'), s7, 'Stand Out - Creative and Design', 'ป้ายแขวนตามแบบที่ยืนยัน',
          'วัสดุอื่น', 'Ordered',
          now() - interval '10 days', current_date - 7, current_date - 1, 'ระบบ')
  returning id into po4;

  insert into purchase_order_items(po_id, seq, supply_code, qty_ordered, qty_received, unit_cost)
  values (po4, 1, 'SUP-TAG-01', 500, 0, 0.90);

  -- เดินสต็อกให้ตรงกับของที่รับเข้ามาแล้ว
  for r in
    select i.sku_code, i.supply_code, i.qty_received, po.code as po_code, po.received_at
    from purchase_order_items i
    join purchase_orders po on po.id = i.po_id
    where i.qty_received > 0
  loop
    if r.sku_code is not null then
      update skus set qty_on_hand = qty_on_hand + r.qty_received where code = r.sku_code;
      insert into stock_movements(sku_code, type, qty, ref_type, ref_no, qty_after,
                                  reason_code, remark, by_user, created_at)
      values (r.sku_code, 'รับเข้า', r.qty_received, 'PO', r.po_code,
              (select qty_on_hand from skus where code = r.sku_code),
              'ซื้อเข้า', 'รับของตามใบสั่งซื้อ', 'ระบบ', r.received_at);
    else
      update supplies set qty_on_hand = qty_on_hand + r.qty_received where code = r.supply_code;
      insert into stock_movements(supply_code, type, qty, ref_type, ref_no, qty_after,
                                  reason_code, remark, by_user, created_at)
      values (r.supply_code, 'รับเข้า', r.qty_received, 'PO', r.po_code,
              (select qty_on_hand from supplies where code = r.supply_code),
              'ซื้อเข้า', 'รับของตามใบสั่งซื้อ', 'ระบบ', r.received_at);
    end if;
  end loop;

  -- เช็ค Stock ครั้งที่ 1 (ปิดแล้ว)
  insert into stock_counts(code, round_no, count_date, scope, status, counted_by, note,
                           closed_at, closed_by)
  values (next_code('CNT'), 1, current_date - 11, 'ทั้งคลัง', 'ปิดแล้ว', 'ทีมคลัง',
          'นับหลังรับของสองล็อต', now() - interval '11 days', 'ระบบ')
  returning id into cnt1;

  insert into stock_count_items(count_id, sku_code, qty_system, qty_counted)
  select cnt1, code, qty_on_hand,
         case code
           when 'A01-BLK-XL'  then qty_on_hand - 2
           when 'A01-FDE-2XL' then qty_on_hand + 1
           else qty_on_hand
         end
  from skus where qty_on_hand > 0 or code like 'A01-%';

  insert into stock_count_items(count_id, supply_code, qty_system, qty_counted)
  select cnt1, code, qty_on_hand, qty_on_hand from supplies;

  for r in
    select ci.sku_code, ci.qty_counted - ci.qty_system as diff
    from stock_count_items ci
    where ci.count_id = cnt1 and ci.sku_code is not null
      and ci.qty_counted is not null and ci.qty_counted <> ci.qty_system
  loop
    update skus set qty_on_hand = qty_on_hand + r.diff where code = r.sku_code;
    insert into stock_movements(sku_code, type, qty, ref_type, ref_no, qty_after,
                                reason_code, remark, by_user, created_at)
    values (r.sku_code, 'ปรับปรุง', r.diff, 'CNT',
            (select code from stock_counts where id = cnt1),
            (select qty_on_hand from skus where code = r.sku_code),
            'นับสต็อก', 'ปรับตามผลนับรอบที่ 1', 'ระบบ', now() - interval '11 days');
  end loop;

  -- เช็ค Stock ครั้งที่ 2 (กำลังนับ)
  insert into stock_counts(code, round_no, count_date, scope, status, counted_by, note)
  values (next_code('CNT'), 2, (now() at time zone 'Asia/Bangkok')::date, 'เฉพาะเสื้อเปล่า',
          'ร่าง', 'ทีมคลัง', 'รอบประจำเดือน ยังนับไม่ครบ')
  returning id into cnt2;

  insert into stock_count_items(count_id, sku_code, qty_system, qty_counted)
  select cnt2, code, qty_on_hand,
         case when code in ('A01-BLK-M','A01-BLK-L','A01-FDE-M') then qty_on_hand else null end
  from skus where code like 'A01-%';
end $$;

-- ปรับตัวนับให้ตรงกับเลขที่ที่ใบสั่งซื้อและรอบนับตัวอย่างใช้ไปแล้ว เอกสารใบจริงใบแรกจะได้ไม่เลขซ้ำ
select sync_counters();
