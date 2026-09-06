-- ============================================================================
-- BROVA — 11_go_live.sql : ล้างข้อมูลตัวอย่างก่อนเริ่มใช้งานจริง
--
-- รันไฟล์นี้ครั้งเดียว ตอนที่พร้อมเริ่มคีย์งานจริง
-- ไฟล์นี้ลบข้อมูลตัวอย่างทิ้งถาวร กู้คืนไม่ได้
--
-- วิธีรัน
--   1) สำรองฐานข้อมูลก่อน  Supabase > Database > Backups
--   2) เปิดไฟล์นี้ แล้วเอาเครื่องหมาย -- หน้าบรรทัด set local ออก
--   3) รันทั้งไฟล์ใน SQL Editor
--   ถ้าไม่ทำข้อ 2 ไฟล์จะหยุดเองและไม่ลบอะไรเลย
--
-- สิ่งที่เก็บไว้  ผังคลังผ้า ตารางราคา รหัสสินค้า หน่วยธุรกิจ ร้านคู่ค้าจริง
--                คำมาตรฐานบนเอกสาร ข้อมูลบริษัท เพดานอนุมัติ และผู้ใช้ทั้งหมด
-- สิ่งที่ลบ      งาน ใบเสนอราคา ใบวางบิล ใบเสร็จ การชำระเงิน การเคลื่อนไหวสต็อก
--                ใบสั่งซื้อ การนับสต็อก ใบขออนุมัติ ลูกค้าตัวอย่าง โรงงานตัวอย่าง
-- ============================================================================

begin;

-- ▼▼▼ เอา -- ข้างหน้าบรรทัดถัดไปออก แล้วค่อยรัน ▼▼▼
-- set local brova.confirm_reset = 'ลบข้อมูลตัวอย่างทิ้ง';
-- ▲▲▲ ------------------------------------------- ▲▲▲

do $$
begin
  if coalesce(current_setting('brova.confirm_reset', true), '') <> 'ลบข้อมูลตัวอย่างทิ้ง' then
    raise exception
      E'\n\n  หยุดไว้ก่อน ยังไม่ได้ยืนยัน\n'
      '  ไฟล์นี้จะลบข้อมูลตัวอย่างทั้งหมดถาวร\n'
      '  ถ้าต้องการลบจริง ให้เอาเครื่องหมาย -- หน้าบรรทัด set local ด้านบนออก แล้วรันใหม่\n'
      '  ยังไม่มีอะไรถูกลบ\n';
  end if;
end $$;

-- ---------------------------------------------------------------- งานและเอกสาร
truncate table
  status_logs, qc_records, production_logs, samples, mockups,
  job_items, shipments, feedback, jobs,
  quote_items, quotations,
  invoice_items, invoices, credit_notes, receipts, payments,
  doc_lines,
  purchase_order_items, purchase_orders,
  stock_count_items, stock_counts,
  stock_movements,
  affiliate_orders,
  approvals,
  line_log,
  inquiries
restart identity cascade;

-- ---------------------------------------------------------------- คู่ค้าและความรู้ตัวอย่าง
delete from affiliates;
delete from knowledge;
delete from customers;

-- โรงงานตัวอย่างสามเจ้า ต้องปลดการอ้างอิงจากรหัสสินค้าก่อน
update skus set supplier_primary = null
 where supplier_primary in (select id from suppliers where code in ('SUP-001','SUP-002','SUP-003'));
delete from suppliers where code in ('SUP-001','SUP-002','SUP-003');

-- ---------------------------------------------------------------- เริ่มนับเลขที่เอกสารใหม่
-- เอกสารใบแรกของจริงจะได้เลข 0001
delete from counters;

-- ---------------------------------------------------------------- ยอดคงเหลือเริ่มจากศูนย์
-- ให้ไปคีย์ยอดจริงผ่านหน้ารับเข้าหรือหน้านับสต็อก จะได้มีร่องรอยการเคลื่อนไหว
update skus     set qty_on_hand = 0, qty_allocated = 0;
update supplies set qty_on_hand = 0;

commit;

-- ---------------------------------------------------------------- ตรวจผล
select 'ใบงาน'        as รายการ, count(*) as คงเหลือ from jobs
union all select 'ใบเสนอราคา',  count(*) from quotations
union all select 'ใบวางบิล',    count(*) from invoices
union all select 'ใบเสร็จ',     count(*) from receipts
union all select 'ใบสั่งซื้อ',    count(*) from purchase_orders
union all select 'ใบขออนุมัติ',  count(*) from approvals
union all select 'ลูกค้า',       count(*) from customers
union all select '— เก็บไว้ —',  null
union all select 'ชนิดผ้า',      count(*) from fabrics
union all select 'ช่วงราคา',     count(*) from fabric_sizes
union all select 'รหัสสินค้า',    count(*) from skus
union all select 'ร้านคู่ค้า',     count(*) from suppliers
union all select 'ผู้ใช้',        count(*) from profiles;
