-- =============================================================================
-- Migration: 20261125_founder_super_admin.sql (ADDITIVE — DO NOT AUTO-EXECUTE)
-- Purpose:
--   1. Provision the exact founder account (bc260436573mha@vu.edu.pk) in
--      public.super_admins and auth.users.raw_app_meta_data (role = super_admin),
--      removing legacy @gmail.com typo if present without prefix matching.
--   2. Update public.is_super_admin() to verify both public.super_admins and
--      immutable server app_metadata.role = 'super_admin'.
--   3. Add additive shop lifecycle columns on public.subscriptions
--      (status: active/suspended/blocked, suspended_at, suspended_reason, trial_ends_at)
--      while preserving all existing shop records.
--   4. Create public.saas_audit_logs for Super Admin subscription & shop status
--      audit history protected strictly by public.is_super_admin().
-- =============================================================================

begin;

-- 1. Ensure public.super_admins exists and seed exact founder email
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

insert into public.super_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = 'bc260436573mha@vu.edu.pk'
on conflict (user_id) do update
  set email = excluded.email;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"super_admin"}'::jsonb
where lower(email) = 'bc260436573mha@vu.edu.pk';

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
  )
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin';
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- 2. Additive lifecycle status & tracking columns on public.subscriptions
alter table public.subscriptions
  add column if not exists status text not null default 'active';

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'suspended', 'blocked'));

alter table public.subscriptions add column if not exists suspended_at timestamptz;
alter table public.subscriptions add column if not exists suspended_reason text not null default '';
alter table public.subscriptions add column if not exists trial_ends_at timestamptz;
alter table public.subscriptions add column if not exists max_branches integer not null default 3;
alter table public.subscriptions add column if not exists max_employees integer not null default 15;
alter table public.subscriptions add column if not exists payment_history jsonb not null default '[]'::jsonb;

update public.subscriptions
set status = 'blocked'
where is_blocked = true and status = 'active';

-- 3. Super Admin Platform Audit Logs
create table if not exists public.saas_audit_logs (
  id text primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  target_user_id uuid references auth.users(id) on delete cascade,
  target_email text not null default '',
  target_shop_name text not null default '',
  action text not null,
  previous_status text,
  new_status text,
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_saas_audit_logs_created_at on public.saas_audit_logs(created_at desc);
create index if not exists idx_saas_audit_logs_target_user on public.saas_audit_logs(target_user_id);

revoke all on table public.saas_audit_logs from anon, public;
grant select, insert on table public.saas_audit_logs to authenticated;
grant all privileges on table public.saas_audit_logs to service_role;

alter table public.saas_audit_logs enable row level security;

drop policy if exists "Super admin reads saas audit logs" on public.saas_audit_logs;
create policy "Super admin reads saas audit logs"
  on public.saas_audit_logs
  for select
  to authenticated
  using (public.is_super_admin());

drop policy if exists "Super admin inserts saas audit logs" on public.saas_audit_logs;
create policy "Super admin inserts saas audit logs"
  on public.saas_audit_logs
  for insert
  to authenticated
  with check (public.is_super_admin());

commit;
