-- ============================================================================
-- BROVA — 04_accounting.sql : สายเอกสารบัญชี
-- รันต่อจาก 03_seed.sql
--
-- สายเอกสาร  QT → JOB → INV → PAY → RC  และแตกไป CN เมื่อต้องแก้ยอดที่รับเงินแล้ว
-- ทุกใบอ้างอิงกันด้วยคีย์จริง กดจากใบไหนก็เดินย้อนต้นทางและปลายทางได้
--
-- กฎที่ระบบบังคับจริง
--   ไม่มีสลิป บันทึกรับเงินไม่ได้        → CHECK constraint ที่ระดับฐานข้อมูล + ตรวจซ้ำที่ Server Action
--   ใบเสร็จออกอัตโนมัติ                 → รับเงิน 1 ครั้ง = ใบเสร็จ 1 ใบ
--   วางบิลซ้ำงวดเดิมไม่ได้              → งานหนึ่งงานมีบิลมัดจำ 1 ใบ และบิลยอดคงเหลือ 1 ใบ
--   รับเงินเกินยอดค้างไม่ได้             → เทียบกับ outstanding ก่อนบันทึก
--   ยอดในเอกสารเป็นภาพนิ่ง              → คัดลอกชื่อ ที่อยู่ เลขภาษี และยอด ณ วันที่ออก
--   ลบเอกสารไม่ได้                      → ยกเลิกอย่างเดียว เลขที่ที่ยกเลิกไม่ถูกใช้ซ้ำ
--   บิลที่รับเงินแล้วยกเลิกไม่ได้         → ต้องออกใบลดหนี้แทน
-- ============================================================================

-- ---------------------------------------------------------------- ข้อมูลบริษัท
create table if not exists company_settings (
  id                 int primary key default 1 check (id = 1),
  name               text not null default 'BROVA Creative Manufacturing Company Limited',
  name_th            text not null default 'บริษัท โบรวา ครีเอทีฟ แมนูแฟคเจอริ่ง จำกัด',
  tax_id             text,
  address            text default 'ยังไม่ได้กรอกที่อยู่ — แก้ที่หน้า ตั้งค่า → ข้อมูลบริษัทและภาษี',
  phone              text,
  email              text default 'hello@brova.studio',
  website            text,
  logo_url           text,
  vat_registered     boolean not null default false,
  vat_pct            numeric not null default 7,
  vat_effective_date date,
  wht_pct            numeric not null default 3,
  bank_name          text,
  bank_account_no    text,
  bank_account_name  text,
  payment_note       text default 'โอนแล้วกรุณาส่งสลิปกลับมาที่ LINE เพื่อให้เราออกใบเสร็จให้',
  updated_at         timestamptz not null default now()
);

insert into company_settings(id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- ใบวางบิล
create table if not exists invoices (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,
  job_id         uuid references jobs(id) on delete set null,
  quotation_id   uuid references quotations(id) on delete set null,
  customer_id    uuid references customers(id) on delete set null,
  type           text not null default 'มัดจำ' check (type in ('มัดจำ','ยอดคงเหลือ','เต็มจำนวน')),
  status         text not null default 'Draft'
                 check (status in ('Draft','Issued','Partially Paid','Paid','Void')),
  bill_to_name    text,
  bill_to_tax_id  text,
  bill_to_address text,
  bill_to_contact text,
  bu_code        text,
  issue_date     date not null default (now() at time zone 'Asia/Bangkok')::date,
  due_date       date,
  subtotal       numeric not null default 0,
  discount       numeric not null default 0,
  vat_pct        numeric not null default 0,
  vat_amount     numeric not null default 0,
  grand_total    numeric not null default 0,
  wht_pct        numeric not null default 0,
  wht_amount     numeric not null default 0,
  net_payable    numeric not null default 0,
  note           text,
  void_reason    text,
  voided_at      timestamptz,
  voided_by      text,
  created_by     text,
  created_at     timestamptz not null default now()
);

create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  seq         int not null default 1,
  description text not null,
  detail      text,
  qty         numeric not null default 1,
  unit        text not null default 'งวด',
  unit_price  numeric not null default 0,
  amount      numeric not null default 0
);

-- ผูก payments กลับไปที่ใบวางบิล
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_invoice_fk') then
    alter table payments add constraint payments_invoice_fk
      foreign key (invoice_id) references invoices(id) on delete set null;
  end if;
end $$;

-- ไม่มีสลิป บันทึกรับเงินไม่ได้ — บังคับถึงระดับฐานข้อมูล
-- ใส่แบบ NOT VALID ก่อนเผื่อมีข้อมูลเก่า แล้วค่อย validate
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_need_slip') then
    alter table payments add constraint payments_need_slip
      check (type in ('คืนเงิน','ค่าปรับ') or (slip_url is not null and length(btrim(slip_url)) > 0))
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------- ใบเสร็จรับเงิน
create table if not exists receipts (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  invoice_id    uuid references invoices(id) on delete set null,
  payment_id    uuid references payments(id) on delete set null,
  job_id        uuid references jobs(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  is_tax_invoice boolean not null default false,
  received_from text,
  tax_id        text,
  address       text,
  issue_date    date not null default (now() at time zone 'Asia/Bangkok')::date,
  subtotal      numeric not null default 0,
  vat_pct       numeric not null default 0,
  vat_amount    numeric not null default 0,
  grand_total   numeric not null default 0,
  wht_pct       numeric not null default 0,
  wht_amount    numeric not null default 0,
  net_received  numeric not null default 0,
  method        text default 'โอน',
  slip_url      text,
  slip_ref      text,
  wht_cert_received boolean not null default false,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- ใบลดหนี้
create table if not exists credit_notes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  invoice_id  uuid references invoices(id) on delete set null,
  job_id      uuid references jobs(id) on delete set null,
  amount      numeric not null default 0,
  reason      text not null,
  issue_date  date not null default (now() at time zone 'Asia/Bangkok')::date,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- วิว
-- ============================================================================
create or replace view invoices_view with (security_invoker = true) as
select
  i.*,
  j.code  as job_code,
  j.title as job_title,
  coalesce(p.paid, 0)                                            as paid_amount,
  coalesce(cn.credited, 0)                                       as credited_amount,
  greatest(i.grand_total - coalesce(p.paid, 0) - coalesce(cn.credited, 0), 0) as outstanding,
  case when i.status in ('Void','Draft') or i.due_date is null then 0
       when i.grand_total - coalesce(p.paid,0) - coalesce(cn.credited,0) <= 0.01 then 0
       else greatest(current_date - i.due_date, 0) end           as overdue_days
from invoices i
left join jobs j on j.id = i.job_id
left join (select invoice_id, sum(amount) as paid from payments
           where type in ('มัดจำ','ยอดคงเหลือ') group by invoice_id) p on p.invoice_id = i.id
left join (select invoice_id, sum(amount) as credited from credit_notes group by invoice_id) cn
       on cn.invoice_id = i.id;

create or replace view receipts_view with (security_invoker = true) as
select r.*, i.code as invoice_code, j.code as job_code, c.name as customer_name
from receipts r
left join invoices i on i.id = r.invoice_id
left join jobs j on j.id = r.job_id
left join customers c on c.id = r.customer_id;

-- ไล่หารายการรับเงินที่ยังไม่มีหลักฐาน
create or replace view payments_missing_slip with (security_invoker = true) as
select p.*, j.code as job_code, i.code as invoice_code
from payments p
left join jobs j on j.id = p.job_id
left join invoices i on i.id = p.invoice_id
where p.type in ('มัดจำ','ยอดคงเหลือ')
  and (p.slip_url is null or length(btrim(p.slip_url)) = 0);

-- ============================================================================
-- ข้อมูลตัวอย่าง — บิลและใบเสร็จของงานตัวอย่าง
-- ============================================================================
do $$
declare
  j1 uuid; j2 uuid; j3 uuid; j4 uuid;
  inv uuid; pay uuid;
  r record;
begin
  if exists (select 1 from invoices) then return; end if;

  select id into j1 from jobs where code = 'JOB-2569-0001';
  select id into j2 from jobs where code = 'JOB-2569-0002';
  select id into j3 from jobs where code = 'JOB-2569-0003';
  select id into j4 from jobs where code = 'JOB-2569-0004';

  -- งาน 0001 มัดจำ 50% ลูกค้านิติบุคคล จึงถูกหัก ณ ที่จ่าย 3%
  insert into invoices(code, job_id, customer_id, type, status, bill_to_name, bill_to_tax_id,
                       bill_to_address, bill_to_contact, bu_code, issue_date, due_date,
                       subtotal, grand_total, wht_pct, wht_amount, net_payable, note, created_by)
  select next_code('INV'), j1, c.id, 'มัดจำ', 'Paid', c.name, c.tax_id, c.address_bill, c.contact_name,
         'BU1', current_date - 21, current_date - 14,
         24750, 24750, 3, 742.50, 24007.50, 'มัดจำ 50% ก่อนเริ่มงาน', 'ระบบ'
  from customers c join jobs j on j.id = j1 and c.id = j.customer_id
  returning id into inv;

  insert into invoice_items(invoice_id, seq, description, detail, qty, unit, unit_price, amount)
  values (inv, 1, 'มัดจำ 50% — เสื้อยูนิฟอร์มพนักงาน 300 ตัว',
          'สกรีนซิลค์สกรีน 2 สี อกซ้าย + หลังเต็ม · ผ้า Comb Cotton 32', 1, 'งวด', 24750, 24750);

  insert into payments(code, job_id, invoice_id, type, method, amount, wht_amount,
                       slip_url, slip_ref, paid_at, by_user)
  values (next_code('PAY'), j1, inv, 'มัดจำ', 'โอน', 24750, 742.50,
          'https://drive.google.com/file/slip-deposit-0001',
          'KBank 28 ก.ค. 69 14:22 · อ้างอิง 8842103', now() - interval '20 days', 'ระบบ')
  returning id into pay;

  insert into receipts(code, invoice_id, payment_id, job_id, customer_id, received_from, tax_id,
                       address, issue_date, subtotal, grand_total, wht_pct, wht_amount,
                       net_received, method, slip_url, slip_ref, note, created_by)
  select next_code('RC'), inv, pay, j1, i.customer_id, i.bill_to_name, i.bill_to_tax_id,
         i.bill_to_address, current_date - 20, 24750, 24750, 3, 742.50, 24007.50,
         'โอน', 'https://drive.google.com/file/slip-deposit-0001',
         'KBank 28 ก.ค. 69 14:22 · อ้างอิง 8842103',
         'ผู้จ่ายเงินได้หักภาษี ณ ที่จ่ายไว้ตามจำนวนข้างต้น กรุณาส่งหนังสือรับรองการหักภาษี ณ ที่จ่ายให้ผู้รับเงิน',
         'ระบบ'
  from invoices i where i.id = inv;

  -- งาน 0002 มัดจำ 50% ลูกค้าบุคคลธรรมดา ไม่มีหัก ณ ที่จ่าย
  insert into invoices(code, job_id, customer_id, type, status, bill_to_name, bill_to_address,
                       bill_to_contact, bu_code, issue_date, due_date,
                       subtotal, grand_total, net_payable, note, created_by)
  select next_code('INV'), j2, c.id, 'มัดจำ', 'Paid', c.name, c.address_bill, c.contact_name,
         'BU1', current_date - 5, current_date + 2, 5700, 5700, 5700, 'มัดจำ 50%', 'ระบบ'
  from customers c join jobs j on j.id = j2 and c.id = j.customer_id
  returning id into inv;

  insert into invoice_items(invoice_id, seq, description, detail, qty, unit, unit_price, amount)
  values (inv, 1, 'มัดจำ 50% — เสื้อพนักงานคาเฟ่ 60 ตัว', 'ปักโลโก้อกซ้าย', 1, 'งวด', 5700, 5700);

  insert into payments(code, job_id, invoice_id, type, method, amount, slip_url, slip_ref, paid_at, by_user)
  values (next_code('PAY'), j2, inv, 'มัดจำ', 'โอน', 5700,
          'https://drive.google.com/file/slip-deposit-0002',
          'SCB 5 ส.ค. 69 09:10 · อ้างอิง 5521900', now() - interval '4 days', 'ระบบ')
  returning id into pay;

  insert into receipts(code, invoice_id, payment_id, job_id, customer_id, received_from, address,
                       issue_date, subtotal, grand_total, net_received, method, slip_url, slip_ref, created_by)
  select next_code('RC'), inv, pay, j2, i.customer_id, i.bill_to_name, i.bill_to_address,
         current_date - 4, 5700, 5700, 5700, 'โอน', 'https://drive.google.com/file/slip-deposit-0002',
         'SCB 5 ส.ค. 69 09:10 · อ้างอิง 5521900', 'ระบบ'
  from invoices i where i.id = inv;

  -- งาน 0003 มัดจำจ่ายแล้ว ยอดคงเหลือยังไม่จ่ายและเลยกำหนด
  insert into invoices(code, job_id, customer_id, type, status, bill_to_name, bill_to_address,
                       bill_to_contact, bu_code, issue_date, due_date,
                       subtotal, grand_total, net_payable, note, created_by)
  select next_code('INV'), j3, c.id, 'มัดจำ', 'Paid', c.name, c.address_bill, c.contact_name,
         'BU1', current_date - 13, current_date - 6, 13125, 13125, 13125, 'มัดจำ 50%', 'ระบบ'
  from customers c join jobs j on j.id = j3 and c.id = j.customer_id
  returning id into inv;

  insert into invoice_items(invoice_id, seq, description, detail, qty, unit, unit_price, amount)
  values (inv, 1, 'มัดจำ 50% — เสื้อชมรมถ่ายภาพ 150 ตัว', 'DTF หลังเต็ม 4 สี', 1, 'งวด', 13125, 13125);

  insert into payments(code, job_id, invoice_id, type, method, amount, slip_url, slip_ref, paid_at, by_user)
  values (next_code('PAY'), j3, inv, 'มัดจำ', 'โอน', 13125,
          'https://drive.google.com/file/slip-deposit-0003',
          'KBank 30 ก.ค. 69 16:40 · อ้างอิง 7712045', now() - interval '12 days', 'ระบบ')
  returning id into pay;

  insert into receipts(code, invoice_id, payment_id, job_id, customer_id, received_from, address,
                       issue_date, subtotal, grand_total, net_received, method, slip_url, slip_ref, created_by)
  select next_code('RC'), inv, pay, j3, i.customer_id, i.bill_to_name, i.bill_to_address,
         current_date - 12, 13125, 13125, 13125, 'โอน', 'https://drive.google.com/file/slip-deposit-0003',
         'KBank 30 ก.ค. 69 16:40 · อ้างอิง 7712045', 'ระบบ'
  from invoices i where i.id = inv;

  insert into invoices(code, job_id, customer_id, type, status, bill_to_name, bill_to_address,
                       bill_to_contact, bu_code, issue_date, due_date,
                       subtotal, grand_total, net_payable, note, created_by)
  select next_code('INV'), j3, c.id, 'ยอดคงเหลือ', 'Issued', c.name, c.address_bill, c.contact_name,
         'BU1', current_date - 3, current_date - 2, 13125, 13125, 13125,
         'ยอดคงเหลือ 50% ชำระก่อนจัดส่ง', 'ระบบ'
  from customers c join jobs j on j.id = j3 and c.id = j.customer_id
  returning id into inv;

  insert into invoice_items(invoice_id, seq, description, detail, qty, unit, unit_price, amount)
  values (inv, 1, 'ยอดคงเหลือ 50% — เสื้อชมรมถ่ายภาพ 150 ตัว',
          'ชำระก่อนจัดส่ง · อ้างอิงใบวางบิลมัดจำที่ชำระแล้ว', 1, 'งวด', 13125, 13125);

  -- งาน 0004 ปิดงานแล้ว จ่ายครบสองงวด
  for r in select * from (values ('มัดจำ', 7600, 34), ('ยอดคงเหลือ', 7600, 26)) as v(t, amt, d)
  loop
    insert into invoices(code, job_id, customer_id, type, status, bill_to_name, bill_to_address,
                         bill_to_contact, bu_code, issue_date, due_date,
                         subtotal, grand_total, net_payable, created_by)
    select next_code('INV'), j4, c.id, r.t, 'Paid', c.name, c.address_bill, c.contact_name,
           'BU3', current_date - r.d, current_date - r.d + 7, r.amt, r.amt, r.amt, 'ระบบ'
    from customers c join jobs j on j.id = j4 and c.id = j.customer_id
    returning id into inv;

    insert into invoice_items(invoice_id, seq, description, detail, qty, unit, unit_price, amount)
    values (inv, 1, r.t || ' 50% — เสื้อที่ระลึกเปิดสาขา 80 ตัว', 'DTF อกซ้าย', 1, 'งวด', r.amt, r.amt);

    insert into payments(code, job_id, invoice_id, type, method, amount, slip_url, slip_ref, paid_at, by_user)
    values (next_code('PAY'), j4, inv, r.t, 'โอน', r.amt,
            'https://drive.google.com/file/slip-' || lower(replace(r.t,' ','')) || '-0004',
            'SCB · อ้างอิง ' || (4400000 + r.amt)::text, now() - (r.d || ' days')::interval, 'ระบบ')
    returning id into pay;

    insert into receipts(code, invoice_id, payment_id, job_id, customer_id, received_from, address,
                         issue_date, subtotal, grand_total, net_received, method, slip_url, slip_ref, created_by)
    select next_code('RC'), inv, pay, j4, i.customer_id, i.bill_to_name, i.bill_to_address,
           current_date - r.d, r.amt, r.amt, r.amt, 'โอน', p.slip_url, p.slip_ref, 'ระบบ'
    from invoices i join payments p on p.id = pay where i.id = inv;
  end loop;
end $$;

-- ข้อมูลตัวอย่างครบแล้วจึงบังคับ constraint สลิปเต็มรูปแบบ
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'payments_need_slip' and not convalidated) then
    alter table payments validate constraint payments_need_slip;
  end if;
end $$;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['company_settings','invoices','invoice_items','receipts','credit_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ปรับตัวนับให้ตรงกับเลขที่ที่เอกสารบัญชีตัวอย่างใช้ไปแล้ว เอกสารใบจริงใบแรกจะได้ไม่เลขซ้ำ
select sync_counters();
