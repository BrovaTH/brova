-- ============================================================================
-- BROVA — 01_schema.sql : โครงสร้างฐานข้อมูลหลัก
-- รันไฟล์นี้เป็นไฟล์แรกใน Supabase SQL Editor
--
-- หลักที่ยึดทั้งระบบ
--   1. ทุกการเปลี่ยนสถานะต้องรู้ว่าใครเปลี่ยนเมื่อไร  → ตาราง status_logs
--   2. เอกสารทุกใบมีเลขที่และผูกกับเลขงาน            → ฟังก์ชัน next_code
--   3. ห้ามแก้ทับ ให้สร้าง revision ใหม่เสมอ
--   4. ต้นทุนผูกกับงาน ไม่ใช่ผูกกับเดือน
--   5. ทุกปัญหาต้องกลายเป็นความรู้                    → ตาราง knowledge
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- เลขรันเอกสาร
-- เลขเดินตามปี พ.ศ. แยกชุดตาม prefix เช่น JOB-2569-0001 · QT-2569-0001
create table if not exists counters (
  prefix text not null,
  year   int  not null,
  value  int  not null default 0,
  primary key (prefix, year)
);

create or replace function next_code(p_prefix text)
returns text language plpgsql as $$
declare
  y int := extract(year from (now() at time zone 'Asia/Bangkok'))::int + 543;
  v int;
begin
  insert into counters(prefix, year, value) values (p_prefix, y, 1)
  on conflict (prefix, year) do update set value = counters.value + 1
  returning value into v;
  return p_prefix || '-' || y || '-' || lpad(v::text, 4, '0');
end $$;

-- ---------------------------------------------------------------- ปรับตัวนับให้ตรงกับเลขที่ใช้ไปแล้ว
-- ข้อมูลตัวอย่างใส่เลขที่เอกสารไว้ตรง ๆ โดยไม่ผ่าน next_code
-- ถ้าไม่ปรับตัวนับตาม เอกสารใบแรกที่ออกจริงจะได้เลขซ้ำกับข้อมูลตัวอย่างทันที
-- เรียกฟังก์ชันนี้ทุกครั้งหลังใส่ข้อมูลที่มีเลขที่เอกสารเขียนไว้เอง
create or replace function sync_counters() returns int
language plpgsql as $$
declare
  t     text;
  tabs  text[] := array[
    'inquiries','quotations','jobs','invoices','receipts','credit_notes',
    'payments','shipments','purchase_orders','stock_counts','approvals'
  ];
  parts text[] := '{}';
  r     record;
  n     int := 0;
  sql   text;
begin
  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null then
      parts := parts || format('select code from %I where code is not null', t);
    end if;
  end loop;

  if array_length(parts, 1) is null then return 0; end if;

  sql := 'select split_part(code, ''-'', 1) as prefix, '
      || '       split_part(code, ''-'', 2)::int as year, '
      || '       max(split_part(code, ''-'', 3)::int) as v '
      || 'from (' || array_to_string(parts, ' union all ') || ') s '
      || 'where code ~ ''^[A-Z]+-[0-9]{4}-[0-9]+$'' '
      || 'group by 1, 2';

  for r in execute sql loop
    insert into counters(prefix, year, value) values (r.prefix, r.year, r.v)
    on conflict (prefix, year)
      do update set value = greatest(counters.value, excluded.value);
    n := n + 1;
  end loop;

  return n;
end $$;

-- ---------------------------------------------------------------- ผู้ใช้และสิทธิ์
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  full_name    text not null default 'ผู้ใช้ใหม่',
  email        text,
  role         text not null default 'owner'
               check (role in ('owner','sales','design','production','qc','warehouse','finance','affiliate')),
  bu_access    text[] not null default array['BU1','BU2','BU3','BU4'],
  can_see_cost boolean not null default false,
  phone        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- คนแรกที่สมัครได้สิทธิ์เจ้าของและเห็นต้นทุน คนถัดไปเริ่มที่ฝ่ายขาย
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from profiles;
  insert into profiles(id, full_name, email, role, can_see_cost)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.email,
          case when n = 0 then 'owner' else 'sales' end,
          n = 0);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------- หน่วยธุรกิจ
create table if not exists business_units (
  code                 text primary key,
  name                 text not null,
  scope                text,
  transfer_price_rule  text default 'ต้นทุนจริง + 10%',
  target_revenue_month numeric default 0
);

-- ---------------------------------------------------------------- ลูกค้า
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  name          text not null,
  type          text not null default 'บุคคลธรรมดา'
                check (type in ('บุคคลธรรมดา','นิติบุคคล','หน่วยงานราชการ')),
  tax_id        text,
  contact_name  text,
  phone         text,
  line_id       text,
  email         text,
  address_bill  text,
  address_ship  text,
  source        text default 'LINE',
  credit_terms  text default 'มัดจำ 50%',
  credit_days   int not null default 0,
  credit_limit  numeric not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- ซัพพลายเออร์
create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  name            text not null,
  contact         text,
  phone           text,
  fabric_groups   text[] default '{}',
  lead_time_hours int default 72,
  payment_terms   text default 'เงินสด',
  rating          int default 3 check (rating between 1 and 5),
  note            text
);

-- ---------------------------------------------------------------- สินค้า (SKU)
-- รหัส [กลุ่ม][รุ่น2หลัก]-[สี3ตัว]-[ไซส์] เช่น A01-BLK-L · ห้ามใช้ XXL ให้ใช้ 2XL
create table if not exists skus (
  code             text primary key,
  fabric_group     text not null check (fabric_group in ('A','B','C','D')),
  fabric_name      text not null,
  gsm              int,
  color_name       text not null,
  color_hex        text default '#000000',
  size             text not null check (size in ('S','M','L','XL','2XL','3XL')),
  cost             numeric not null default 0,
  stock_policy     text not null default 'สต็อกจริง' check (stock_policy in ('สต็อกจริง','สต็อกลอย')),
  qty_on_hand      int not null default 0,
  qty_allocated    int not null default 0,
  reorder_point    int not null default 0,
  safety_stock     int not null default 0,
  supplier_primary uuid references suppliers(id),
  lead_time_hours  int not null default 3,
  status           text not null default 'Active' check (status in ('Active','Watch','Discontinued')),
  remark           text,
  created_at       timestamptz not null default now()
);

create or replace view skus_view with (security_invoker = true) as
  select *, (qty_on_hand - qty_allocated) as qty_available from skus;

-- ---------------------------------------------------------------- บรีฟ / คำขอราคา
-- สามช่องบรีฟเป็นช่องบังคับตามสเปก ใครใส่ / ใส่ที่ไหน / ใส่นานแค่ไหน
create table if not exists inquiries (
  id                uuid primary key default gen_random_uuid(),
  code              text unique,
  customer_id       uuid references customers(id) on delete set null,
  channel           text default 'LINE',
  brief_who         text,
  brief_where       text,
  brief_duration    text,
  qty_estimate      int default 0,
  budget_per_unit   numeric default 0,
  deadline          date,
  recommended_fabric_group text,
  status            text not null default 'ใหม่'
                    check (status in ('ใหม่','กำลังเสนอราคา','ปิดการขาย','ไม่สนใจ')),
  note              text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- ใบเสนอราคา
create table if not exists quotations (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,
  inquiry_id     uuid references inquiries(id) on delete set null,
  customer_id    uuid references customers(id) on delete set null,
  bu_code        text references business_units(code),
  rev_no         int not null default 1,
  rev_reason     text,
  status         text not null default 'Draft'
                 check (status in ('Draft','Sent','Accepted','Rejected','Expired','Superseded')),
  issued_at      date,
  valid_until    date,
  lead_time_days int default 10,
  deposit_pct    int default 50,
  discount       numeric not null default 0,
  vat_pct        numeric not null default 0,
  wht_pct        numeric not null default 0,
  excluded_items text,
  note           text,
  created_at     timestamptz not null default now()
);

create table if not exists quote_items (
  id              uuid primary key default gen_random_uuid(),
  quotation_id    uuid not null references quotations(id) on delete cascade,
  sku_code        text references skus(code),
  description     text,
  technique       text not null default 'DTF',
  print_positions text[] default '{}',
  colors          int not null default 1,
  qty_s           int not null default 0,
  qty_m           int not null default 0,
  qty_l           int not null default 0,
  qty_xl          int not null default 0,
  qty_2xl         int not null default 0,
  qty_3xl         int not null default 0,
  unit_cost       numeric not null default 0,
  unit_price      numeric not null default 0
);

-- ---------------------------------------------------------------- งาน (ตารางแกน)
create table if not exists jobs (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  quotation_id   uuid references quotations(id) on delete set null,
  customer_id    uuid references customers(id) on delete set null,
  bu_code        text references business_units(code),
  title          text not null,
  status         text not null default '20',
  owner_role     text not null default 'Sales',
  qty_total      int not null default 0,
  total_amount   numeric not null default 0,
  cost_estimate  numeric not null default 0,
  payment_terms  text default 'มัดจำ 50%',
  due_date       date,
  promised_date  date,
  brief_who      text,
  brief_where    text,
  brief_duration text,
  item_description text,
  confirmed_by   text,
  confirm_evidence text,
  confirmed_at   timestamptz,
  revision_count int not null default 0,
  carrier        text,
  tracking_no    text,
  boxes          int,
  weight_kg      numeric,
  ship_cost      numeric,
  ship_photo_url text,
  shipped_at     timestamptz,
  delivered_at   timestamptz,
  track_token    text unique not null default encode(gen_random_bytes(6), 'hex'),
  hold_reason    text,
  cancel_reason  text,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists jobs_status_idx on jobs(status);

create table if not exists job_items (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  sku_code     text references skus(code),
  description  text,
  technique    text default 'DTF',
  colors       int default 1,
  qty_s        int not null default 0,
  qty_m        int not null default 0,
  qty_l        int not null default 0,
  qty_xl       int not null default 0,
  qty_2xl      int not null default 0,
  qty_3xl      int not null default 0,
  unit_cost    numeric not null default 0,
  unit_price   numeric not null default 0,
  size_locked  boolean not null default false
);

-- ---------------------------------------------------------------- ม็อคอัพและตัวอย่าง
create table if not exists mockups (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  rev_no     int not null default 1,
  file_url   text,
  size_cm    text,
  note       text,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists samples (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  kind       text default 'ตัวอย่างงานพิมพ์',
  result     text,
  note       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- ผลิตและ QC
create table if not exists production_logs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  step          text not null,
  qty_in        int not null default 0,
  qty_out       int not null default 0,
  qty_defect    int not null default 0,
  defect_reason text,
  machine       text,
  by_user       text,
  created_at    timestamptz not null default now()
);

create table if not exists qc_records (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references jobs(id) on delete cascade,
  checked_qty    int not null default 0,
  pass_qty       int not null default 0,
  fail_reasons   text,
  wash_test_done boolean not null default false,
  photo_url      text,
  result         text not null default 'ผ่าน' check (result in ('ผ่าน','ส่งซ่อม','ไม่ผ่าน')),
  by_user        text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- สต็อก
-- ตัดสองจังหวะ: "จอง" ลดเฉพาะพร้อมใช้ · "ตัดจ่าย" ลดของจริง
create table if not exists stock_movements (
  id          uuid primary key default gen_random_uuid(),
  sku_code    text not null references skus(code),
  type        text not null check (type in ('รับเข้า','จอง','ตัดจ่าย','คืน','ปรับปรุง','ตัดของเสีย')),
  qty         int not null,
  ref_type    text,
  ref_no      text,
  qty_before  int,
  qty_after   int,
  reason_code text not null default 'ผลิตปกติ',
  remark      text,
  by_user     text,
  created_at  timestamptz not null default now()
);

create table if not exists purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  supplier_id uuid references suppliers(id),
  job_id      uuid references jobs(id) on delete set null,
  total       numeric not null default 0,
  ordered_at  timestamptz not null default now(),
  expected_at date,
  received_at timestamptz,
  status      text not null default 'Draft'
              check (status in ('Draft','Ordered','Partial','Received','Cancelled')),
  note        text
);

-- ---------------------------------------------------------------- การเงิน
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  job_id      uuid references jobs(id) on delete cascade,
  invoice_id  uuid,
  type        text not null default 'มัดจำ' check (type in ('มัดจำ','ยอดคงเหลือ','คืนเงิน','ค่าปรับ')),
  method      text not null default 'โอน',
  amount      numeric not null,
  wht_amount  numeric not null default 0,
  slip_url    text,
  slip_ref    text,
  paid_at     timestamptz not null default now(),
  by_user     text,
  note        text
);

-- ---------------------------------------------------------------- จัดส่ง
create table if not exists shipments (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,
  job_id       uuid not null references jobs(id) on delete cascade,
  carrier      text,
  tracking_no  text,
  boxes        int default 1,
  weight_kg    numeric,
  cost         numeric default 0,
  photo_url    text,
  status       text not null default 'ส่งแล้ว' check (status in ('เตรียมส่ง','ส่งแล้ว','ถึงแล้ว','ตีกลับ','สูญหาย')),
  shipped_at   timestamptz,
  delivered_at timestamptz,
  note         text
);

-- ---------------------------------------------------------------- หลังการขาย
create table if not exists feedback (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  score         int check (score between 1 and 10),
  comment       text,
  coupon_code   text,
  coupon_used   boolean not null default false,
  coupon_expire date,
  created_at    timestamptz not null default now()
);

create table if not exists affiliates (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,
  name       text not null,
  phone      text,
  gp_pct     numeric not null default 25,
  status     text not null default 'Active',
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists affiliate_orders (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  job_id       uuid references jobs(id) on delete set null,
  amount       numeric not null default 0,
  gp_amount    numeric not null default 0,
  settled      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- คลังความรู้
create table if not exists knowledge (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,
  title        text not null,
  symptom      text,
  root_cause   text,
  action_taken text,
  prevention   text,
  tags         text[] default '{}',
  job_id       uuid references jobs(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- บันทึกการเปลี่ยนสถานะ
create table if not exists status_logs (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  gate_passed  text,
  gate_override text,
  note         text,
  by_user      text,
  created_at   timestamptz not null default now()
);

create index if not exists status_logs_job_idx on status_logs(job_id, created_at);

-- ============================================================================
-- วิวสำหรับหน้าจอ
-- ============================================================================
create or replace view jobs_view with (security_invoker = true) as
select
  j.*,
  c.name as customer_name,
  c.type as customer_type,
  c.phone as customer_phone,
  coalesce(p.paid, 0)                              as paid_amount,
  greatest(j.total_amount - coalesce(p.paid, 0), 0) as outstanding,
  (j.total_amount - j.cost_estimate)                as gross_profit,
  case when j.total_amount > 0
       then round((j.total_amount - j.cost_estimate) / j.total_amount * 100, 1)
       else 0 end                                   as gross_margin_pct,
  case when j.due_date is null then null
       else (current_date - j.due_date) end         as overdue_days
from jobs j
left join customers c on c.id = j.customer_id
left join (
  select job_id, sum(amount) as paid from payments
  where type in ('มัดจำ','ยอดคงเหลือ') group by job_id
) p on p.job_id = j.id;

-- ============================================================================
-- หน้าติดตามงานของลูกค้า — เปิดได้โดยไม่ต้องล็อกอิน
-- คืนเฉพาะฟิลด์ที่ปลอดภัย ไม่มีต้นทุน กำไร ซัพพลายเออร์ หรือบันทึกภายใน
-- ============================================================================
create or replace function get_job_tracking(p_token text)
returns table (
  code text, title text, status text, customer_name text,
  qty_total int, promised_date date, created_at timestamptz,
  carrier text, tracking_no text, shipped_at timestamptz, delivered_at timestamptz
)
language sql security definer set search_path = public stable as $$
  -- คืนเฉพาะฟิลด์ที่ลูกค้าเห็นได้
  -- ห้ามเติมต้นทุน กำไร ชื่อโรงงาน หรือบันทึกภายในลงในรายการนี้เด็ดขาด
  select j.code, j.title, j.status, c.name, j.qty_total,
         j.promised_date, j.created_at,
         j.carrier, j.tracking_no, j.shipped_at, j.delivered_at
  from jobs j left join customers c on c.id = j.customer_id
  where j.track_token = p_token
$$;

create or replace function get_job_timeline(p_token text)
returns table (to_status text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select s.to_status, s.created_at
  from status_logs s
  join jobs j on j.id = s.job_id
  where j.track_token = p_token
  order by s.created_at
$$;

revoke all on function get_job_tracking(text) from public;
revoke all on function get_job_timeline(text) from public;
grant execute on function get_job_tracking(text) to anon, authenticated;
grant execute on function get_job_timeline(text) to anon, authenticated;
