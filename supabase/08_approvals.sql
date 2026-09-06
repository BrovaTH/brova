-- ============================================================================
-- BROVA — 08_approvals.sql : ระบบขออนุมัติจากผู้บริหาร
-- รันต่อจาก 07_fabrics.sql
--
-- หลักการที่ตกลงไว้
--   1) เรื่องที่ต้องขออนุมัติ  เลื่อนกำหนดชำระ / ส่งของก่อนชำระครบ /
--      ลดราคาเกินเพดาน / ข้ามประตู / ยกเลิกงาน / ซื้อเกินงบ
--   2) ผู้อนุมัติ  เจ้าของคนเดียว
--   3) การบังคับ  บังคับจริง ไม่อนุมัติก็ทำไม่ได้
--
--   ใบอนุมัติเป็นแบบใช้ครั้งเดียวและมีวันหมดอายุ
--   อนุมัติแล้วต้องไปทำรายการจริงภายในเวลาที่กำหนด ไม่งั้นต้องขอใหม่
--   กันกรณีอนุมัติทิ้งไว้แล้วมีคนหยิบไปใช้ข้ามงานหรือใช้ซ้ำ
-- ============================================================================

-- ---------------------------------------------------------------- เพดานที่ตั้งไว้
create table if not exists approval_rules (
  id                        int primary key default 1 check (id = 1),
  max_discount_pct          numeric not null default 10,     -- ลดได้เองไม่เกินกี่เปอร์เซ็นต์
  max_credit_days           int     not null default 30,     -- ให้เครดิตได้เองไม่เกินกี่วัน
  po_budget_cap             numeric not null default 50000,  -- ใบสั่งซื้อเกินยอดนี้ต้องขอ
  allow_ship_before_paid    boolean not null default false,  -- ส่งของก่อนชำระครบได้เองไหม
  approval_valid_hours      int     not null default 72,     -- อนุมัติแล้วใช้ได้กี่ชั่วโมง
  updated_at                timestamptz not null default now()
);

insert into approval_rules(id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- ใบขออนุมัติ
create table if not exists approvals (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  kind          text not null check (kind in (
                  'credit_extend',    -- เลื่อนกำหนดชำระ / ขอเครดิตเพิ่ม
                  'ship_unpaid',      -- ส่งของก่อนชำระครบ
                  'discount_over',    -- ลดราคาเกินเพดาน
                  'gate_skip',        -- ข้ามประตูตรวจ
                  'job_cancel',       -- ยกเลิกงาน
                  'budget_over')),    -- ซื้อเกินงบ
  target_type   text not null check (target_type in
                  ('job','invoice','quotation','purchase_order','shipment')),
  target_id     uuid,
  target_code   text,
  title         text not null,
  reason        text not null,
  payload       jsonb not null default '{}'::jsonb,  -- ค่าที่ขอ เช่น วันครบกำหนดใหม่ ส่วนลดที่ขอ
  amount        numeric,                             -- ผลกระทบเป็นเงิน ถ้าคิดเป็นเงินได้

  status        text not null default 'pending' check (status in
                  ('pending','approved','rejected','used','expired','cancelled')),

  requested_by       uuid,
  requested_by_name  text,
  requested_at       timestamptz not null default now(),

  decided_by         uuid,
  decided_by_name    text,
  decided_at         timestamptz,
  decision_note      text,

  expires_at    timestamptz,      -- อนุมัติแล้วหมดอายุเมื่อไร
  consumed_at   timestamptz,      -- เอาไปใช้ทำรายการจริงเมื่อไร
  consumed_ref  text,             -- ใช้กับรายการไหน

  created_at    timestamptz not null default now()
);

create index if not exists approvals_status_idx on approvals(status, requested_at desc);
create index if not exists approvals_target_idx on approvals(target_type, target_id);
create index if not exists approvals_usable_idx on approvals(kind, target_type, target_id, status);

-- ---------------------------------------------------------------- ใครเป็นเจ้าของ
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'owner' and p.active
  );
$$;

create or replace function me_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from profiles where id = auth.uid()), 'ระบบ');
$$;

-- ---------------------------------------------------------------- ด่านบังคับ
-- ทุกการเปลี่ยนสถานะใบอนุมัติวิ่งผ่านทริกเกอร์นี้
-- ต่อให้มีคนยิงคำสั่งตรงเข้าตาราง ก็อนุมัติแทนเจ้าของไม่ได้
create or replace function approvals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_hours int;
begin
  if TG_OP = 'INSERT' then
    if new.code is null then
      new.code := next_code('APV');
    end if;
    new.requested_by      := coalesce(new.requested_by, auth.uid());
    new.requested_by_name := coalesce(new.requested_by_name, me_name());

    -- ยื่นเรื่องได้ทุกคน แต่ยื่นมาเป็นอนุมัติแล้วไม่ได้
    if new.status <> 'pending' and not is_owner() then
      raise exception 'สร้างใบอนุมัติที่อนุมัติไว้แล้วไม่ได้ ต้องให้เจ้าของกดอนุมัติเท่านั้น';
    end if;
    return new;
  end if;

  -- ห้ามแก้เลขที่ใบและเรื่องที่ขอ
  if new.code <> old.code or new.kind <> old.kind then
    raise exception 'เลขที่ใบอนุมัติและประเภทเรื่องแก้ไม่ได้';
  end if;

  if new.status is distinct from old.status then
    -- ตัดสินใจได้เฉพาะเจ้าของ
    if new.status in ('approved','rejected') then
      if old.status <> 'pending' then
        raise exception 'ใบนี้ตัดสินไปแล้ว เปลี่ยนผลไม่ได้';
      end if;
      if not is_owner() then
        raise exception 'เฉพาะเจ้าของเท่านั้นที่อนุมัติได้';
      end if;
      new.decided_by      := coalesce(new.decided_by, auth.uid());
      new.decided_by_name := coalesce(new.decided_by_name, me_name());
      new.decided_at      := coalesce(new.decided_at, now());
      if new.status = 'approved' and new.expires_at is null then
        select approval_valid_hours into v_hours from approval_rules where id = 1;
        new.expires_at := now() + make_interval(hours => coalesce(v_hours, 72));
      end if;
    end if;

    -- ถอนเรื่องได้เฉพาะคนยื่นกับเจ้าของ และถอนได้เฉพาะตอนยังไม่ตัดสิน
    if new.status = 'cancelled' then
      if old.status <> 'pending' then
        raise exception 'ถอนเรื่องได้เฉพาะใบที่ยังรออนุมัติ';
      end if;
      if not is_owner() and old.requested_by is distinct from auth.uid() then
        raise exception 'ถอนเรื่องได้เฉพาะคนที่ยื่นเองหรือเจ้าของ';
      end if;
    end if;

    -- ใช้แล้วกับหมดอายุ ให้ฟังก์ชันของระบบเป็นคนตั้งเท่านั้น
    if new.status in ('used','expired')
       and coalesce(current_setting('brova.sys', true), '') <> '1' then
      raise exception 'สถานะนี้ระบบตั้งให้เองตอนนำใบไปใช้';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists approvals_guard on approvals;
create trigger approvals_guard
  before insert or update on approvals
  for each row execute function approvals_guard();

-- ---------------------------------------------------------------- ลงประวัติงานให้ด้วย
create or replace function approvals_log_job() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_th text;
begin
  if new.target_type <> 'job' or new.target_id is null then return new; end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('approved','rejected','used') then return new; end if;

  v_th := case new.status
            when 'approved' then 'เจ้าของอนุมัติ'
            when 'rejected' then 'เจ้าของไม่อนุมัติ'
            else 'นำใบอนุมัติไปใช้' end;

  insert into status_logs(job_id, from_status, to_status, note, by_user)
  select j.status, j.status,
         v_th || ' · ' || new.code || ' · ' || new.title
              || coalesce(' · ' || nullif(new.decision_note, ''), ''),
         coalesce(new.decided_by_name, new.requested_by_name, 'ระบบ')
  from jobs j where j.id = new.target_id;

  return new;
exception when others then
  return new;   -- ประวัติเสียไม่ควรทำให้การอนุมัติล้ม
end $$;

drop trigger if exists approvals_log_job on approvals;
create trigger approvals_log_job
  after update on approvals
  for each row execute function approvals_log_job();

-- ---------------------------------------------------------------- หมดอายุอัตโนมัติ
create or replace function expire_approvals() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('brova.sys', '1', true);
  update approvals
     set status = 'expired'
   where status = 'approved'
     and expires_at is not null
     and expires_at < now();
  get diagnostics n = row_count;
  perform set_config('brova.sys', '0', true);
  return n;
end $$;

-- ---------------------------------------------------------------- ใบที่ใช้ได้อยู่ตอนนี้
create or replace function find_usable_approval(
  p_kind        text,
  p_target_type text,
  p_target_id   uuid
) returns uuid
language sql stable security definer set search_path = public as $$
  select a.id
    from approvals a
   where a.kind = p_kind
     and a.target_type = p_target_type
     and a.target_id is not distinct from p_target_id
     and a.status = 'approved'
     and (a.expires_at is null or a.expires_at > now())
   order by a.decided_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------- ด่านจริง เรียกก่อนทำรายการนอกกรอบ
-- ไม่มีใบอนุมัติที่ใช้ได้ ฟังก์ชันนี้จะโยนข้อผิดพลาดออกไป รายการนั้นทำไม่สำเร็จ
create or replace function use_approval(
  p_kind        text,
  p_target_type text,
  p_target_id   uuid,
  p_ref         text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_code text;
  v_msg  text;
begin
  perform expire_approvals();
  v_id := find_usable_approval(p_kind, p_target_type, p_target_id);

  if v_id is null then
    v_msg := case p_kind
      when 'credit_extend' then 'เลื่อนกำหนดชำระ'
      when 'ship_unpaid'   then 'ส่งของก่อนชำระครบ'
      when 'discount_over' then 'ลดราคาเกินเพดาน'
      when 'gate_skip'     then 'ข้ามประตูตรวจ'
      when 'job_cancel'    then 'ยกเลิกงาน'
      when 'budget_over'   then 'ซื้อเกินงบ'
      else p_kind end;
    raise exception 'รายการนี้ต้องได้รับอนุมัติจากเจ้าของก่อน เรื่อง % — ยังไม่มีใบอนุมัติที่ใช้ได้', v_msg
      using errcode = 'P0001';
  end if;

  perform set_config('brova.sys', '1', true);
  update approvals
     set status = 'used', consumed_at = now(), consumed_ref = p_ref
   where id = v_id
  returning code into v_code;
  perform set_config('brova.sys', '0', true);

  return v_code;
end $$;

-- ---------------------------------------------------------------- ตัวช่วยบอกว่าต้องขอไหม
create or replace function needs_approval_discount(p_pct numeric) returns boolean
language sql stable as $$
  select coalesce(p_pct, 0) > (select max_discount_pct from approval_rules where id = 1);
$$;

create or replace function needs_approval_credit(p_days int) returns boolean
language sql stable as $$
  select coalesce(p_days, 0) > (select max_credit_days from approval_rules where id = 1);
$$;

create or replace function needs_approval_budget(p_amount numeric) returns boolean
language sql stable as $$
  select coalesce(p_amount, 0) > (select po_budget_cap from approval_rules where id = 1);
$$;

create or replace function needs_approval_ship_unpaid() returns boolean
language sql stable as $$
  select not (select allow_ship_before_paid from approval_rules where id = 1);
$$;

-- ---------------------------------------------------------------- มุมมองสำหรับหน้าจอ
create or replace view approvals_view with (security_invoker = true) as
select
  a.*,
  case a.kind
    when 'credit_extend' then 'เลื่อนกำหนดชำระ / ขอเครดิต'
    when 'ship_unpaid'   then 'ส่งของก่อนชำระครบ'
    when 'discount_over' then 'ลดราคาเกินเพดาน'
    when 'gate_skip'     then 'ข้ามประตูตรวจ'
    when 'job_cancel'    then 'ยกเลิกงาน'
    when 'budget_over'   then 'ซื้อเกินงบ'
  end as kind_th,
  case a.status
    when 'pending'   then 'รออนุมัติ'
    when 'approved'  then 'อนุมัติแล้ว'
    when 'rejected'  then 'ไม่อนุมัติ'
    when 'used'      then 'ใช้แล้ว'
    when 'expired'   then 'หมดอายุ'
    when 'cancelled' then 'ถอนเรื่อง'
  end as status_th,
  case a.target_type
    when 'job'             then 'ใบงาน'
    when 'invoice'         then 'ใบวางบิล'
    when 'quotation'       then 'ใบเสนอราคา'
    when 'purchase_order'  then 'ใบสั่งซื้อ'
    when 'shipment'        then 'รอบจัดส่ง'
  end as target_th,
  (a.status = 'approved'
     and (a.expires_at is null or a.expires_at > now()))            as is_usable,
  (a.status = 'approved' and a.expires_at is not null
     and a.expires_at <= now())                                     as is_stale,
  case when a.status = 'pending'
       then round(extract(epoch from (now() - a.requested_at)) / 3600.0, 1)
  end                                                               as waiting_hours,
  case when a.status = 'approved' and a.expires_at is not null
       then round(extract(epoch from (a.expires_at - now())) / 3600.0, 1)
  end                                                               as hours_left
from approvals a;

-- ---------------------------------------------------------------- สรุปหัวตาราง
create or replace view approvals_summary with (security_invoker = true) as
select
  count(*) filter (where status = 'pending')                                as pending,
  count(*) filter (where status = 'approved'
                     and (expires_at is null or expires_at > now()))        as usable,
  count(*) filter (where status = 'approved'
                     and expires_at is not null and expires_at <= now())    as stale,
  count(*) filter (where status = 'used')                                   as used,
  count(*) filter (where status = 'rejected')                               as rejected,
  coalesce(sum(amount) filter (where status = 'pending'), 0)                as pending_amount
from approvals;

-- ---------------------------------------------------------------- RLS
alter table approvals      enable row level security;
alter table approval_rules enable row level security;

drop policy if exists "read_all"    on approvals;
drop policy if exists "insert_any"  on approvals;
drop policy if exists "update_flow" on approvals;

create policy "read_all"   on approvals for select to authenticated using (true);
create policy "insert_any" on approvals for insert to authenticated with check (true);
create policy "update_flow" on approvals for update to authenticated
  using (is_owner() or requested_by = auth.uid())
  with check (true);
-- ลบทิ้งไม่ได้เลย ใบขออนุมัติต้องเหลือไว้เป็นหลักฐาน

drop policy if exists "rules_read"  on approval_rules;
drop policy if exists "rules_write" on approval_rules;
create policy "rules_read"  on approval_rules for select to authenticated using (true);
create policy "rules_write" on approval_rules for update to authenticated
  using (is_owner()) with check (is_owner());

grant execute on function use_approval(text, text, uuid, text)   to authenticated;
grant execute on function find_usable_approval(text, text, uuid) to authenticated;
grant execute on function expire_approvals()                     to authenticated;

-- ---------------------------------------------------------------- ตัวอย่างสามใบ
do $$
declare
  v_inv uuid; v_inv_code text;
  v_job uuid; v_job_code text;
  v_qt  uuid;
begin
  if exists (select 1 from approvals) then return; end if;

  select id, code into v_inv, v_inv_code from invoices where code = 'INV-2569-0004';
  select id, code into v_job, v_job_code from jobs     where code = 'JOB-2569-0002';
  select id            into v_qt          from quotations where status = 'Draft' limit 1;

  alter table approvals disable trigger approvals_guard;
  alter table approvals disable trigger approvals_log_job;

  -- ใบที่ยังรอเจ้าของกด
  insert into approvals(code, kind, target_type, target_id, target_code, title, reason,
                        payload, amount, status, requested_by_name, requested_at)
  values (next_code('APV'), 'credit_extend', 'invoice', v_inv, v_inv_code,
          'ขอเลื่อนกำหนดชำระ ' || v_inv_code || ' ออกไป 15 วัน',
          'ลูกค้าแจ้งว่ารอบวางบิลของเขาปิดไปแล้ว ขอเลื่อนไปรอบหน้า เป็นลูกค้าประจำ จ่ายตรงมาตลอดสามงานที่ผ่านมา',
          jsonb_build_object('due_date_old','2026-08-24','due_date_new','2026-09-08','extra_days',15),
          13125, 'pending', 'ฝ่ายขาย', now() - interval '5 hours');

  -- ใบที่เจ้าของอนุมัติแล้ว ยังไม่ได้เอาไปใช้
  insert into approvals(code, kind, target_type, target_id, target_code, title, reason,
                        payload, amount, status, requested_by_name, requested_at,
                        decided_by_name, decided_at, decision_note, expires_at)
  values (next_code('APV'), 'discount_over', 'quotation', v_qt, null,
          'ขอลดราคา 15 เปอร์เซ็นต์ ในใบเสนอราคางานยูนิฟอร์มสาขาใหม่',
          'ลูกค้าเทียบราคากับอีกสองเจ้า ถ้าปิดงานนี้ได้จะได้งานต่อเนื่องอีกสองสาขาในไตรมาสหน้า',
          jsonb_build_object('cap_pct',10,'asked_pct',15,'base_amount',50650),
          2532.50, 'approved', 'ฝ่ายขาย', now() - interval '2 days',
          'เจ้าของ', now() - interval '1 day',
          'อนุมัติได้ แต่ต้องได้ใบสั่งซื้อสองสาขาถัดไปภายในเดือนหน้า',
          now() + interval '2 days');

  -- ใบที่เจ้าของไม่อนุมัติ
  insert into approvals(code, kind, target_type, target_id, target_code, title, reason,
                        payload, amount, status, requested_by_name, requested_at,
                        decided_by_name, decided_at, decision_note)
  values (next_code('APV'), 'ship_unpaid', 'job', v_job, v_job_code,
          'ขอส่งของ ' || v_job_code || ' ก่อน ทั้งที่ยังค้างมัดจำงวดสอง',
          'ลูกค้าจะใช้งานวันงานอีเวนต์เสาร์นี้ ขอรับของก่อนแล้วโอนวันจันทร์',
          jsonb_build_object('outstanding', 5700),
          5700, 'rejected', 'ฝ่ายขาย', now() - interval '3 days',
          'เจ้าของ', now() - interval '3 days' + interval '2 hours',
          'ยังไม่อนุมัติ ให้เก็บเงินให้ครบก่อนแล้วค่อยปล่อยของ ถ้าลูกค้าโอนวันศุกร์ก็ทันงาน');

  alter table approvals enable trigger approvals_guard;
  alter table approvals enable trigger approvals_log_job;
end $$;

-- ปรับตัวนับให้ตรงกับเลขที่ที่ใบขออนุมัติตัวอย่างใช้ไปแล้ว เอกสารใบจริงใบแรกจะได้ไม่เลขซ้ำ
select sync_counters();
