-- ============================================================================
-- BROVA — 05_editor.sql : หน้าแก้ไขเอกสารคู่พรีวิว A4
-- รันต่อจาก 04_accounting.sql
--
-- ใช้กับเอกสารทั้งสามใบ ใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน
-- ร่างแก้ได้ ออกเลขแล้วล็อก ตรงกับกฎบัญชีที่ว่าเอกสารห้ามแก้ย้อนหลัง
-- ============================================================================

-- ---------------------------------------------------------------- คอลัมน์ร่วมของเอกสารทั้งสามชนิด
do $$
declare t text;
begin
  foreach t in array array['quotations','invoices','receipts'] loop
    execute format('alter table %I add column if not exists po_number text', t);
    execute format('alter table %I add column if not exists project_name text', t);
    execute format('alter table %I add column if not exists credit_days int default 30', t);
    execute format('alter table %I add column if not exists terms text', t);
    execute format('alter table %I add column if not exists labels jsonb not null default ''{}''::jsonb', t);
    execute format('alter table %I add column if not exists currency2 text', t);
    execute format('alter table %I add column if not exists fx_rate numeric', t);
    execute format('alter table %I add column if not exists locked_at timestamptz', t);
    execute format('alter table %I add column if not exists locked_by text', t);
    -- ภาพนิ่งของคู่ค้า ณ วันที่ออกเอกสาร แก้ข้อมูลลูกค้าทีหลังเอกสารเก่าไม่เปลี่ยน
    execute format('alter table %I add column if not exists party_name text', t);
    execute format('alter table %I add column if not exists party_tax_id text', t);
    execute format('alter table %I add column if not exists party_address text', t);
    execute format('alter table %I add column if not exists party_contact text', t);
    execute format('alter table %I add column if not exists party_phone text', t);
    -- ยอดท้ายเอกสารเก็บเป็นภาพนิ่ง ทั้งสามใบต้องมีคอลัมน์ชุดเดียวกัน
    -- ไม่งั้นหน้าแก้ไขจะเขียนลงใบเสนอราคาไม่ได้
    execute format('alter table %I add column if not exists subtotal numeric not null default 0', t);
    execute format('alter table %I add column if not exists discount numeric not null default 0', t);
    execute format('alter table %I add column if not exists vat_amount numeric not null default 0', t);
    execute format('alter table %I add column if not exists grand_total numeric not null default 0', t);
    execute format('alter table %I add column if not exists wht_amount numeric not null default 0', t);
  end loop;
end $$;

-- ร่างยังไม่มีเลขที่ จึงต้องยอมให้ code เป็นค่าว่างได้
alter table invoices alter column code drop not null;
alter table receipts alter column code drop not null;

-- ---------------------------------------------------------------- รายการกลางของเอกสารทุกชนิด
create table if not exists doc_lines (
  id          uuid primary key default gen_random_uuid(),
  doc_type    text not null check (doc_type in ('quotation','invoice','receipt')),
  doc_id      uuid not null,
  seq         int not null default 1,
  description text,
  detail      text,
  qty         numeric not null default 1,
  unit        text not null default 'ตัว',
  unit_price  numeric not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists doc_lines_doc on doc_lines(doc_type, doc_id, seq);

-- ---------------------------------------------------------------- คำมาตรฐานบนเอกสาร
-- ผู้ใช้แก้คำบนใบได้เอง ค่าที่แก้เก็บใน labels ของเอกสารนั้น ๆ
-- ค่าที่ไม่ได้แก้จะใช้ค่ามาตรฐานจากตารางนี้
create table if not exists doc_label_defaults (
  key   text primary key,
  value text not null
);

insert into doc_label_defaults(key, value) values
 ('doc_no','เลขที่'), ('doc_date','วันที่'), ('due_date','ครบกำหนด'),
 ('party','ลูกค้า'), ('refs','เอกสารอ้างอิง'), ('po','เลขที่ใบสั่งซื้อ'),
 ('project','โปรเจกต์'), ('credit','เครดิต'),
 ('col_seq','ลำดับ'), ('col_desc','รายการ'), ('col_qty','จำนวน'), ('col_unit','หน่วย'),
 ('col_price','ราคา/หน่วย'), ('col_amount','จำนวนเงิน'),
 ('subtotal','รวมเป็นเงิน'), ('discount','ส่วนลด'), ('before_vat','ยอดก่อนภาษี'),
 ('vat','ภาษีมูลค่าเพิ่ม'), ('grand_total','รวมทั้งสิ้น'), ('wht','หัก ณ ที่จ่าย'),
 ('net','ยอดที่ต้องชำระ'), ('baht_text','จำนวนเงินเป็นตัวอักษร'), ('terms','เงื่อนไขการชำระเงิน')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- ร่างทั้งหมดในที่เดียว
create or replace view draft_docs with (security_invoker = true) as
select 'quotation'::text as doc_type, q.id, q.code, q.status,
       coalesce(q.party_name, c.name) as party_name,
       q.created_at,
       (select coalesce(sum(l.qty * l.unit_price), 0) from doc_lines l
        where l.doc_type='quotation' and l.doc_id = q.id) as total
from quotations q left join customers c on c.id = q.customer_id
where q.status = 'Draft'
union all
select 'invoice', i.id, i.code, i.status,
       coalesce(i.party_name, i.bill_to_name), i.created_at,
       (select coalesce(sum(l.qty * l.unit_price), 0) from doc_lines l
        where l.doc_type='invoice' and l.doc_id = i.id)
from invoices i where i.status = 'Draft'
union all
select 'receipt', r.id, r.code, 'Draft',
       coalesce(r.party_name, r.received_from), r.created_at,
       (select coalesce(sum(l.qty * l.unit_price), 0) from doc_lines l
        where l.doc_type='receipt' and l.doc_id = r.id)
from receipts r where r.code is null;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['doc_lines','doc_label_defaults'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- ร่างตัวอย่างหนึ่งใบ
do $$
declare d uuid;
begin
  if exists (select 1 from quotations where status = 'Draft') then return; end if;

  insert into quotations(code, customer_id, bu_code, status, issued_at, valid_until,
                         lead_time_days, deposit_pct, po_number, project_name, credit_days, terms)
  select null, c.id, 'BU1', 'Draft',
         (now() at time zone 'Asia/Bangkok')::date,
         (now() at time zone 'Asia/Bangkok')::date + 15,
         12, 50, 'PO-2569-0142', 'ยูนิฟอร์มพนักงานสาขาใหม่', 30,
         '1. ราคานี้ยังไม่รวมค่าใช้จ่ายที่เกิดจากการเปลี่ยนแปลงขอบเขตงานหลังอนุมัติ' || chr(10) ||
         '2. กำหนดยืนราคา 15 วัน นับจากวันที่ออกใบเสนอราคา' || chr(10) ||
         '3. เงื่อนไขการชำระเงินเป็นไปตามที่ตกลงในเอกสารวางบิล'
  from customers c where c.code = 'CUS-00001'
  returning id into d;

  update quotations q set
    party_name = c.name, party_tax_id = c.tax_id, party_address = c.address_bill,
    party_contact = c.contact_name, party_phone = c.phone
  from customers c where q.id = d and c.id = q.customer_id;

  insert into doc_lines(doc_type, doc_id, seq, description, detail, qty, unit, unit_price) values
   ('quotation', d, 1, 'เสื้อโปโลพนักงาน สกรีนอกซ้าย 2 สี',
    'ผ้า TC สีกรมท่า · ปักโลโก้อกซ้าย · แถบคอสองชั้น', 120, 'ตัว', 285),
   ('quotation', d, 2, 'เสื้อยืดคอกลม ทีมช่าง สกรีนหลังเต็ม',
    'ผ้า Comb Cotton 32 สีดำ · สกรีนซิลค์สกรีน 3 สี', 60, 'ตัว', 245),
   ('quotation', d, 3, 'ค่าบล็อกสกรีน ครั้งแรก',
    'คิดครั้งเดียว งานถัดไปที่ใช้บล็อกเดิมไม่คิดซ้ำ', 5, 'บล็อก', 350);
end $$;
