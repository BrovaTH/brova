-- ============================================================================
-- BROVA — dev_local.sql : เฉพาะเครื่องทดสอบเท่านั้น
-- ห้ามรันไฟล์นี้บน Supabase ของจริง
--
-- บนเครื่องทดสอบ auth.uid() ถูกทำเป็นค่าคงที่ไว้
-- ไฟล์นี้สร้างผู้ใช้ปลอมที่มีรหัสตรงกัน เพื่อให้ is_owner() ทำงานเหมือนของจริง
-- ============================================================================

insert into auth.users(id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000001', 'owner@brova.local',
        jsonb_build_object('full_name', 'เจ้าของกิจการ'))
on conflict (id) do nothing;

update profiles
   set full_name = 'เจ้าของกิจการ', role = 'owner', can_see_cost = true, active = true
 where id = '00000000-0000-0000-0000-000000000001';

select id, full_name, role, can_see_cost from profiles;
