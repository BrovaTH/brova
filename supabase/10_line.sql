-- ============================================================================
-- BROVA — 10_line.sql : ผู้ใช้ และการแจ้งเตือนเข้าไลน์
-- รันต่อจาก 08_approvals.sql
--
-- แจ้งเตือนผ่าน LINE Messaging API ด้วยข้อความแบบ Flex
-- LINE Notify ปิดบริการไปแล้วตั้งแต่ 31 มีนาคม 2568 จึงต้องใช้บัญชีทางการ
--
-- โทเคนเก็บในฐานข้อมูล เจ้าของกรอกเองจากหน้าตั้งค่าได้
-- และอ่านได้เฉพาะเจ้าของเท่านั้น คนอื่นเห็นแค่ว่าตั้งไว้แล้วหรือยัง
-- ============================================================================

-- ---------------------------------------------------------------- มีผู้ใช้ในระบบหรือยัง
-- หน้าล็อกอินเรียกฟังก์ชันนี้ตอนยังไม่ล็อกอิน เพื่อรู้ว่าต้องตั้งบัญชีแรกไหม
-- คืนแค่ค่าจริงเท็จ ไม่หลุดข้อมูลอะไรออกไป
create or replace function has_any_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles);
$$;

revoke all on function has_any_user() from public;
grant execute on function has_any_user() to anon, authenticated;

-- ---------------------------------------------------------------- ตั้งค่าไลน์
create table if not exists line_settings (
  id                  int primary key default 1 check (id = 1),
  enabled             boolean not null default false,
  channel_token       text,          -- Channel Access Token แบบอายุยาว
  channel_secret      text,          -- ใช้ตรวจลายเซ็นตอนไลน์ยิงเข้ามา
  daily_summary_time  text not null default '08:30',
  updated_at          timestamptz not null default now(),
  updated_by          text
);

insert into line_settings(id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- ปลายทางที่จะส่ง
-- กลุ่มไลน์หรือคนเดียว  ระบบจับรหัสกลุ่มให้เองตอนเชิญบอทเข้ากลุ่ม
create table if not exists line_targets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  target_id   text not null unique,        -- groupId หรือ userId จากไลน์
  target_type text not null default 'group' check (target_type in ('group','user','room')),
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- เหตุการณ์ที่แจ้งได้
create table if not exists line_events (
  key         text primary key,
  th          text not null,
  hint        text,
  enabled     boolean not null default true,
  target_id   uuid references line_targets(id) on delete set null,
  sort_order  int not null default 0
);

insert into line_events(key, th, hint, sort_order) values
 ('approval_new',    'มีเรื่องรออนุมัติ',      'ส่งหาเจ้าของทันทีที่มีคนยื่นเรื่อง', 10),
 ('approval_done',   'ผลอนุมัติ',             'อนุมัติหรือไม่อนุมัติ ส่งกลับหาคนที่ยื่น', 20),
 ('job_late',        'งานเลยกำหนดส่ง',        'เช็กทุกเช้า งานไหนเลยกำหนดหรือใกล้ถึงกำหนด', 30),
 ('invoice_overdue', 'ใบวางบิลเลยกำหนดชำระ',  'เช็กทุกเช้าพร้อมยอดค้างรวม', 40),
 ('payment_in',      'เงินเข้า',              'ทุกครั้งที่บันทึกรับชำระเงิน', 50),
 ('stock_low',       'ของใกล้หมด',            'เมื่อยอดว่างต่ำกว่าจุดสั่งซื้อ', 60),
 ('po_late',         'ใบสั่งซื้อเลยกำหนดรับ',  'ของที่สั่งไว้ยังไม่มาถึงตามกำหนด', 70),
 ('qc_fail',         'ตรวจคุณภาพไม่ผ่าน',      'ส่งเข้ากลุ่มผลิตทันทีพร้อมสาเหตุ', 80),
 ('daily_summary',   'สรุปประจำวัน',          'สรุปงาน เงิน และเรื่องค้าง ส่งตอนเช้า', 90)
on conflict (key) do update set th = excluded.th, hint = excluded.hint,
                                sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- ประวัติการส่ง
-- เก็บทุกครั้งที่ส่ง ทั้งสำเร็จและล้มเหลว จะได้ตามได้ว่าข้อความหายตรงไหน
create table if not exists line_log (
  id          uuid primary key default gen_random_uuid(),
  event_key   text,
  target_id   text,
  target_name text,
  title       text,
  payload     jsonb,
  ok          boolean not null default false,
  error       text,
  attempts    int not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists line_log_time on line_log(created_at desc);

-- ---------------------------------------------------------------- มุมมองสำหรับหน้าจอ
create or replace view line_events_view with (security_invoker = true) as
select e.*, t.name as target_name, t.target_id as target_key, t.target_type
from line_events e left join line_targets t on t.id = e.target_id
order by e.sort_order;

create or replace view line_health with (security_invoker = true) as
select
  (select enabled from line_settings where id = 1)                              as enabled,
  (select channel_token is not null and length(trim(channel_token)) > 20
     from line_settings where id = 1)                                            as has_token,
  (select count(*) from line_targets where active)                               as targets,
  (select count(*) from line_events where enabled)                               as events_on,
  (select count(*) from line_log where created_at > now() - interval '7 days')    as sent_7d,
  (select count(*) from line_log
    where ok = false and created_at > now() - interval '7 days')                  as failed_7d,
  (select max(created_at) from line_log where ok)                                as last_ok;

-- ---------------------------------------------------------------- RLS
alter table line_settings enable row level security;
alter table line_targets  enable row level security;
alter table line_events   enable row level security;
alter table line_log      enable row level security;

-- โทเคนคือความลับ อ่านได้เฉพาะเจ้าของ
drop policy if exists "owner_only" on line_settings;
create policy "owner_only" on line_settings for all to authenticated
  using (is_owner()) with check (is_owner());

drop policy if exists "read_all"  on line_targets;
drop policy if exists "owner_w"   on line_targets;
create policy "read_all" on line_targets for select to authenticated using (true);
create policy "owner_w"  on line_targets for all to authenticated
  using (is_owner()) with check (is_owner());

drop policy if exists "read_all" on line_events;
drop policy if exists "owner_w"  on line_events;
create policy "read_all" on line_events for select to authenticated using (true);
create policy "owner_w"  on line_events for all to authenticated
  using (is_owner()) with check (is_owner());

drop policy if exists "read_all" on line_log;
create policy "read_all" on line_log for select to authenticated using (true);

-- ---------------------------------------------------------------- ผู้ใช้และบทบาท
-- เก็บอีเมลไว้ในโปรไฟล์ด้วย จะได้แสดงในหน้าจัดการผู้ใช้ได้
-- โดยไม่ต้องเปิดสิทธิ์ให้แอปอ่านตาราง auth.users โดยตรง
alter table profiles add column if not exists email text;

update profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is null;

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

-- เจ้าของแก้บทบาทและปิดใช้งานคนอื่นได้ แต่ห้ามลดสิทธิ์ตัวเองจนไม่เหลือเจ้าของเลย
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare owners int;
begin
  if TG_OP = 'UPDATE'
     and (old.role = 'owner')
     and (new.role <> 'owner' or new.active = false) then
    select count(*) into owners from profiles where role = 'owner' and active and id <> old.id;
    if owners = 0 then
      raise exception 'ระบบต้องมีเจ้าของที่ใช้งานอยู่อย่างน้อยหนึ่งคน';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles
  for each row execute function profiles_guard();

-- เจ้าของแก้โปรไฟล์คนอื่นได้ คนทั่วไปแก้ได้แค่ของตัวเองและเปลี่ยนบทบาทตัวเองไม่ได้
drop policy if exists "auth_all"     on profiles;
drop policy if exists "own_profile"  on profiles;
drop policy if exists "read_team"    on profiles;
drop policy if exists "owner_manage" on profiles;
drop policy if exists "self_edit"    on profiles;

create policy "read_team"    on profiles for select to authenticated using (true);
create policy "owner_manage" on profiles for all to authenticated
  using (is_owner()) with check (is_owner());
create policy "self_edit"    on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid()
              and role = (select p.role from profiles p where p.id = auth.uid())
              and active = (select p.active from profiles p where p.id = auth.uid()));

create or replace view team_view with (security_invoker = true) as
select p.*,
  case p.role
    when 'owner' then 'เจ้าของ'        when 'sales'      then 'ฝ่ายขาย'
    when 'design' then 'ฝ่ายออกแบบ'    when 'production' then 'ฝ่ายผลิต'
    when 'qc' then 'ฝ่ายตรวจคุณภาพ'    when 'warehouse'  then 'คลังสินค้า'
    when 'finance' then 'ฝ่ายบัญชี'    when 'affiliate'  then 'พาร์ตเนอร์'
  end as role_th
from profiles p;
