-- ============================================================================
-- BROVA — dev_auth_stub.sql : เฉพาะเครื่องทดสอบเท่านั้น
-- ห้ามรันไฟล์นี้บน Supabase ของจริง เพราะของจริงมีสคีมา auth อยู่แล้ว
--
-- ไฟล์นี้จำลอง auth.users และ auth.uid() ให้พอรันสคริปต์ที่เหลือได้บนเครื่อง
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
