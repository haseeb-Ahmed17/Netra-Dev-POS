-- =============================================================================
-- Migration: 20261123_security_rbac_and_units.sql
-- Purpose:
--   1. Replace email-prefix super_admin heuristic with explicit public.super_admins
--      table + SECURITY DEFINER public.is_super_admin() and hardened subscriptions RLS.
--   2. Hash legacy plaintext employees.pin_code into employees.pin_hash (pgcrypto bcrypt),
--      redact pin_code to '****', and add server/DB-enforced staff PIN sessions
--      (public.staff_sessions, verify_staff_pin, set_staff_pin, delete_staff_member).
--   3. Enforce backend/database RBAC across admin, manager, and cashier roles via
--      AS RESTRICTIVE RLS policies + cashier-safe stock delta RPC (apply_order_stock_delta).
--   4. Add intelligent product-specific selling units (selling_unit) and decimal
--      quantity precision (numeric(12,3)) without modifying or deleting business records.
--
-- Prerequisites:
--   - Execute AFTER 20261122_schema_alignment_and_rls.sql.
--   - Take a pre-migration pg_dump / Supabase logical backup first.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PART A: EXPLICIT SUPER ADMIN ROLE & SUBSCRIPTIONS RLS HARDENING
-- ---------------------------------------------------------------------------
create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

revoke all on table public.super_admins from anon, public;
grant select on table public.super_admins to authenticated;
grant all privileges on table public.super_admins to service_role;

alter table public.super_admins enable row level security;

drop policy if exists "Users can read own super admin status" on public.super_admins;
create policy "Users can read own super admin status"
  on public.super_admins
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Seed ONLY the exact primary platform owner account (never a prefix match).
insert into public.super_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = 'bc260436573mha@vu.edu.pk'
on conflict (user_id) do update
  set email = excluded.email;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.super_admins sa
    where sa.user_id = auth.uid()
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- Harden public.subscriptions RLS (drop any wildcard / prefix-based policies)
do $$
declare
  pol record;
begin
  if to_regclass('public.subscriptions') is not null then
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'subscriptions'
        and (
          coalesce(qual, '') ilike '%bc260436573%'
          or coalesce(with_check, '') ilike '%bc260436573%'
          or coalesce(qual, '') ilike '%like%'
          or coalesce(with_check, '') ilike '%like%'
        )
    loop
      execute format('drop policy if exists %I on public.subscriptions', pol.policyname);
    end loop;
  end if;
end $$;

revoke all on table public.subscriptions from anon, public;
grant select, insert, update, delete on table public.subscriptions to authenticated;
grant all privileges on table public.subscriptions to service_role;

alter table public.subscriptions enable row level security;

drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_super_admin());

drop policy if exists "Users create initial trial subscription" on public.subscriptions;
create policy "Users create initial trial subscription"
  on public.subscriptions
  for insert
  to authenticated
  with check (
    (auth.uid() = user_id and is_blocked = false)
    or public.is_super_admin()
  );

drop policy if exists "Super admin manages all subscriptions" on public.subscriptions;
create policy "Super admin manages all subscriptions"
  on public.subscriptions
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "Super admin deletes subscriptions" on public.subscriptions;
create policy "Super admin deletes subscriptions"
  on public.subscriptions
  for delete
  to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- PART B: HASHED STAFF PINS & VERIFIED STAFF SESSIONS
-- ---------------------------------------------------------------------------
alter table public.employees add column if not exists pin_hash text;
alter table public.employees add column if not exists pin_updated_at timestamptz not null default now();
alter table public.employees alter column pin_code set default '****';

-- Migrate existing plaintext PINs to bcrypt hashes via pgcrypto and redact pin_code.
-- Never touches rows that already store a valid hash; never fabricates a fallback PIN.
do $$
begin
  perform set_config('search_path', 'public, extensions', true);
  update public.employees
  set
    pin_hash = case
      when coalesce(pin_hash, '') <> '' then pin_hash
      when coalesce(pin_code, '') ~ '^\d{4}$' then crypt(pin_code, gen_salt('bf'))
      else pin_hash
    end,
    pin_code = '****',
    pin_updated_at = coalesce(pin_updated_at, now())
  where coalesce(pin_code, '') <> '****';
end $$;

create table if not exists public.staff_sessions (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null references public.employees(id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'cashier')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

create index if not exists idx_staff_sessions_user_id on public.staff_sessions(user_id);
create index if not exists idx_staff_sessions_expires_at on public.staff_sessions(expires_at);

revoke all on table public.staff_sessions from anon, authenticated, public;
grant all privileges on table public.staff_sessions to service_role;

alter table public.staff_sessions enable row level security;

drop policy if exists "Service role manages staff sessions" on public.staff_sessions;
create policy "Service role manages staff sessions"
  on public.staff_sessions
  for all
  to service_role
  using (true)
  with check (true);

-- Resolve verified staff role from the x-staff-session HTTP request header.
create or replace function public.current_staff_role()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, auth
as $$
declare
  v_headers jsonb;
  v_token text;
  v_role text;
begin
  if auth.uid() is null then
    return null;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_token := nullif(trim(coalesce(v_headers ->> 'x-staff-session', '')), '');
  if v_token is null then
    return null;
  end if;

  select s.role
  into v_role
  from public.staff_sessions s
  join public.employees e
    on e.id = s.employee_id
   and e.user_id = s.user_id
  where s.token = v_token
    and s.user_id = auth.uid()
    and s.expires_at > now()
    and e.is_active = true
  limit 1;

  return v_role;
end;
$$;

revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated, service_role;

-- Enforce role membership; permits initial bootstrap ONLY when the tenant has 0 active employees yet.
create or replace function public.is_staff_role_in(p_allowed text[])
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_has_employees boolean;
begin
  if v_uid is null then
    return false;
  end if;

  v_role := public.current_staff_role();
  if v_role is not null then
    return v_role = any(p_allowed);
  end if;

  select exists (
    select 1
    from public.employees e
    where e.user_id = v_uid
      and e.is_active = true
  )
  into v_has_employees;

  -- Fail closed whenever active employees already exist and no valid x-staff-session token was sent.
  return not v_has_employees;
end;
$$;

revoke all on function public.is_staff_role_in(text[]) from public;
grant execute on function public.is_staff_role_in(text[]) to authenticated, service_role;

-- Verify a 4-digit PIN inside Postgres and issue a scoped 12-hour staff_sessions token.
create or replace function public.verify_staff_pin(
  p_pin text,
  p_employee_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_pin text := trim(coalesce(p_pin, ''));
  v_emp record;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required.');
  end if;

  if v_clean_pin !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN must be exactly 4 digits.');
  end if;

  select e.id, e.name, e.role, e.pin_hash
  into v_emp
  from public.employees e
  where e.user_id = v_uid
    and e.is_active = true
    and (p_employee_id is null or e.id = p_employee_id)
    and coalesce(e.pin_hash, '') like '$2%'
    and crypt(v_clean_pin, e.pin_hash) = e.pin_hash
  order by case e.role when 'admin' then 1 when 'manager' then 2 else 3 end
  limit 1;

  if v_emp.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid or inactive staff PIN.');
  end if;

  delete from public.staff_sessions
  where user_id = v_uid
    and expires_at <= now();

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.staff_sessions (token, user_id, employee_id, role, expires_at)
  values (v_token, v_uid, v_emp.id, v_emp.role, v_expires);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'employeeId', v_emp.id,
    'name', v_emp.name,
    'role', v_emp.role,
    'expiresAt', v_expires
  );
end;
$$;

revoke all on function public.verify_staff_pin(text, text) from public;
grant execute on function public.verify_staff_pin(text, text) to authenticated, service_role;

-- Create or update staff with bcrypt-hashed PIN (enforces admin role unless bootstrapping first staff).
create or replace function public.set_staff_pin(
  p_employee_id text,
  p_name text,
  p_role text,
  p_phone text default '',
  p_pin text default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_pin text := nullif(trim(coalesce(p_pin, '')), '');
  v_existing record;
  v_duplicate_id text;
  v_new_hash text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_staff_role_in(array['admin']) then
    raise exception 'Only an authenticated Admin can manage staff accounts.' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'manager', 'cashier') then
    raise exception 'Invalid employee role: %', p_role using errcode = '22023';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Employee name is required.' using errcode = '22023';
  end if;

  select *
  into v_existing
  from public.employees e
  where e.id = p_employee_id
    and e.user_id = v_uid
  limit 1;

  if v_existing.id is null and v_clean_pin is null then
    raise exception 'A 4-digit PIN is required when adding a new employee.' using errcode = '22023';
  end if;

  if v_clean_pin is not null then
    if v_clean_pin !~ '^\d{4}$' then
      raise exception 'PIN must be exactly 4 numeric digits.' using errcode = '22023';
    end if;

    select e.id
    into v_duplicate_id
    from public.employees e
    where e.user_id = v_uid
      and e.id <> p_employee_id
      and coalesce(e.pin_hash, '') like '$2%'
      and crypt(v_clean_pin, e.pin_hash) = e.pin_hash
    limit 1;

    if v_duplicate_id is not null then
      raise exception 'This 4-digit PIN is already assigned to another staff member.' using errcode = '23505';
    end if;

    v_new_hash := crypt(v_clean_pin, gen_salt('bf'));
  else
    v_new_hash := v_existing.pin_hash;
  end if;

  if v_existing.id is null then
    insert into public.employees (
      id, user_id, name, phone, role, pin_code, pin_hash, pin_updated_at, is_active
    )
    values (
      p_employee_id,
      v_uid,
      trim(p_name),
      coalesce(p_phone, ''),
      p_role,
      '****',
      v_new_hash,
      now(),
      coalesce(p_is_active, true)
    );
  else
    update public.employees
    set
      name = trim(p_name),
      phone = coalesce(p_phone, ''),
      role = p_role,
      pin_code = '****',
      pin_hash = coalesce(v_new_hash, pin_hash),
      pin_updated_at = case when v_clean_pin is not null then now() else pin_updated_at end,
      is_active = coalesce(p_is_active, true)
    where id = p_employee_id
      and user_id = v_uid;

    if coalesce(p_is_active, true) = false then
      delete from public.staff_sessions
      where user_id = v_uid
        and employee_id = p_employee_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_employee_id,
    'role', p_role,
    'hasPin', (coalesce(v_new_hash, '') <> '')
  );
end;
$$;

revoke all on function public.set_staff_pin(text, text, text, text, text, boolean) from public;
grant execute on function public.set_staff_pin(text, text, text, text, text, boolean) to authenticated, service_role;

create or replace function public.delete_staff_member(p_employee_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_target record;
  v_admin_count integer;
begin
  if v_uid is null or not public.is_staff_role_in(array['admin']) then
    raise exception 'Only an authenticated Admin can remove staff accounts.' using errcode = '42501';
  end if;

  select id, role
  into v_target
  from public.employees
  where id = p_employee_id
    and user_id = v_uid
  limit 1;

  if v_target.id is null then
    return jsonb_build_object('ok', false, 'error', 'Employee not found.');
  end if;

  if v_target.role = 'admin' then
    select count(*)
    into v_admin_count
    from public.employees
    where user_id = v_uid
      and role = 'admin'
      and is_active = true;

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the only active store admin.' using errcode = '22023';
    end if;
  end if;

  delete from public.staff_sessions
  where user_id = v_uid
    and employee_id = p_employee_id;

  delete from public.employees
  where id = p_employee_id
    and user_id = v_uid;

  return jsonb_build_object('ok', true, 'id', p_employee_id);
end;
$$;

revoke all on function public.delete_staff_member(text) from public;
grant execute on function public.delete_staff_member(text) to authenticated, service_role;

-- Cashier-safe atomic stock delta RPC for POS checkout & partial/full returns.
-- Allows cashiers to deduct/restore stock without granting write access to product pricing/catalog.
create or replace function public.apply_order_stock_delta(p_deltas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_entry jsonb;
  v_product_id text;
  v_delta numeric;
  v_updated integer := 0;
begin
  if v_uid is null or not public.is_staff_role_in(array['admin', 'manager', 'cashier']) then
    raise exception 'Active staff verification required to update inventory stock.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_deltas, '[]'::jsonb)) <> 'array' then
    raise exception 'Stock deltas payload must be a JSON array.' using errcode = '22023';
  end if;

  for v_entry in select value from jsonb_array_elements(p_deltas)
  loop
    v_product_id := nullif(trim(coalesce(v_entry ->> 'product_id', '')), '');
    v_delta := coalesce((v_entry ->> 'delta')::numeric, 0);

    if v_product_id is not null and v_delta <> 0 then
      update public.products
      set stock = greatest(0, round((coalesce(stock, 0)::numeric + v_delta)::numeric, 3))
      where id = v_product_id
        and user_id = v_uid;

      if found then
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$$;

revoke all on function public.apply_order_stock_delta(jsonb) from public;
grant execute on function public.apply_order_stock_delta(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PART C: BACKEND / DATABASE RBAC RESTRICTIVE POLICIES + PRIVILEGE HYGIENE
-- ---------------------------------------------------------------------------
-- Revoke anon privileges explicitly on all tenant operational tables.
revoke all on table public.products from anon, public;
revoke all on table public.orders from anon, public;
revoke all on table public.udhaar_customers from anon, public;
revoke all on table public.udhaar_entries from anon, public;
revoke all on table public.vendors from anon, public;
revoke all on table public.purchases from anon, public;
revoke all on table public.purchase_items from anon, public;
revoke all on table public.inventory_adjustments from anon, public;
revoke all on table public.customers from anon, public;
revoke all on table public.employees from anon, public;
revoke all on table public.store_settings from anon, public;
revoke all on table public.expenses from anon, public;

-- Never expose pin_hash or redacted pin_code unnecessarily to direct client SELECT if avoided,
-- while maintaining PostgREST compatibility for authenticated staff list reads:
grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.orders to authenticated;
grant select, insert, update, delete on table public.udhaar_customers to authenticated;
grant select, insert, update, delete on table public.udhaar_entries to authenticated;
grant select, insert, update, delete on table public.vendors to authenticated;
grant select, insert, update, delete on table public.purchases to authenticated;
grant select, insert, update, delete on table public.purchase_items to authenticated;
grant select, insert, update, delete on table public.inventory_adjustments to authenticated;
grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.store_settings to authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;

-- RESTRICTIVE RBAC Policies (ANDed with existing PERMISSIVE auth.uid() = user_id tenant policies):

-- 1. Products (Admin & Manager only for direct writes; Cashiers use apply_order_stock_delta RPC)
drop policy if exists "RBAC restrict products write to admin_manager" on public.products;
drop policy if exists "RBAC restrict products insert to admin_manager" on public.products;
drop policy if exists "RBAC restrict products update to admin_manager" on public.products;
drop policy if exists "RBAC restrict products delete to admin_manager" on public.products;

create policy "RBAC restrict products insert to admin_manager"
  on public.products as restrictive
  for insert to authenticated
  with check (public.is_staff_role_in(array['admin', 'manager']));

create policy "RBAC restrict products update to admin_manager"
  on public.products as restrictive
  for update to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));

create policy "RBAC restrict products delete to admin_manager"
  on public.products as restrictive
  for delete to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

-- 2. Vendors, Purchases, Purchase Items, Inventory Adjustments, Expenses (Admin & Manager only)
drop policy if exists "RBAC restrict vendors insert to admin_manager" on public.vendors;
drop policy if exists "RBAC restrict vendors update to admin_manager" on public.vendors;
drop policy if exists "RBAC restrict vendors delete to admin_manager" on public.vendors;

create policy "RBAC restrict vendors insert to admin_manager"
  on public.vendors as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict vendors update to admin_manager"
  on public.vendors as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict vendors delete to admin_manager"
  on public.vendors as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

drop policy if exists "RBAC restrict purchases insert to admin_manager" on public.purchases;
drop policy if exists "RBAC restrict purchases update to admin_manager" on public.purchases;
drop policy if exists "RBAC restrict purchases delete to admin_manager" on public.purchases;

create policy "RBAC restrict purchases insert to admin_manager"
  on public.purchases as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict purchases update to admin_manager"
  on public.purchases as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict purchases delete to admin_manager"
  on public.purchases as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

drop policy if exists "RBAC restrict purchase_items insert to admin_manager" on public.purchase_items;
drop policy if exists "RBAC restrict purchase_items update to admin_manager" on public.purchase_items;
drop policy if exists "RBAC restrict purchase_items delete to admin_manager" on public.purchase_items;

create policy "RBAC restrict purchase_items insert to admin_manager"
  on public.purchase_items as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict purchase_items update to admin_manager"
  on public.purchase_items as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict purchase_items delete to admin_manager"
  on public.purchase_items as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

drop policy if exists "RBAC restrict inventory_adjustments insert to admin_manager" on public.inventory_adjustments;
drop policy if exists "RBAC restrict inventory_adjustments update to admin_manager" on public.inventory_adjustments;
drop policy if exists "RBAC restrict inventory_adjustments delete to admin_manager" on public.inventory_adjustments;

create policy "RBAC restrict inventory_adjustments insert to admin_manager"
  on public.inventory_adjustments as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict inventory_adjustments update to admin_manager"
  on public.inventory_adjustments as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict inventory_adjustments delete to admin_manager"
  on public.inventory_adjustments as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

drop policy if exists "RBAC restrict expenses insert to admin_manager" on public.expenses;
drop policy if exists "RBAC restrict expenses update to admin_manager" on public.expenses;
drop policy if exists "RBAC restrict expenses delete to admin_manager" on public.expenses;

create policy "RBAC restrict expenses insert to admin_manager"
  on public.expenses as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict expenses update to admin_manager"
  on public.expenses as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));
create policy "RBAC restrict expenses delete to admin_manager"
  on public.expenses as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

-- 3. Employees & Store Settings (Admin only for INSERT/UPDATE/DELETE)
drop policy if exists "RBAC restrict employees insert to admin" on public.employees;
drop policy if exists "RBAC restrict employees update to admin" on public.employees;
drop policy if exists "RBAC restrict employees delete to admin" on public.employees;

create policy "RBAC restrict employees insert to admin"
  on public.employees as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin']));
create policy "RBAC restrict employees update to admin"
  on public.employees as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin']))
  with check (public.is_staff_role_in(array['admin']));
create policy "RBAC restrict employees delete to admin"
  on public.employees as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin']));

drop policy if exists "RBAC restrict store_settings insert to admin" on public.store_settings;
drop policy if exists "RBAC restrict store_settings update to admin" on public.store_settings;
drop policy if exists "RBAC restrict store_settings delete to admin" on public.store_settings;

create policy "RBAC restrict store_settings insert to admin"
  on public.store_settings as restrictive for insert to authenticated
  with check (public.is_staff_role_in(array['admin']));
create policy "RBAC restrict store_settings update to admin"
  on public.store_settings as restrictive for update to authenticated
  using (public.is_staff_role_in(array['admin']))
  with check (public.is_staff_role_in(array['admin']));
create policy "RBAC restrict store_settings delete to admin"
  on public.store_settings as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin']));

-- 4. Customers, Orders, Udhaar (Cashiers can create/update during billing; Admin-only DELETE)
drop policy if exists "RBAC restrict customers delete to admin" on public.customers;
create policy "RBAC restrict customers delete to admin"
  on public.customers as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin']));

drop policy if exists "RBAC restrict orders delete to admin" on public.orders;
create policy "RBAC restrict orders delete to admin"
  on public.orders as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin']));

drop policy if exists "RBAC restrict udhaar_customers delete to admin" on public.udhaar_customers;
create policy "RBAC restrict udhaar_customers delete to admin"
  on public.udhaar_customers as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin']));

drop policy if exists "RBAC restrict udhaar_entries delete to admin" on public.udhaar_entries;
create policy "RBAC restrict udhaar_entries delete to admin"
  on public.udhaar_entries as restrictive for delete to authenticated
  using (public.is_staff_role_in(array['admin']));

-- ---------------------------------------------------------------------------
-- PART D: PRODUCT-SPECIFIC SELLING UNITS & DECIMAL QUANTITY SUPPORT
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists selling_unit text not null default 'piece';

alter table public.products drop constraint if exists products_selling_unit_check;
alter table public.products add constraint products_selling_unit_check
  check (selling_unit in ('kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle'));

alter table public.products
  alter column stock type numeric(12,3) using round(coalesce(stock, 0)::numeric, 3);
alter table public.products
  alter column stock set default 0;

alter table public.purchase_items
  add column if not exists selling_unit text not null default 'piece';

alter table public.purchase_items drop constraint if exists purchase_items_selling_unit_check;
alter table public.purchase_items add constraint purchase_items_selling_unit_check
  check (selling_unit in ('kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle'));

alter table public.purchase_items
  alter column quantity type numeric(12,3) using round(quantity::numeric, 3);

alter table public.inventory_adjustments
  add column if not exists selling_unit text not null default 'piece';

alter table public.inventory_adjustments drop constraint if exists inventory_adjustments_selling_unit_check;
alter table public.inventory_adjustments add constraint inventory_adjustments_selling_unit_check
  check (selling_unit in ('kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle'));

alter table public.inventory_adjustments
  alter column quantity_change type numeric(12,3) using round(quantity_change::numeric, 3);
alter table public.inventory_adjustments
  alter column previous_stock type numeric(12,3) using round(coalesce(previous_stock, 0)::numeric, 3);
alter table public.inventory_adjustments
  alter column new_stock type numeric(12,3) using round(coalesce(new_stock, 0)::numeric, 3);

commit;
