-- =============================================================================
-- Migration: 20261124_commercial_pos_suite.sql (ADDITIVE — DO NOT AUTO-EXECUTE)
-- Purpose:
--   1. Additive commercial POS columns on existing tables (products, orders,
--      customers, udhaar_customers, purchases, expenses, employees, store_settings,
--      subscriptions) without altering existing constraints destructively.
--   2. New tenant-isolated & RBAC-protected tables:
--      - public.branches
--      - public.cash_shifts & public.cash_drawer_movements
--      - public.stock_transfers
--      - public.supplier_payments & public.purchase_returns
--      - public.whatsapp_logs
--      - public.audit_logs & public.employee_activity_logs
--
-- Prerequisites:
--   - Execute AFTER 20261122_schema_alignment_and_rls.sql and 20261123_security_rbac_and_units.sql.
--   - Relies on public.is_staff_role_in(text[]) and public.is_super_admin().
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ADDITIVE COLUMNS ON EXISTING TABLES
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists qr_code text not null default '';
alter table public.products add column if not exists brand text not null default '';
alter table public.products add column if not exists variant text not null default '';
alter table public.products add column if not exists wholesale_price numeric not null default 0;
alter table public.products add column if not exists min_stock numeric(12,3) not null default 5;
alter table public.products add column if not exists reorder_level numeric(12,3) not null default 10;
alter table public.products add column if not exists batch_number text not null default '';
alter table public.products add column if not exists expiry_date date;
alter table public.products add column if not exists branch_id text;
alter table public.products add column if not exists branch_stock jsonb not null default '{}'::jsonb;

alter table public.orders add column if not exists branch_id text;
alter table public.orders add column if not exists branch_name text not null default '';
alter table public.orders add column if not exists cashier_id text;
alter table public.orders add column if not exists cashier_name text not null default '';
alter table public.orders add column if not exists shift_id text;
alter table public.orders add column if not exists customer_id text;
alter table public.orders add column if not exists payment_splits jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists discount_mode text not null default 'percent';
alter table public.orders add column if not exists paid_amount numeric not null default 0;
alter table public.orders add column if not exists balance_due numeric not null default 0;
alter table public.orders add column if not exists client_tx_ref text;
alter table public.orders add column if not exists cancellation_reason text not null default '';
alter table public.orders add column if not exists cancelled_by text not null default '';
alter table public.orders add column if not exists cancelled_at timestamptz;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'card', 'mobile', 'jazzcash', 'easypaisa', 'bank_transfer', 'udhaar'));

create unique index if not exists idx_orders_user_client_tx_ref
  on public.orders(user_id, client_tx_ref)
  where client_tx_ref is not null and client_tx_ref <> '';

alter table public.customers add column if not exists credit_limit numeric not null default 0;
alter table public.customers add column if not exists discount_percent numeric not null default 0;
alter table public.customers add column if not exists due_date date;
alter table public.customers add column if not exists reminder_schedule text not null default 'none';
alter table public.customers add column if not exists notes text not null default '';
alter table public.customers add column if not exists whatsapp_opt_in boolean not null default false;
alter table public.customers add column if not exists whatsapp_opt_in_at timestamptz;

alter table public.udhaar_customers add column if not exists credit_limit numeric not null default 0;
alter table public.udhaar_customers add column if not exists discount_percent numeric not null default 0;
alter table public.udhaar_customers add column if not exists reminder_schedule text not null default 'none';
alter table public.udhaar_customers add column if not exists due_date date;
alter table public.udhaar_customers add column if not exists whatsapp_opt_in boolean not null default false;

alter table public.purchases add column if not exists branch_id text;
alter table public.purchases add column if not exists returned_amount numeric not null default 0;

alter table public.expenses add column if not exists branch_id text;
alter table public.expenses add column if not exists is_recurring boolean not null default false;
alter table public.expenses add column if not exists recurrence_interval text;
alter table public.expenses add column if not exists next_due_date date;
alter table public.expenses add column if not exists approval_status text not null default 'approved';
alter table public.expenses add column if not exists approved_by text not null default '';
alter table public.expenses add column if not exists paid_from_drawer boolean not null default false;

alter table public.employees add column if not exists branch_id text;
alter table public.employees add column if not exists shift_assignment text not null default '';
alter table public.employees add column if not exists custom_permissions jsonb not null default '[]'::jsonb;

alter table public.store_settings add column if not exists default_tax_rate numeric not null default 0;
alter table public.store_settings add column if not exists thermal_paper_width text not null default '80mm';
alter table public.store_settings add column if not exists enabled_payment_methods jsonb not null default '["cash","jazzcash","easypaisa","card","bank_transfer","udhaar"]'::jsonb;
alter table public.store_settings add column if not exists bank_name text not null default '';
alter table public.store_settings add column if not exists bank_account_title text not null default '';
alter table public.store_settings add column if not exists bank_account_number text not null default '';
alter table public.store_settings add column if not exists auto_kick_drawer boolean not null default false;
alter table public.store_settings add column if not exists show_customer_display boolean not null default true;
alter table public.store_settings add column if not exists whatsapp_auto_receipts boolean not null default false;
alter table public.store_settings add column if not exists whatsapp_template_receipt text not null default '';
alter table public.store_settings add column if not exists whatsapp_template_reminder text not null default '';

alter table public.subscriptions add column if not exists max_branches integer not null default 3;
alter table public.subscriptions add column if not exists max_employees integer not null default 15;
alter table public.subscriptions add column if not exists payment_history jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. MULTI-BRANCHES
-- ---------------------------------------------------------------------------
create table if not exists public.branches (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text not null default '',
  address text not null default '',
  phone text not null default '',
  is_main boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_branches_user_id on public.branches(user_id);
revoke all on table public.branches from anon, public;
grant select, insert, update, delete on table public.branches to authenticated;
grant all privileges on table public.branches to service_role;
alter table public.branches enable row level security;

drop policy if exists "Tenant owns branches" on public.branches;
create policy "Tenant owns branches"
  on public.branches
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "RBAC admin manages branches" on public.branches;
create policy "RBAC admin manages branches"
  on public.branches
  as restrictive
  for all
  to authenticated
  using (
    case
      when current_setting('role', true) = 'service_role' then true
      else public.is_staff_role_in(array['admin', 'manager', 'cashier'])
    end
  )
  with check (public.is_staff_role_in(array['admin']));

-- ---------------------------------------------------------------------------
-- 3. CASH SHIFTS & DRAWER MOVEMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.cash_shifts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id text,
  cashier_id text not null,
  cashier_name text not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null check (status in ('open', 'closed')) default 'open',
  opening_cash numeric not null default 0,
  expected_cash numeric not null default 0,
  actual_cash numeric,
  cash_difference numeric,
  cash_sales_total numeric not null default 0,
  cash_refunds_total numeric not null default 0,
  cash_in_total numeric not null default 0,
  cash_out_total numeric not null default 0,
  expense_total numeric not null default 0,
  closed_by_id text,
  closed_by_name text,
  closing_note text not null default '',
  movements jsonb not null default '[]'::jsonb
);

create index if not exists idx_cash_shifts_user_id on public.cash_shifts(user_id);
revoke all on table public.cash_shifts from anon, public;
grant select, insert, update, delete on table public.cash_shifts to authenticated;
grant all privileges on table public.cash_shifts to service_role;
alter table public.cash_shifts enable row level security;

drop policy if exists "Tenant owns cash shifts" on public.cash_shifts;
create policy "Tenant owns cash shifts"
  on public.cash_shifts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "RBAC cash shifts write" on public.cash_shifts;
create policy "RBAC cash shifts write"
  on public.cash_shifts
  as restrictive
  for all
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager', 'cashier']))
  with check (
    case
      when status = 'closed' then public.is_staff_role_in(array['admin', 'manager'])
      else public.is_staff_role_in(array['admin', 'manager', 'cashier'])
    end
  );

-- ---------------------------------------------------------------------------
-- 4. INTER-BRANCH STOCK TRANSFERS
-- ---------------------------------------------------------------------------
create table if not exists public.stock_transfers (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_branch_id text not null,
  from_branch_name text not null,
  to_branch_id text not null,
  to_branch_name text not null,
  status text not null check (status in ('pending', 'approved', 'completed', 'rejected')) default 'pending',
  items jsonb not null default '[]'::jsonb,
  requested_by text not null,
  approved_by text,
  note text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_stock_transfers_user_id on public.stock_transfers(user_id);
revoke all on table public.stock_transfers from anon, public;
grant select, insert, update, delete on table public.stock_transfers to authenticated;
grant all privileges on table public.stock_transfers to service_role;
alter table public.stock_transfers enable row level security;

drop policy if exists "Tenant owns stock transfers" on public.stock_transfers;
create policy "Tenant owns stock transfers"
  on public.stock_transfers
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "RBAC admin manager stock transfers" on public.stock_transfers;
create policy "RBAC admin manager stock transfers"
  on public.stock_transfers
  as restrictive
  for all
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));

-- ---------------------------------------------------------------------------
-- 5. SUPPLIER PAYMENTS & PURCHASE RETURNS
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id text not null,
  purchase_id text,
  amount numeric not null check (amount > 0),
  payment_method text not null,
  note text not null default '',
  employee_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_payments_user_id on public.supplier_payments(user_id);
revoke all on table public.supplier_payments from anon, public;
grant select, insert, update, delete on table public.supplier_payments to authenticated;
grant all privileges on table public.supplier_payments to service_role;
alter table public.supplier_payments enable row level security;

drop policy if exists "Tenant owns supplier payments" on public.supplier_payments;
create policy "Tenant owns supplier payments"
  on public.supplier_payments
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "RBAC supplier payments write" on public.supplier_payments;
create policy "RBAC supplier payments write"
  on public.supplier_payments
  as restrictive
  for all
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));

create table if not exists public.purchase_returns (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id text not null,
  vendor_id text not null,
  vendor_name text not null,
  invoice_number text not null default '',
  branch_id text,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric not null default 0,
  reason text not null default '',
  employee_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_returns_user_id on public.purchase_returns(user_id);
revoke all on table public.purchase_returns from anon, public;
grant select, insert, update, delete on table public.purchase_returns to authenticated;
grant all privileges on table public.purchase_returns to service_role;
alter table public.purchase_returns enable row level security;

drop policy if exists "Tenant owns purchase returns" on public.purchase_returns;
create policy "Tenant owns purchase returns"
  on public.purchase_returns
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "RBAC purchase returns write" on public.purchase_returns;
create policy "RBAC purchase returns write"
  on public.purchase_returns
  as restrictive
  for all
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']))
  with check (public.is_staff_role_in(array['admin', 'manager']));

-- ---------------------------------------------------------------------------
-- 6. WHATSAPP DELIVERY LOGS, AUDIT LOGS & EMPLOYEE ACTIVITY LOGS
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text,
  customer_name text not null,
  phone text not null,
  message_type text not null,
  content text not null,
  status text not null,
  delivery_mode text not null,
  provider_message_id text,
  error_message text,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_logs_user_id on public.whatsapp_logs(user_id);
revoke all on table public.whatsapp_logs from anon, public;
grant select, insert, update, delete on table public.whatsapp_logs to authenticated;
grant all privileges on table public.whatsapp_logs to service_role;
alter table public.whatsapp_logs enable row level security;

drop policy if exists "Tenant owns whatsapp logs" on public.whatsapp_logs;
create policy "Tenant owns whatsapp logs"
  on public.whatsapp_logs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.audit_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  target_id text,
  target_name text,
  details text not null default '',
  previous_value text,
  new_value text,
  branch_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
revoke all on table public.audit_logs from anon, public;
grant select, insert on table public.audit_logs to authenticated;
grant all privileges on table public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

drop policy if exists "Tenant owns audit logs" on public.audit_logs;
create policy "Tenant owns audit logs"
  on public.audit_logs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "RBAC read audit logs" on public.audit_logs;
create policy "RBAC read audit logs"
  on public.audit_logs
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

create table if not exists public.employee_activity_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  role text not null,
  event_type text not null,
  branch_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_employee_activity_user_id on public.employee_activity_logs(user_id);
revoke all on table public.employee_activity_logs from anon, public;
grant select, insert on table public.employee_activity_logs to authenticated;
grant all privileges on table public.employee_activity_logs to service_role;
alter table public.employee_activity_logs enable row level security;

drop policy if exists "Tenant owns employee activity logs" on public.employee_activity_logs;
create policy "Tenant owns employee activity logs"
  on public.employee_activity_logs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
