-- ============================================================================
-- BROVA — 02_rls.sql : เปิด Row Level Security
-- รันไฟล์นี้ต่อจาก 01_schema.sql
--
-- นโยบายในเฟสแรก: ผู้ใช้ที่ล็อกอินแล้วเข้าถึงข้อมูลได้ทั้งหมด
-- ส่วนการซ่อนต้นทุนและกำไรจาก Sales ควบคุมที่ชั้นแอป (profiles.can_see_cost)
-- เมื่อทีมโตขึ้นค่อยรัดนโยบายให้ละเอียดขึ้นตามบทบาท
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','business_units','customers','suppliers','skus','inquiries',
    'quotations','quote_items','jobs','job_items','mockups','samples',
    'production_logs','qc_records','stock_movements','purchase_orders',
    'payments','shipments','feedback','affiliates','affiliate_orders',
    'knowledge','status_logs','counters'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ผู้ใช้แก้โปรไฟล์ตัวเองได้เสมอ
drop policy if exists "own_profile" on profiles;
create policy "own_profile" on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
