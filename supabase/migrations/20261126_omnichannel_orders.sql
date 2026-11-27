-- =============================================================================
-- SmartBitz / Khaas Retail POS — Omnichannel Order Management Migration
-- Additive, idempotent migration (does NOT drop or alter existing records).
-- NOTE: Review carefully before executing. Do NOT auto-execute against live DB.
--
-- Prerequisites:
--   - Execute AFTER supabase/schema.sql, 20261122_schema_alignment_and_rls.sql,
--     20261123_security_rbac_and_units.sql, and 20261124_commercial_pos_suite.sql.
--   - Relies on public.is_staff_role_in(text[]) and public.staff_sessions / public.employees.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. ADDITIVE COLUMNS ON EXISTING TABLES & PREFLIGHT ID TYPE COMPATIBILITY
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column if not exists storefront_slug text,
  add column if not exists storefront_enabled boolean not null default false,
  add column if not exists storefront_description text not null default '',
  add column if not exists cod_enabled boolean not null default true,
  add column if not exists whatsapp_business_phone_id text,
  add column if not exists online_payment_enabled boolean not null default false;

create unique index if not exists idx_store_settings_storefront_slug
  on public.store_settings (lower(storefront_slug))
  where storefront_slug is not null and btrim(storefront_slug) <> '';

create index if not exists idx_store_settings_wa_phone_id
  on public.store_settings (whatsapp_business_phone_id)
  where whatsapp_business_phone_id is not null and btrim(whatsapp_business_phone_id) <> '';

-- Ensure products supports branch_stock and updated_at used by omnichannel RPCs
alter table public.products
  add column if not exists branch_stock jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Ensure inventory_adjustments has branch_id and actor_name
alter table public.inventory_adjustments
  add column if not exists branch_id text,
  add column if not exists actor_name text not null default '';

create index if not exists idx_inventory_adjustments_user_branch
  on public.inventory_adjustments (user_id, branch_id);

-- Preflight: verify prerequisite tables & exact ID column types before proceeding
do $$
declare
  v_products_id_type text;
  v_adj_id_type text;
  v_adj_product_id_type text;
  v_adj_branch_id_type text;
  v_branches_id_type text;
  v_customers_id_type text;
  v_non_uuid_branch_count bigint;
begin
  select data_type into v_products_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'id';

  select data_type into v_adj_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inventory_adjustments' and column_name = 'id';

  select data_type into v_adj_product_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inventory_adjustments' and column_name = 'product_id';

  select data_type into v_adj_branch_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inventory_adjustments' and column_name = 'branch_id';

  select data_type into v_branches_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'branches' and column_name = 'id';

  select data_type into v_customers_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customers' and column_name = 'id';

  if v_products_id_type is null then
    raise exception 'Aborting migration: prerequisite column public.products.id was not found.';
  end if;
  if v_adj_id_type is null or v_adj_product_id_type is null or v_adj_branch_id_type is null then
    raise exception 'Aborting migration: prerequisite table public.inventory_adjustments is missing id, product_id, or branch_id.';
  end if;
  if v_branches_id_type is null then
    raise exception 'Aborting migration: prerequisite table public.branches(id) was not found. Apply 20261124_commercial_pos_suite.sql first.';
  end if;
  if v_customers_id_type is null then
    raise exception 'Aborting migration: prerequisite table public.customers(id) was not found.';
  end if;

  if to_regclass('public.employees') is null
     or to_regclass('public.staff_sessions') is null
     or to_regprocedure('public.is_staff_role_in(text[])') is null then
    raise exception 'Aborting migration: prerequisite RBAC tables/functions (public.employees, public.staff_sessions, public.is_staff_role_in(text[])) were not found. Apply 20261123_security_rbac_and_units.sql first.';
  end if;

  if to_regclass('public.omnichannel_orders') is not null then
    perform 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'omnichannel_orders'
      and column_name = 'id'
      and data_type in ('text', 'character varying');
    if not found then
      raise exception 'Aborting migration: existing public.omnichannel_orders.id must be text/character varying.';
    end if;
  end if;

  if to_regclass('public.order_audit_logs') is not null then
    perform 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_audit_logs'
      and column_name = 'order_id'
      and data_type in ('text', 'character varying');
    if not found then
      raise exception 'Aborting migration: existing public.order_audit_logs.order_id must be text/character varying.';
    end if;
  end if;

  if v_products_id_type not in ('text', 'character varying', 'uuid') then
    raise exception 'Aborting migration: unsupported public.products.id type "%".', v_products_id_type;
  end if;

  if v_adj_id_type not in ('uuid', 'text', 'character varying') then
    raise exception 'Aborting migration: unsupported public.inventory_adjustments.id type "%".', v_adj_id_type;
  end if;

  if v_adj_product_id_type not in ('text', 'character varying', 'uuid') then
    raise exception 'Aborting migration: unsupported public.inventory_adjustments.product_id type "%".', v_adj_product_id_type;
  end if;

  if v_products_id_type in ('text', 'character varying') and v_adj_product_id_type = 'uuid' then
    raise exception
      'Aborting migration: public.products.id has type "%" while public.inventory_adjustments.product_id is uuid. Refusing to silently convert or invalidate non-UUID product IDs.',
      v_products_id_type;
  end if;

  if v_branches_id_type not in ('text', 'character varying', 'uuid') then
    raise exception 'Aborting migration: unsupported public.branches.id type "%".', v_branches_id_type;
  end if;

  if v_adj_branch_id_type not in ('text', 'character varying') then
    raise exception
      'Aborting migration: public.inventory_adjustments.branch_id has type "%", expected text/character varying for lossless branch ID recording.',
      v_adj_branch_id_type;
  end if;

  if v_branches_id_type = 'uuid' then
    execute $q$
      select count(*)
      from public.inventory_adjustments
      where branch_id is not null
        and btrim(branch_id) <> ''
        and btrim(branch_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $q$ into v_non_uuid_branch_count;

    if v_non_uuid_branch_count > 0 then
      raise exception
        'Aborting migration: % row(s) in public.inventory_adjustments.branch_id contain non-UUID values while public.branches.id is uuid.',
        v_non_uuid_branch_count;
    end if;
  end if;

  if v_customers_id_type not in ('uuid', 'text', 'character varying') then
    raise exception 'Aborting migration: unsupported public.customers.id type "%".', v_customers_id_type;
  end if;
end $$;

-- Safely widen ONLY compatible single-column adjustment_type check constraints
do $$
declare
  v_expected_types constant text[] := array[
    'Damaged',
    'Expired',
    'Lost/Theft',
    'Stock Count Correction',
    'Sale Stock Out',
    'Sale Return In',
    'Purchase Stock In',
    'Purchase Return Out',
    'Branch Transfer'
  ];
  v_adj_attnum smallint;
  v_unexpected_row_count bigint;
  v_unexpected_sample text;
  v_single_col_count integer := 0;
  v_target_conname text := null;
  v_target_condef text := null;
  v_literal text;
  v_already_allows_omni boolean := false;
  chk record;
begin
  -- 1a. Audit existing live rows before touching any constraint
  select count(*), min(adjustment_type)
  into v_unexpected_row_count, v_unexpected_sample
  from public.inventory_adjustments
  where adjustment_type is null
     or adjustment_type <> all(v_expected_types);

  if v_unexpected_row_count > 0 then
    raise exception
      'Aborting migration: % row(s) in public.inventory_adjustments contain unexpected adjustment_type (sample: %). No constraints were modified.',
      v_unexpected_row_count, coalesce(v_unexpected_sample, '<NULL>');
  end if;

  -- 1b. Locate adjustment_type column attnum and inspect ONLY single-column CHECK constraints on adjustment_type
  select a.attnum into v_adj_attnum
  from pg_attribute a
  join pg_class t on t.oid = a.attrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'inventory_adjustments'
    and a.attname = 'adjustment_type'
    and not a.attisdropped;

  if v_adj_attnum is null then
    raise exception 'Aborting migration: column public.inventory_adjustments.adjustment_type was not found.';
  end if;

  for chk in
    select
      c.conname,
      pg_get_constraintdef(c.oid) as condef
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'inventory_adjustments'
      and c.contype = 'c'
      and c.conkey = array[v_adj_attnum]
  loop
    v_single_col_count := v_single_col_count + 1;
    v_target_conname := chk.conname;
    v_target_condef := chk.condef;

    -- Reject unexpected non-enum custom single-column constraints instead of dropping them blindly
    if v_target_condef !~* 'check\s*\(\s*\(?\s*adjustment_type\s*(= any|in)\s*\(' then
      raise exception
        'Aborting migration: unrecognized single-column CHECK constraint "%" (%) on public.inventory_adjustments.adjustment_type. Inspect manually before upgrading.',
        v_target_conname, v_target_condef;
    end if;

    -- Verify every existing string literal in the constraint is in our additive superset
    for v_literal in
      select m[1]
      from regexp_matches(v_target_condef, '''([^'']+)''', 'g') as m
    loop
      if v_literal <> all(v_expected_types) then
        raise exception
          'Aborting migration: existing CHECK constraint "%" allows value "%" which is not in the expected superset. Refusing to silently remove existing protections.',
          v_target_conname, v_literal;
      end if;
    end loop;
  end loop;

  if v_single_col_count > 1 then
    raise exception
      'Aborting migration: found % separate single-column CHECK constraints on public.inventory_adjustments.adjustment_type; refusing to drop multiple constraints automatically.',
      v_single_col_count;
  end if;

  -- 1c. Only replace the verified single-column enum constraint if it does not already allow omnichannel types
  if v_target_condef is not null then
    v_already_allows_omni :=
      position('''Sale Stock Out''' in v_target_condef) > 0
      and position('''Sale Return In''' in v_target_condef) > 0;
  end if;

  if not v_already_allows_omni then
    if v_target_conname is not null then
      execute format('alter table public.inventory_adjustments drop constraint %I', v_target_conname);
    end if;

    alter table public.inventory_adjustments
      add constraint inventory_adjustments_adjustment_type_check
      check (
        adjustment_type in (
          'Damaged',
          'Expired',
          'Lost/Theft',
          'Stock Count Correction',
          'Sale Stock Out',
          'Sale Return In',
          'Purchase Stock In',
          'Purchase Return Out',
          'Branch Transfer'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. OMNICHANNEL ORDERS TABLE (Website, WhatsApp, Phone)
-- ---------------------------------------------------------------------------
create table if not exists public.omnichannel_orders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  branch_id text,
  branch_name text not null default '',
  order_number text not null,
  channel text not null check (channel in ('website', 'whatsapp', 'phone')),
  status text not null default 'new' check (
    status in ('new', 'accepted', 'preparing', 'ready', 'delivered', 'rejected', 'cancelled')
  ),
  customer_id uuid,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  payment_method text not null default 'cod',
  payment_status text not null default 'unpaid' check (
    payment_status in ('unpaid', 'cod_pending', 'partially_paid', 'paid', 'refunded')
  ),
  paid_amount numeric(14,2) not null default 0,
  idempotency_key text,
  external_message_id text,
  stock_reserved boolean not null default false,
  stock_reserved_at timestamptz,
  stock_restored_at timestamptz,
  status_history jsonb not null default '[]'::jsonb,
  notification_log jsonb not null default '[]'::jsonb,
  cancellation_reason text,
  created_by text not null default 'customer',
  updated_by text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce retention-safe ON DELETE RESTRICT on omnichannel_orders.user_id and verify branch_id / customer_id FKs
do $$
declare
  fk record;
  v_has_user_restrict_fk boolean := false;
  v_user_fk_name text := 'omnichannel_orders_user_id_fkey';
  v_branches_id_type text;
  v_omni_branch_id_type text;
  v_invalid_branch_uuid_count bigint;
  v_customers_id_type text;
  v_omni_customer_id_type text;
  v_invalid_uuid_count bigint;
begin
  -- 2a. Upgrade any pre-existing CASCADE / SET NULL / SET DEFAULT FK on omnichannel_orders.user_id -> auth.users(id)
  for fk in
    select
      c.conname,
      c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'omnichannel_orders'
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and array_length(c.conkey, 1) = 1
      and a.attname = 'user_id'
    order by c.conname
  loop
    if fk.confdeltype in ('r', 'a') then
      v_has_user_restrict_fk := true;
    elsif fk.confdeltype in ('c', 'n', 'd') then
      execute format('alter table public.omnichannel_orders drop constraint %I', fk.conname);
    end if;
  end loop;

  if not v_has_user_restrict_fk then
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'omnichannel_orders'
        and c.conname = v_user_fk_name
    ) then
      v_user_fk_name := 'omnichannel_orders_user_id_restrict_fkey';
    end if;

    execute format(
      'alter table public.omnichannel_orders add constraint %I foreign key (user_id) references auth.users(id) on delete restrict',
      v_user_fk_name
    );
  end if;

  -- 2b. branch_id -> public.branches(id) (expected text per 20261124_commercial_pos_suite.sql)
  select data_type into v_branches_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'branches' and column_name = 'id';

  select data_type into v_omni_branch_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'omnichannel_orders' and column_name = 'branch_id';

  if v_branches_id_type = 'uuid' and v_omni_branch_id_type in ('text', 'character varying') then
    execute $q$
      select count(*)
      from public.omnichannel_orders
      where branch_id is not null
        and btrim(branch_id) <> ''
        and btrim(branch_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $q$ into v_invalid_branch_uuid_count;

    if v_invalid_branch_uuid_count > 0 then
      raise exception
        'Aborting migration: % row(s) in omnichannel_orders.branch_id contain non-UUID values while branches.id is uuid.',
        v_invalid_branch_uuid_count;
    end if;

    alter table public.omnichannel_orders
      alter column branch_id type uuid
      using nullif(btrim(branch_id), '')::uuid;

    v_omni_branch_id_type := 'uuid';
  elsif v_branches_id_type in ('text', 'character varying') and v_omni_branch_id_type = 'uuid' then
    alter table public.omnichannel_orders
      alter column branch_id type text
      using branch_id::text;

    v_omni_branch_id_type := 'text';
  end if;

  if v_branches_id_type is null or not (
    (v_branches_id_type = 'uuid' and v_omni_branch_id_type = 'uuid')
    or (v_branches_id_type in ('text', 'character varying') and v_omni_branch_id_type in ('text', 'character varying'))
  ) then
    raise exception
      'Aborting migration: incompatible types between public.omnichannel_orders.branch_id (%) and public.branches.id (%).',
      coalesce(v_omni_branch_id_type, '<missing>'), coalesce(v_branches_id_type, '<missing>');
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'omnichannel_orders'
      and c.contype = 'f'
      and c.conname = 'omnichannel_orders_branch_id_fkey'
  ) then
    alter table public.omnichannel_orders
      add constraint omnichannel_orders_branch_id_fkey
      foreign key (branch_id) references public.branches(id) on delete set null;
  end if;

  -- 2c. customer_id -> public.customers(id) (expected uuid per schema.sql)
  select data_type into v_customers_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customers' and column_name = 'id';

  select data_type into v_omni_customer_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'omnichannel_orders' and column_name = 'customer_id';

  if v_customers_id_type = 'uuid' and v_omni_customer_id_type in ('text', 'character varying') then
    execute $q$
      select count(*)
      from public.omnichannel_orders
      where customer_id is not null
        and btrim(customer_id) <> ''
        and btrim(customer_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $q$ into v_invalid_uuid_count;

    if v_invalid_uuid_count > 0 then
      raise exception
        'Aborting migration: % row(s) in omnichannel_orders.customer_id contain non-UUID values while customers.id is uuid.',
        v_invalid_uuid_count;
    end if;

    alter table public.omnichannel_orders
      alter column customer_id type uuid
      using nullif(btrim(customer_id), '')::uuid;

    v_omni_customer_id_type := 'uuid';
  elsif v_customers_id_type in ('text', 'character varying') and v_omni_customer_id_type = 'uuid' then
    -- Lossless widening from uuid to text when customers.id is text
    alter table public.omnichannel_orders
      alter column customer_id type text
      using customer_id::text;

    v_omni_customer_id_type := 'text';
  end if;

  if v_customers_id_type is null or not (
    (v_customers_id_type = 'uuid' and v_omni_customer_id_type = 'uuid')
    or (v_customers_id_type in ('text', 'character varying') and v_omni_customer_id_type in ('text', 'character varying'))
  ) then
    raise exception
      'Aborting migration: incompatible types between public.omnichannel_orders.customer_id (%) and public.customers.id (%).',
      coalesce(v_omni_customer_id_type, '<missing>'), coalesce(v_customers_id_type, '<missing>');
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'omnichannel_orders'
      and c.contype = 'f'
      and c.conname = 'omnichannel_orders_customer_id_fkey'
  ) then
    alter table public.omnichannel_orders
      add constraint omnichannel_orders_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;
end $$;

create unique index if not exists idx_omnichannel_orders_user_number
  on public.omnichannel_orders (user_id, order_number);

create unique index if not exists idx_omnichannel_orders_idempotency
  on public.omnichannel_orders (user_id, idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

create unique index if not exists idx_omnichannel_orders_external_msg
  on public.omnichannel_orders (user_id, external_message_id)
  where external_message_id is not null and btrim(external_message_id) <> '';

create index if not exists idx_omnichannel_orders_user_status_created
  on public.omnichannel_orders (user_id, status, created_at desc);

create index if not exists idx_omnichannel_orders_user_channel_created
  on public.omnichannel_orders (user_id, channel, created_at desc);

create index if not exists idx_omnichannel_orders_customer_id
  on public.omnichannel_orders (user_id, customer_id)
  where customer_id is not null;

-- Database-level guards on omnichannel_orders INSERT & direct authenticated UPDATE
create or replace function public.guard_omnichannel_orders_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_trusted_actor boolean := (
    coalesce(current_setting('role', true), '') in ('service_role', 'postgres', 'supabase_admin')
    or current_user in ('service_role', 'postgres', 'supabase_admin')
  );
begin
  if not v_is_trusted_actor then
    raise exception 'Direct client insertion into omnichannel_orders is prohibited; use create_omnichannel_order RPC or authorized server workflows.'
      using errcode = '42501';
  end if;

  if new.status <> 'new' then
    raise exception 'New omnichannel orders must start with status ''new''.'
      using errcode = '42501';
  end if;

  if coalesce(new.stock_reserved, false) <> false
     or new.stock_reserved_at is not null
     or new.stock_restored_at is not null then
    raise exception 'New omnichannel orders cannot pre-set stock_reserved, stock_reserved_at, or stock_restored_at.'
      using errcode = '42501';
  end if;

  if coalesce(new.total, 0) < 0
     or coalesce(new.paid_amount, 0) < 0
     or coalesce(new.paid_amount, 0) > coalesce(new.total, 0) then
    raise exception 'New omnichannel orders must have valid non-negative totals and paid amounts.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_omnichannel_orders_insert() from public, anon;

drop trigger if exists trg_omnichannel_orders_guard_insert on public.omnichannel_orders;
create trigger trg_omnichannel_orders_guard_insert
  before insert on public.omnichannel_orders
  for each row
  execute function public.guard_omnichannel_orders_insert();

create or replace function public.guard_omnichannel_orders_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_trusted_actor boolean := (
    coalesce(current_setting('role', true), '') in ('service_role', 'postgres', 'supabase_admin')
    or current_user in ('service_role', 'postgres', 'supabase_admin')
  );
begin
  if not v_is_trusted_actor then
    -- Block direct authenticated modifications to financial, identity, stock reservation, or history/notification fields
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.channel is distinct from old.channel
       or new.order_number is distinct from old.order_number
       or new.items is distinct from old.items
       or new.subtotal is distinct from old.subtotal
       or new.discount_amount is distinct from old.discount_amount
       or new.tax_amount is distinct from old.tax_amount
       or new.total is distinct from old.total
       or new.payment_method is distinct from old.payment_method
       or new.payment_status is distinct from old.payment_status
       or new.paid_amount is distinct from old.paid_amount
       or new.stock_reserved is distinct from old.stock_reserved
       or new.stock_reserved_at is distinct from old.stock_reserved_at
       or new.stock_restored_at is distinct from old.stock_restored_at
       or new.status_history is distinct from old.status_history
       or new.notification_log is distinct from old.notification_log
       or new.cancellation_reason is distinct from old.cancellation_reason
       or new.idempotency_key is distinct from old.idempotency_key
       or new.external_message_id is distinct from old.external_message_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Direct modification of protected omnichannel order fields is prohibited; use authorized server workflows or RPCs.'
        using errcode = '42501';
    end if;

    -- Block ALL direct authenticated status transitions so audit logging and stock checks cannot be bypassed
    if new.status is distinct from old.status then
      raise exception 'Direct omnichannel order status transitions (%) are prohibited; use authorized status transition RPCs or server workflows.', new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_omnichannel_orders_update() from public, anon;

drop trigger if exists trg_omnichannel_orders_guard_update on public.omnichannel_orders;
create trigger trg_omnichannel_orders_guard_update
  before update on public.omnichannel_orders
  for each row
  execute function public.guard_omnichannel_orders_update();

-- ---------------------------------------------------------------------------
-- 3. WEBHOOK IDEMPOTENCY EVENTS TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id text primary key,
  channel text not null check (channel in ('whatsapp', 'website')),
  event_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  payload_hash text not null default '',
  status text not null default 'processed',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_webhook_events_channel_event
  on public.webhook_events (channel, event_id);

create index if not exists idx_webhook_events_user_id
  on public.webhook_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. GENUINELY APPEND-ONLY ORDER AUDIT TRAIL TABLE (ON DELETE RESTRICT)
-- ---------------------------------------------------------------------------
create table if not exists public.order_audit_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id text not null references public.omnichannel_orders(id) on delete restrict,
  action text not null,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  previous_status text,
  new_status text,
  details text not null default '',
  created_at timestamptz not null default now()
);

-- Ensure pre-existing CASCADE / SET NULL / SET DEFAULT FKs on order_audit_logs(order_id) and order_audit_logs(user_id) are upgraded to ON DELETE RESTRICT
do $$
declare
  fk record;
  v_has_order_restrict_fk boolean := false;
  v_order_fk_name text := 'order_audit_logs_order_id_fkey';
  v_has_user_restrict_fk boolean := false;
  v_user_fk_name text := 'order_audit_logs_user_id_fkey';
begin
  -- 4a. order_id -> public.omnichannel_orders(id)
  for fk in
    select
      c.conname,
      c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'order_audit_logs'
      and c.contype = 'f'
      and c.confrelid = 'public.omnichannel_orders'::regclass
      and array_length(c.conkey, 1) = 1
      and a.attname = 'order_id'
    order by c.conname
  loop
    if fk.confdeltype in ('r', 'a') then
      v_has_order_restrict_fk := true;
    elsif fk.confdeltype in ('c', 'n', 'd') then
      execute format('alter table public.order_audit_logs drop constraint %I', fk.conname);
    end if;
  end loop;

  if not v_has_order_restrict_fk then
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'order_audit_logs'
        and c.conname = v_order_fk_name
    ) then
      v_order_fk_name := 'order_audit_logs_order_id_restrict_fkey';
    end if;

    execute format(
      'alter table public.order_audit_logs add constraint %I foreign key (order_id) references public.omnichannel_orders(id) on delete restrict',
      v_order_fk_name
    );
  end if;

  -- 4b. user_id -> auth.users(id) (retention-safe: deleting a tenant cannot erase audit history)
  for fk in
    select
      c.conname,
      c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'order_audit_logs'
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and array_length(c.conkey, 1) = 1
      and a.attname = 'user_id'
    order by c.conname
  loop
    if fk.confdeltype in ('r', 'a') then
      v_has_user_restrict_fk := true;
    elsif fk.confdeltype in ('c', 'n', 'd') then
      execute format('alter table public.order_audit_logs drop constraint %I', fk.conname);
    end if;
  end loop;

  if not v_has_user_restrict_fk then
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'order_audit_logs'
        and c.conname = v_user_fk_name
    ) then
      v_user_fk_name := 'order_audit_logs_user_id_restrict_fkey';
    end if;

    execute format(
      'alter table public.order_audit_logs add constraint %I foreign key (user_id) references auth.users(id) on delete restrict',
      v_user_fk_name
    );
  end if;
end $$;

create index if not exists idx_order_audit_logs_order_created
  on public.order_audit_logs (user_id, order_id, created_at desc);

-- Strictly append-only: unconditionally block UPDATE and DELETE for EVERY role (including service_role, postgres, supabase_admin)
create or replace function public.prevent_order_audit_logs_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'order_audit_logs is strictly append-only; % operations are prohibited for all roles.', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.prevent_order_audit_logs_mutation() from public, anon;

drop trigger if exists trg_order_audit_logs_append_only on public.order_audit_logs;
create trigger trg_order_audit_logs_append_only
  before update or delete on public.order_audit_logs
  for each row
  execute function public.prevent_order_audit_logs_mutation();

-- Restrict audit INSERT strictly to trusted server/RPC context + enforce matching tenant ownership
create or replace function public.guard_order_audit_logs_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_trusted_actor boolean := (
    coalesce(current_setting('role', true), '') in ('service_role', 'postgres', 'supabase_admin')
    or current_user in ('service_role', 'postgres', 'supabase_admin')
  );
  v_order_user_id uuid;
begin
  if not v_is_trusted_actor then
    raise exception 'Direct client insertion into order_audit_logs is prohibited; audit entries are written only by authorized RPCs/server workflows.'
      using errcode = '42501';
  end if;

  select o.user_id
  into v_order_user_id
  from public.omnichannel_orders o
  where o.id = new.order_id;

  if v_order_user_id is null or v_order_user_id <> new.user_id then
    raise exception 'Audit log tenant user_id (%) does not match target omnichannel order.', new.user_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_order_audit_logs_insert() from public, anon;

drop trigger if exists trg_order_audit_logs_guard_insert on public.order_audit_logs;
create trigger trg_order_audit_logs_guard_insert
  before insert on public.order_audit_logs
  for each row
  execute function public.guard_order_audit_logs_insert();

-- ---------------------------------------------------------------------------
-- 5. STRICT ROW-LEVEL SECURITY, TENANT ISOLATION & LEAST-PRIVILEGE GRANTS
-- ---------------------------------------------------------------------------
alter table public.omnichannel_orders enable row level security;
alter table public.webhook_events enable row level security;
alter table public.order_audit_logs enable row level security;

-- Explicit privilege hygiene (zero anon/public access; NO direct INSERT or status/history/financial UPDATE for authenticated)
revoke all on table public.omnichannel_orders from anon, public, authenticated;
grant select, delete on table public.omnichannel_orders to authenticated;
grant update (
  branch_id,
  branch_name,
  customer_id,
  customer_name,
  customer_phone,
  delivery_address,
  notes,
  updated_by,
  updated_at
) on table public.omnichannel_orders to authenticated;
grant all privileges on table public.omnichannel_orders to service_role;

revoke all on table public.webhook_events from anon, public, authenticated;
grant select on table public.webhook_events to authenticated;
grant all privileges on table public.webhook_events to service_role;

-- Strictly append-only & server-inserted privileges on order_audit_logs:
-- authenticated has SELECT ONLY; service_role has SELECT + INSERT ONLY (no UPDATE/DELETE)
revoke all on table public.order_audit_logs from anon, public, authenticated, service_role;
grant select on table public.order_audit_logs to authenticated;
grant select, insert on table public.order_audit_logs to service_role;

-- 5a. omnichannel_orders RLS (strict auth.uid() = user_id tenant isolation + RBAC + anti-bypass)
drop policy if exists omnichannel_orders_tenant_all on public.omnichannel_orders;
create policy omnichannel_orders_tenant_all
  on public.omnichannel_orders
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists omnichannel_orders_rbac_select on public.omnichannel_orders;
create policy omnichannel_orders_rbac_select
  on public.omnichannel_orders
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager', 'cashier']));

drop policy if exists omnichannel_orders_rbac_insert on public.omnichannel_orders;
create policy omnichannel_orders_rbac_insert
  on public.omnichannel_orders
  as restrictive
  for insert
  to authenticated
  with check (false);

drop policy if exists omnichannel_orders_rbac_write on public.omnichannel_orders;
drop policy if exists omnichannel_orders_rbac_update on public.omnichannel_orders;
create policy omnichannel_orders_rbac_update
  on public.omnichannel_orders
  as restrictive
  for update
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager', 'cashier']))
  with check (public.is_staff_role_in(array['admin', 'manager', 'cashier']));

drop policy if exists omnichannel_orders_rbac_delete on public.omnichannel_orders;
create policy omnichannel_orders_rbac_delete
  on public.omnichannel_orders
  as restrictive
  for delete
  to authenticated
  using (public.is_staff_role_in(array['admin']));

-- 5b. webhook_events RLS (strict tenant read-only for Admin/Manager; written only by service_role)
drop policy if exists webhook_events_tenant_read on public.webhook_events;
create policy webhook_events_tenant_read
  on public.webhook_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists webhook_events_rbac_select on public.webhook_events;
create policy webhook_events_rbac_select
  on public.webhook_events
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

-- 5c. order_audit_logs RLS (strict tenant SELECT only for Admin/Manager; zero client INSERT/UPDATE/DELETE policies)
drop policy if exists order_audit_logs_tenant_all on public.order_audit_logs;
drop policy if exists order_audit_logs_tenant_insert on public.order_audit_logs;
drop policy if exists order_audit_logs_rbac_insert on public.order_audit_logs;
drop policy if exists order_audit_logs_tenant_select on public.order_audit_logs;
create policy order_audit_logs_tenant_select
  on public.order_audit_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists order_audit_logs_rbac_select on public.order_audit_logs;
create policy order_audit_logs_rbac_select
  on public.order_audit_logs
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

-- ---------------------------------------------------------------------------
-- 6. ATOMIC POSTGRES RPC: AUTHORITATIVE ORDER CREATION + AUDIT LOG
-- ---------------------------------------------------------------------------
create or replace function public.create_omnichannel_order(
  p_user_id uuid,
  p_channel text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text default '',
  p_notes text default '',
  p_branch_id text default null,
  p_customer_id text default null,
  p_discount_amount numeric default 0,
  p_payment_method text default 'cod',
  p_payment_status text default null,
  p_paid_amount numeric default 0,
  p_idempotency_key text default null,
  p_external_message_id text default null,
  p_order_number text default null,
  p_items jsonb default '[]'::jsonb,
  p_actor_id text default null,
  p_actor_name text default null,
  p_actor_role text default null,
  p_notification_entry jsonb default null,
  p_allow_online_payment boolean default false,
  p_require_stock_check boolean default false,
  p_history_note text default null,
  p_audit_action text default null,
  p_audit_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_db_role text := coalesce(nullif(current_setting('role', true), ''), '');
  v_is_service_role boolean := (v_db_role = 'service_role');
  v_caller_uid uuid := auth.uid();
  v_headers jsonb := '{}'::jsonb;
  v_staff_token text;
  v_session record;
  v_owner record;
  v_has_employees boolean := false;
  v_emp record;
  v_requested_actor_id text := nullif(btrim(coalesce(p_actor_id, '')), '');
  v_effective_actor_id text;
  v_effective_actor_name text;
  v_effective_actor_role text;
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_clean_idem_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_clean_ext_msg_id text := nullif(btrim(coalesce(p_external_message_id, '')), '');
  v_is_wa_webhook boolean := false;
  v_existing public.omnichannel_orders%rowtype;
  v_sub jsonb;
  v_store public.store_settings%rowtype;
  v_has_store boolean := false;
  v_clean_branch_id text := nullif(btrim(coalesce(p_branch_id, '')), '');
  v_branch_rec record;
  v_resolved_branch_id public.omnichannel_orders.branch_id%type := null;
  v_resolved_branch_name text := '';
  v_branch_key text;
  v_clean_customer_id text := nullif(btrim(coalesce(p_customer_id, '')), '');
  v_cust_rec record;
  v_resolved_customer_id public.omnichannel_orders.customer_id%type := null;
  v_customer_name text := btrim(coalesce(p_customer_name, ''));
  v_customer_phone text := btrim(coalesce(p_customer_phone, ''));
  v_delivery_address text := btrim(coalesce(p_delivery_address, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_raw_item jsonb;
  v_qty_check numeric;
  v_line record;
  v_prod public.products%rowtype;
  v_qty numeric(12,3);
  v_global_stock numeric(12,3);
  v_branch_available numeric(12,3);
  v_has_branch_map boolean := false;
  v_other_branch_total numeric(12,3) := 0;
  v_has_negative_branch boolean := false;
  v_available numeric(12,3);
  v_unit_price numeric(14,2);
  v_tax_rate numeric;
  v_line_subtotal numeric(14,2);
  v_line_tax numeric(14,2);
  v_line_total numeric(14,2);
  v_resolved_items jsonb := '[]'::jsonb;
  v_subtotal numeric(14,2) := 0;
  v_tax_amount numeric(14,2) := 0;
  v_discount_amount numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_payment_method text := lower(btrim(coalesce(p_payment_method, 'cod')));
  v_req_pay_status text := nullif(lower(btrim(coalesce(p_payment_status, ''))), '');
  v_payment_status text;
  v_paid_amount numeric(14,2) := 0;
  v_now timestamptz := now();
  v_order_id text;
  v_order_number text;
  v_history_note text;
  v_history_entry jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_audit_action text;
  v_audit_details text;
  v_created public.omnichannel_orders%rowtype;
begin
  if p_user_id is null then
    raise exception 'Tenant user_id is required.' using errcode = '22004';
  end if;

  if v_channel not in ('website', 'whatsapp', 'phone') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CHANNEL', 'error', 'Channel must be website, whatsapp, or phone.');
  end if;

  v_is_wa_webhook := (v_is_service_role and v_channel = 'whatsapp' and v_clean_ext_msg_id is not null);

  -- Verify caller authorization & establish server-trusted actor identity
  if not v_is_service_role then
    if v_caller_uid is null then
      raise exception 'Authentication required.' using errcode = '42501';
    end if;

    if v_caller_uid <> p_user_id then
      raise exception 'Unauthorized tenant access.' using errcode = '42501';
    end if;

    if v_channel not in ('whatsapp', 'phone') then
      raise exception 'Authenticated staff can only create phone or whatsapp orders.' using errcode = '42501';
    end if;

    begin
      v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    exception when others then
      v_headers := '{}'::jsonb;
    end;

    v_staff_token := nullif(btrim(coalesce(v_headers ->> 'x-staff-session', '')), '');

    if v_staff_token is not null then
      select
        s.employee_id,
        s.role as session_role,
        e.name as employee_name,
        e.role as employee_role
      into v_session
      from public.staff_sessions s
      join public.employees e
        on e.id = s.employee_id
       and e.user_id = s.user_id
      where s.token = v_staff_token
        and s.user_id = v_caller_uid
        and s.expires_at > now()
        and e.is_active = true
      limit 1;

      if not found then
        raise exception 'Invalid or expired staff PIN session.' using errcode = '42501';
      end if;

      if v_session.employee_role is distinct from v_session.session_role
         or v_session.employee_role not in ('admin', 'manager', 'cashier') then
        raise exception 'Insufficient staff permissions to create omnichannel orders.' using errcode = '42501';
      end if;

      v_effective_actor_id := nullif(btrim(coalesce(v_session.employee_id, '')), '');
      v_effective_actor_name := nullif(btrim(coalesce(v_session.employee_name, '')), '');
      v_effective_actor_role := v_session.employee_role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = v_caller_uid
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Verified staff PIN session is required.' using errcode = '42501';
      end if;

      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = v_caller_uid
      limit 1;

      if not found then
        raise exception 'Authenticated owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  else
    -- Trusted server service_role path
    if v_channel = 'website' then
      v_effective_actor_id := 'public_storefront';
      v_effective_actor_role := 'customer';
    elsif v_is_wa_webhook then
      v_effective_actor_id := 'whatsapp_webhook';
      v_effective_actor_role := 'webhook';
    else
      if v_requested_actor_id is not null then
        select e.id, e.name, e.role, e.is_active
        into v_emp
        from public.employees e
        where e.user_id = p_user_id
          and e.id = v_requested_actor_id
        limit 1;
      end if;

      if v_requested_actor_id is not null and found then
        if v_emp.is_active is not true then
          raise exception 'Staff account is inactive.' using errcode = '42501';
        end if;
        if v_emp.role not in ('admin', 'manager', 'cashier') then
          raise exception 'Staff role is not permitted to create omnichannel orders.' using errcode = '42501';
        end if;
        v_effective_actor_id := v_emp.id;
        v_effective_actor_name := nullif(btrim(coalesce(v_emp.name, '')), '');
        v_effective_actor_role := v_emp.role;
      else
        select exists (
          select 1
          from public.employees e
          where e.user_id = p_user_id
            and e.is_active = true
        ) into v_has_employees;

        if v_has_employees then
          raise exception 'Authorized active staff record is required to create omnichannel orders.' using errcode = '42501';
        end if;

        select u.id, u.email, u.raw_user_meta_data
        into v_owner
        from auth.users u
        where u.id = p_user_id
        limit 1;

        if not found then
          raise exception 'Tenant owner identity could not be verified.' using errcode = '42501';
        end if;

        v_effective_actor_id := v_owner.id::text;
        v_effective_actor_name := coalesce(
          nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
          nullif(btrim(coalesce(v_owner.email, '')), '')
        );
        v_effective_actor_role := 'admin';
      end if;
    end if;
  end if;

  -- Verify tenant subscription is active/not blocked
  if to_regclass('public.subscriptions') is not null then
    select to_jsonb(s) into v_sub
    from public.subscriptions s
    where s.user_id = p_user_id
    limit 1;

    if v_sub is not null then
      if coalesce((v_sub ->> 'is_blocked')::boolean, false)
         or coalesce(v_sub ->> 'status', '') in ('suspended', 'blocked') then
        return jsonb_build_object('ok', false, 'code', 'STORE_UNAVAILABLE', 'error', 'Store access is suspended or blocked.');
      end if;
    end if;
  end if;

  -- Deduplicate by idempotency_key or external_message_id before creating
  if v_clean_idem_key is not null then
    select * into v_existing
    from public.omnichannel_orders
    where user_id = p_user_id
      and idempotency_key = v_clean_idem_key
    limit 1;
    if found then
      return jsonb_build_object('ok', true, 'deduplicated', true, 'order', to_jsonb(v_existing));
    end if;
  end if;

  if v_clean_ext_msg_id is not null then
    select * into v_existing
    from public.omnichannel_orders
    where user_id = p_user_id
      and external_message_id = v_clean_ext_msg_id
    limit 1;
    if found then
      return jsonb_build_object('ok', true, 'deduplicated', true, 'order', to_jsonb(v_existing));
    end if;
  end if;

  select * into v_store
  from public.store_settings
  where user_id = p_user_id
  limit 1;
  v_has_store := found;

  if v_channel = 'website' and (not v_has_store or v_store.storefront_enabled is not true) then
    return jsonb_build_object('ok', false, 'code', 'STOREFRONT_OFFLINE', 'error', 'Online storefront not found or currently offline.');
  end if;

  -- Validate branch ownership and active state (never trust unverified branch IDs)
  if v_clean_branch_id is not null then
    select b.id, b.name, b.is_active
    into v_branch_rec
    from public.branches b
    where b.user_id = p_user_id
      and b.id::text = v_clean_branch_id
    limit 1;

    if not found or v_branch_rec.is_active is not true then
      return jsonb_build_object('ok', false, 'code', 'INVALID_BRANCH', 'error', 'Selected store branch is invalid or inactive.');
    end if;

    v_resolved_branch_id := v_branch_rec.id;
    v_resolved_branch_name := coalesce(v_branch_rec.name, '');
  else
    select b.id, b.name
    into v_branch_rec
    from public.branches b
    where b.user_id = p_user_id
      and b.is_active = true
    order by b.is_main desc, b.created_at asc
    limit 1;

    if found then
      v_resolved_branch_id := v_branch_rec.id;
      v_resolved_branch_name := coalesce(v_branch_rec.name, '');
    end if;
  end if;

  v_branch_key := nullif(btrim(coalesce(v_resolved_branch_id::text, '')), '');

  -- Validate customer ownership when customer_id is provided
  if v_clean_customer_id is not null then
    if v_channel = 'website' or v_is_wa_webhook then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'error', 'Public channels cannot reference private customer records.');
    end if;

    select c.id, c.name, c.phone, c.address
    into v_cust_rec
    from public.customers c
    where c.user_id = p_user_id
      and c.id::text = v_clean_customer_id
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'error', 'Selected customer does not belong to this shop.');
    end if;

    v_resolved_customer_id := v_cust_rec.id;
    if v_customer_name = '' then
      v_customer_name := btrim(coalesce(v_cust_rec.name, ''));
    end if;
    if v_customer_phone = '' then
      v_customer_phone := btrim(coalesce(v_cust_rec.phone, ''));
    end if;
    if v_delivery_address = '' then
      v_delivery_address := coalesce(nullif(btrim(coalesce(v_cust_rec.address, '')), ''), 'Shop Pickup / Phone Order');
    end if;
  end if;

  if length(v_customer_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'error', 'Customer name is required.');
  end if;
  if length(regexp_replace(v_customer_phone, '[^0-9]', '', 'g')) < 7 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CUSTOMER', 'error', 'A valid phone number is required.');
  end if;
  if v_channel = 'website' and length(v_delivery_address) < 4 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ADDRESS', 'error', 'Delivery address is required.');
  end if;
  if v_delivery_address = '' then
    v_delivery_address := case when v_is_wa_webhook then 'Confirm via WhatsApp' else 'Counter Pickup' end;
  end if;

  if v_channel = 'website' or v_is_wa_webhook then
    v_effective_actor_name := v_customer_name;
  end if;

  if v_effective_actor_id is null
     or v_effective_actor_name is null
     or v_effective_actor_role is null then
    raise exception 'Verified actor identity (id, name, and role) could not be established.' using errcode = '42501';
  end if;

  -- Validate raw items array & compute authoritative catalog pricing
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'EMPTY_ITEMS', 'error', 'Order must include at least one item.');
  end if;

  for v_raw_item in select * from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(coalesce(v_raw_item->>'productId', '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'All items must have a valid product and quantity greater than 0.');
    end if;
    if jsonb_typeof(v_raw_item->'quantity') not in ('number', 'string')
       or nullif(btrim(coalesce(v_raw_item->>'quantity', '')), '') is null
       or btrim(v_raw_item->>'quantity') ~* '^(nan|[+-]?inf(inity)?)$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'All items must have a finite numeric quantity greater than 0.');
    end if;
    begin
      v_qty_check := (v_raw_item->>'quantity')::numeric;
      if v_qty_check is null or v_qty_check::text ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'All items must have a finite numeric quantity greater than 0.');
      end if;
      v_qty_check := round(v_qty_check, 3);
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'All items must have a valid numeric quantity greater than 0.');
    end;
    if v_qty_check <= 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'All items must have a valid product and quantity greater than 0.');
    end if;
  end loop;

  for v_line in
    select
      btrim(elem->>'productId') as product_id,
      sum((elem->>'quantity')::numeric) as total_qty
    from jsonb_array_elements(p_items) as elem
    group by btrim(elem->>'productId')
    order by btrim(elem->>'productId')
  loop
    begin
      if v_line.total_qty is null or v_line.total_qty::text ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid quantity.');
      end if;
      v_qty := round(v_line.total_qty, 3);
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid or out-of-range quantity.');
    end;
    if v_qty <= 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid quantity.');
    end if;

    select * into v_prod
    from public.products
    where id::text = v_line.product_id
      and user_id = p_user_id
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'error', format('Selected product (%s) was not found in this shop catalog.', v_line.product_id));
    end if;

    begin
      if v_prod.stock is null
         or btrim(coalesce(v_prod.stock::text, '')) = ''
         or btrim(v_prod.stock::text) ~* '^(nan|[+-]?inf(inity)?)$'
         or (v_prod.stock::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('%s has an invalid stock state.', v_prod.name_en)
        );
      end if;
      v_global_stock := round(v_prod.stock::numeric, 3);
    exception when others then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_STOCK_STATE',
        'error', format('%s has an invalid stock state.', v_prod.name_en)
      );
    end;
    if v_global_stock < 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_STOCK_STATE',
        'error', format('%s has an invalid stock state.', v_prod.name_en)
      );
    end if;

    if v_prod.branch_stock is not null and jsonb_typeof(v_prod.branch_stock) <> 'object' then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_STOCK_STATE',
        'error', format('%s has an invalid branch stock structure.', v_prod.name_en)
      );
    end if;

    v_has_branch_map := false;
    v_other_branch_total := 0;
    v_has_negative_branch := false;
    if v_prod.branch_stock is not null then
      begin
        select
          count(*) > 0,
          coalesce(bool_or(
            jsonb_typeof(kv.value) not in ('number', 'string')
            or btrim(coalesce(kv.value #>> '{}', '')) = ''
            or btrim(kv.value #>> '{}') ~* '^(nan|[+-]?inf(inity)?)$'
            or ((kv.value #>> '{}')::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$'
            or round((kv.value #>> '{}')::numeric, 3) < 0
          ), false)
        into v_has_branch_map, v_has_negative_branch
        from jsonb_each(v_prod.branch_stock) as kv(key, value);
      exception when others then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('%s has corrupted branch stock data.', v_prod.name_en)
        );
      end;
      if v_has_negative_branch then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('%s has invalid or negative branch stock.', v_prod.name_en)
        );
      end if;
      if v_has_branch_map then
        begin
          select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
          into v_other_branch_total
          from jsonb_each(v_prod.branch_stock) as kv(key, value);
        exception when others then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('%s has corrupted branch stock data.', v_prod.name_en)
          );
        end;
        if round(v_other_branch_total, 3) > v_global_stock then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('%s has inconsistent branch stock allocations exceeding global stock (%s > %s).', v_prod.name_en, v_other_branch_total, v_global_stock)
          );
        end if;
      end if;
    end if;

    if v_branch_key is null and v_has_branch_map then
      return jsonb_build_object(
        'ok', false,
        'code', 'BRANCH_REQUIRED',
        'error', format('Branch selection is required for %s because stock is allocated per branch.', v_prod.name_en)
      );
    end if;

    if v_branch_key is not null and v_prod.branch_stock is not null and (v_prod.branch_stock ? v_branch_key) then
      v_branch_available := round((v_prod.branch_stock->>v_branch_key)::numeric, 3);
      v_available := least(v_global_stock, v_branch_available);
    elsif v_branch_key is not null and v_has_branch_map then
      v_available := least(v_global_stock, greatest(0::numeric, round(v_global_stock - v_other_branch_total, 3)));
    else
      v_available := v_global_stock;
    end if;

    if v_available <= 0 then
      return jsonb_build_object('ok', false, 'code', 'OUT_OF_STOCK', 'error', format('%s is currently out of stock.', v_prod.name_en));
    end if;

    if (v_channel = 'website' or (v_is_service_role and coalesce(p_require_stock_check, false)))
       and (v_available < v_qty) then
      return jsonb_build_object(
        'ok', false,
        'code', 'INSUFFICIENT_STOCK',
        'error', format('Only %s %s available for %s.', v_available, coalesce(v_prod.selling_unit, 'piece'), v_prod.name_en)
      );
    end if;

    v_unit_price := round(greatest(0::numeric, coalesce(v_prod.price, 0)), 2);
    v_tax_rate := greatest(0::numeric, coalesce(v_prod.tax_rate, 0));
    v_line_subtotal := round(v_unit_price * v_qty, 2);
    v_line_tax := round((v_line_subtotal * v_tax_rate) / 100.0, 2);
    v_line_total := round(v_line_subtotal + v_line_tax, 2);

    v_subtotal := round(v_subtotal + v_line_subtotal, 2);
    v_tax_amount := round(v_tax_amount + v_line_tax, 2);

    v_resolved_items := v_resolved_items || jsonb_build_array(
      jsonb_build_object(
        'productId', v_prod.id::text,
        'sku', coalesce(v_prod.sku, ''),
        'nameEn', coalesce(v_prod.name_en, ''),
        'nameUr', coalesce(nullif(v_prod.name_ur, ''), v_prod.name_en, ''),
        'category', coalesce(v_prod.category, 'pantry'),
        'sellingUnit', coalesce(v_prod.selling_unit, 'piece'),
        'quantity', v_qty,
        'unitPrice', v_unit_price,
        'taxRate', v_tax_rate,
        'lineTotal', v_line_total
      )
    );
  end loop;

  -- Discount validation (only staff manual orders may supply non-negative finite discount <= subtotal)
  if v_channel = 'website' or v_is_wa_webhook then
    v_discount_amount := 0;
  else
    if p_discount_amount is not null then
      if btrim(p_discount_amount::text) ~* '^(nan|[+-]?inf(inity)?)$' or p_discount_amount < 0 then
        return jsonb_build_object('ok', false, 'code', 'INVALID_DISCOUNT', 'error', 'Discount amount must be a finite non-negative number.');
      end if;
      begin
        v_discount_amount := least(v_subtotal, round(p_discount_amount, 2));
      exception when others then
        return jsonb_build_object('ok', false, 'code', 'INVALID_DISCOUNT', 'error', 'Discount amount is out of range.');
      end;
    else
      v_discount_amount := 0;
    end if;
  end if;

  v_total := greatest(0::numeric, round(v_subtotal - v_discount_amount + v_tax_amount, 2));

  -- Payment method & status validation
  if v_payment_method not in ('cod', 'cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer', 'online') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT', 'error', 'Unsupported payment method.');
  end if;

  if v_payment_method = 'online'
     and not (
       (v_has_store and coalesce(v_store.online_payment_enabled, false))
       or (v_is_service_role and coalesce(p_allow_online_payment, false))
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'ONLINE_PAYMENT_DISABLED',
      'error', 'Online card payment gateway is not configured on this server.'
    );
  end if;

  if v_channel = 'website' then
    if v_payment_method not in ('cod', 'bank_transfer', 'jazzcash', 'easypaisa', 'online') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT', 'error', 'Unsupported storefront payment method.');
    end if;
    if v_payment_method = 'cod' and v_has_store and v_store.cod_enabled = false then
      return jsonb_build_object('ok', false, 'code', 'COD_DISABLED', 'error', 'Cash on Delivery is disabled for this storefront.');
    end if;
    v_paid_amount := 0;
    v_payment_status := case when v_payment_method = 'cod' then 'cod_pending' else 'unpaid' end;
  elsif v_is_wa_webhook then
    v_payment_method := 'cod';
    v_payment_status := 'cod_pending';
    v_paid_amount := 0;
  else
    if p_paid_amount is not null then
      if btrim(p_paid_amount::text) ~* '^(nan|[+-]?inf(inity)?)$' or p_paid_amount < 0 then
        return jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT', 'error', 'Paid amount must be a finite non-negative number.');
      end if;
    end if;
    if v_req_pay_status is not null and v_req_pay_status not in ('unpaid', 'cod_pending', 'partially_paid', 'paid') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT', 'error', 'Invalid initial payment status.');
    end if;
    begin
      v_paid_amount := least(v_total, round(coalesce(p_paid_amount, 0), 2));
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_PAYMENT', 'error', 'Paid amount is out of range.');
    end;
    if v_paid_amount >= v_total and v_total > 0 then
      v_payment_status := 'paid';
    elsif v_paid_amount > 0 then
      v_payment_status := 'partially_paid';
    elsif v_req_pay_status in ('unpaid', 'cod_pending') then
      v_payment_status := v_req_pay_status;
    elsif v_payment_method = 'cod' then
      v_payment_status := 'cod_pending';
    else
      v_payment_status := 'unpaid';
    end if;
  end if;

  v_order_id := 'omni-' || replace(gen_random_uuid()::text, '-', '');
  if v_is_service_role and nullif(btrim(coalesce(p_order_number, '')), '') is not null then
    v_order_number := btrim(p_order_number);
  else
    v_order_number :=
      case v_channel
        when 'website' then 'WEB'
        when 'whatsapp' then 'WA'
        else 'PHN'
      end
      || '-' || to_char(v_now, 'YYYYMMDD')
      || '-' || lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
  end if;

  v_history_note := coalesce(
    nullif(btrim(coalesce(p_history_note, '')), ''),
    case
      when v_channel = 'website' then 'Order placed on public storefront'
      when v_is_wa_webhook then 'Incoming WhatsApp order (' || v_clean_ext_msg_id || ')'
      when v_channel = 'whatsapp' then 'Manual WhatsApp order logged'
      else 'Phone order logged'
    end
  );

  v_history_entry := jsonb_build_object(
    'status', 'new',
    'changedAt', v_now,
    'actorId', v_effective_actor_id,
    'actorName', v_effective_actor_name,
    'actorRole', v_effective_actor_role,
    'note', v_history_note
  );

  if v_is_service_role and p_notification_entry is not null then
    if jsonb_typeof(p_notification_entry) = 'object' then
      v_notifications := jsonb_build_array(p_notification_entry);
    elsif jsonb_typeof(p_notification_entry) = 'array' then
      v_notifications := p_notification_entry;
    end if;
  end if;

  insert into public.omnichannel_orders (
    id, user_id, branch_id, branch_name, order_number, channel, status,
    customer_id, customer_name, customer_phone, delivery_address, notes,
    items, subtotal, discount_amount, tax_amount, total,
    payment_method, payment_status, paid_amount,
    idempotency_key, external_message_id,
    stock_reserved, stock_reserved_at, stock_restored_at,
    status_history, notification_log,
    created_by, updated_by, created_at, updated_at
  ) values (
    v_order_id,
    p_user_id,
    v_resolved_branch_id,
    v_resolved_branch_name,
    v_order_number,
    v_channel,
    'new',
    v_resolved_customer_id,
    v_customer_name,
    v_customer_phone,
    v_delivery_address,
    v_notes,
    v_resolved_items,
    v_subtotal,
    v_discount_amount,
    v_tax_amount,
    v_total,
    v_payment_method,
    v_payment_status,
    v_paid_amount,
    v_clean_idem_key,
    v_clean_ext_msg_id,
    false,
    null,
    null,
    jsonb_build_array(v_history_entry),
    v_notifications,
    case when v_is_wa_webhook then 'WhatsApp Webhook' else v_effective_actor_name end,
    case when v_is_wa_webhook then 'WhatsApp Webhook' else v_effective_actor_name end,
    v_now,
    v_now
  )
  returning * into v_created;

  v_audit_action := case
    when v_is_service_role and nullif(btrim(coalesce(p_audit_action, '')), '') is not null
      then btrim(p_audit_action)
    else v_channel || '_order_created'
  end;

  v_audit_details := case
    when v_is_service_role and nullif(btrim(coalesce(p_audit_details, '')), '') is not null
      then btrim(p_audit_details)
    else v_channel || ' order ' || v_created.order_number || ' created (' || v_created.total || '). Stock NOT deducted yet.'
  end;

  insert into public.order_audit_logs (
    id, user_id, order_id, action, actor_id, actor_name, actor_role, previous_status, new_status, details, created_at
  ) values (
    'oaud-' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    v_created.id,
    v_audit_action,
    v_effective_actor_id,
    v_effective_actor_name,
    v_effective_actor_role,
    null,
    'new',
    v_audit_details,
    v_now
  );

  return jsonb_build_object('ok', true, 'deduplicated', false, 'order', to_jsonb(v_created));
end;
$$;

revoke all on function public.create_omnichannel_order(
  uuid, text, text, text, text, text, text, text, numeric, text, text, numeric,
  text, text, text, jsonb, text, text, text, jsonb, boolean, boolean, text, text, text
) from public, anon;

grant execute on function public.create_omnichannel_order(
  uuid, text, text, text, text, text, text, text, numeric, text, text, numeric,
  text, text, text, jsonb, text, text, text, jsonb, boolean, boolean, text, text, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. ATOMIC POSTGRES RPC: ACCEPT ORDER + SINGLE STOCK DEDUCTION (ROW LOCKING)
-- ---------------------------------------------------------------------------
create or replace function public.accept_omnichannel_order_with_stock(
  p_user_id uuid,
  p_order_id text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_history_entry jsonb,
  p_notification_entry jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_db_role text := coalesce(nullif(current_setting('role', true), ''), '');
  v_is_service_role boolean := (v_db_role = 'service_role');
  v_caller_uid uuid := auth.uid();
  v_headers jsonb := '{}'::jsonb;
  v_staff_token text;
  v_session record;
  v_owner record;
  v_has_employees boolean := false;
  v_emp record;
  v_requested_actor_id text := nullif(btrim(coalesce(p_actor_id, '')), '');
  v_effective_actor_role text;
  v_effective_actor_name text;
  v_effective_actor_id text;
  v_order public.omnichannel_orders%rowtype;
  v_raw_item jsonb;
  v_qty_check numeric;
  v_line record;
  v_prod public.products%rowtype;
  v_qty numeric(12,3);
  v_branch_key text;
  v_global_stock numeric(12,3);
  v_branch_available numeric(12,3);
  v_has_branch_map boolean := false;
  v_other_branch_total numeric(12,3) := 0;
  v_has_negative_branch boolean := false;
  v_available numeric(12,3);
  v_new_global numeric(12,3);
  v_new_branch_stock jsonb;
  v_new_branch_qty numeric(12,3);
  v_now timestamptz := now();
  v_sanitized_history_entry jsonb;
  v_updated_history jsonb;
  v_updated_notifications jsonb;
begin
  if p_user_id is null then
    raise exception 'Tenant user_id is required.' using errcode = '22004';
  end if;

  -- Never trust client-supplied p_actor_id, p_actor_name, or p_actor_role for authenticated callers
  if not v_is_service_role then
    if v_caller_uid is null then
      raise exception 'Authentication required.' using errcode = '42501';
    end if;

    if v_caller_uid <> p_user_id then
      raise exception 'Unauthorized tenant access.' using errcode = '42501';
    end if;

    begin
      v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    exception when others then
      v_headers := '{}'::jsonb;
    end;

    v_staff_token := nullif(btrim(coalesce(v_headers ->> 'x-staff-session', '')), '');

    if v_staff_token is not null then
      select
        s.employee_id,
        s.role as session_role,
        e.name as employee_name,
        e.role as employee_role
      into v_session
      from public.staff_sessions s
      join public.employees e
        on e.id = s.employee_id
       and e.user_id = s.user_id
      where s.token = v_staff_token
        and s.user_id = v_caller_uid
        and s.expires_at > now()
        and e.is_active = true
      limit 1;

      if not found then
        raise exception 'Invalid or expired staff PIN session.' using errcode = '42501';
      end if;

      if v_session.employee_role is distinct from v_session.session_role
         or v_session.employee_role not in ('admin', 'manager', 'cashier') then
        raise exception 'Insufficient staff permissions to accept omnichannel orders.' using errcode = '42501';
      end if;

      v_effective_actor_id := nullif(btrim(coalesce(v_session.employee_id, '')), '');
      v_effective_actor_name := nullif(btrim(coalesce(v_session.employee_name, '')), '');
      v_effective_actor_role := v_session.employee_role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = v_caller_uid
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Verified staff PIN session is required.' using errcode = '42501';
      end if;

      -- Initial owner bootstrap (zero active employees): resolve verified identity directly from auth.users
      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = v_caller_uid
      limit 1;

      if not found then
        raise exception 'Authenticated owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  else
    -- Server-side service_role path: validate actor against public.employees or verified tenant auth.users during bootstrap
    if v_requested_actor_id is not null then
      select e.id, e.name, e.role, e.is_active
      into v_emp
      from public.employees e
      where e.user_id = p_user_id
        and e.id = v_requested_actor_id
      limit 1;
    end if;

    if v_requested_actor_id is not null and found then
      if v_emp.is_active is not true then
        raise exception 'Staff account is inactive.' using errcode = '42501';
      end if;
      if v_emp.role not in ('admin', 'manager', 'cashier') then
        raise exception 'Staff role is not permitted to accept omnichannel orders.' using errcode = '42501';
      end if;
      v_effective_actor_id := v_emp.id;
      v_effective_actor_name := nullif(btrim(coalesce(v_emp.name, '')), '');
      v_effective_actor_role := v_emp.role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = p_user_id
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Authorized active staff record is required to accept omnichannel orders.' using errcode = '42501';
      end if;

      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = p_user_id
      limit 1;

      if not found then
        raise exception 'Tenant owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  end if;

  if v_effective_actor_id is null
     or v_effective_actor_name is null
     or v_effective_actor_role is null then
    raise exception 'Verified actor identity (id, name, and role) could not be established.' using errcode = '42501';
  end if;

  select * into v_order
  from public.omnichannel_orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Order not found.');
  end if;

  if v_order.status <> 'new' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TRANSITION', 'error', 'Only new orders can be accepted.');
  end if;

  if v_order.stock_reserved then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_RESERVED', 'error', 'Stock already reserved for this order.');
  end if;

  if jsonb_typeof(coalesce(v_order.items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_order.items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'EMPTY_ITEMS', 'error', 'Order contains no items.');
  end if;

  for v_raw_item in select * from jsonb_array_elements(v_order.items)
  loop
    if nullif(btrim(coalesce(v_raw_item->>'productId', '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid item or quantity.');
    end if;
    if jsonb_typeof(v_raw_item->'quantity') not in ('number', 'string')
       or nullif(btrim(coalesce(v_raw_item->>'quantity', '')), '') is null
       or btrim(v_raw_item->>'quantity') ~* '^(nan|[+-]?inf(inity)?)$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid or non-finite item quantity.');
    end if;
    begin
      v_qty_check := (v_raw_item->>'quantity')::numeric;
      if v_qty_check is null or v_qty_check::text ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid or non-finite item quantity.');
      end if;
      v_qty_check := round(v_qty_check, 3);
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid item or quantity.');
    end;
    if v_qty_check is null or v_qty_check <= 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid item or quantity.');
    end if;
  end loop;

  v_branch_key := nullif(btrim(coalesce(v_order.branch_id::text, '')), '');

  -- First pass: lock and validate every distinct product's branch & global stock before any deduction
  for v_line in
    select
      btrim(elem->>'productId') as product_id,
      max(coalesce(elem->>'nameEn', 'Product')) as name_en,
      sum((elem->>'quantity')::numeric) as total_qty
    from jsonb_array_elements(v_order.items) as elem
    group by btrim(elem->>'productId')
    order by btrim(elem->>'productId')
  loop
    begin
      if v_line.total_qty is null or v_line.total_qty::text ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid quantity.');
      end if;
      v_qty := round(v_line.total_qty, 3);
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid or out-of-range quantity.');
    end;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'Order contains invalid quantity.');
    end if;

    select * into v_prod
    from public.products
    where id::text = v_line.product_id and user_id = p_user_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'error', v_line.name_en || ' no longer exists.');
    end if;

    begin
      if v_prod.stock is null
         or btrim(coalesce(v_prod.stock::text, '')) = ''
         or btrim(v_prod.stock::text) ~* '^(nan|[+-]?inf(inity)?)$'
         or (v_prod.stock::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('Invalid global stock state for %s.', v_prod.name_en)
        );
      end if;
      v_global_stock := round(v_prod.stock::numeric, 3);
    exception when others then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_STOCK_STATE',
        'error', format('Invalid global stock state for %s.', v_prod.name_en)
      );
    end;
    if v_global_stock < 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_STOCK_STATE',
        'error', format('Invalid global stock state for %s.', v_prod.name_en)
      );
    end if;

    if v_prod.branch_stock is not null and jsonb_typeof(v_prod.branch_stock) <> 'object' then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_STOCK_STATE',
        'error', format('Invalid branch stock structure for %s.', v_prod.name_en)
      );
    end if;

    v_has_branch_map := false;
    v_other_branch_total := 0;
    v_has_negative_branch := false;
    if v_prod.branch_stock is not null then
      begin
        select
          count(*) > 0,
          coalesce(bool_or(
            jsonb_typeof(kv.value) not in ('number', 'string')
            or btrim(coalesce(kv.value #>> '{}', '')) = ''
            or btrim(kv.value #>> '{}') ~* '^(nan|[+-]?inf(inity)?)$'
            or ((kv.value #>> '{}')::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$'
            or round((kv.value #>> '{}')::numeric, 3) < 0
          ), false)
        into v_has_branch_map, v_has_negative_branch
        from jsonb_each(v_prod.branch_stock) as kv(key, value);
      exception when others then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('Corrupted branch stock data for %s.', v_prod.name_en)
        );
      end;
      if v_has_negative_branch then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('Invalid or negative branch stock for %s.', v_prod.name_en)
        );
      end if;
      if v_has_branch_map then
        begin
          select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
          into v_other_branch_total
          from jsonb_each(v_prod.branch_stock) as kv(key, value);
        exception when others then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('Corrupted branch stock data for %s.', v_prod.name_en)
          );
        end;
        if round(v_other_branch_total, 3) > v_global_stock then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('Inconsistent branch stock allocations for %s: branch total (%s) exceeds global stock (%s).', v_prod.name_en, v_other_branch_total, v_global_stock)
          );
        end if;
      end if;
    end if;

    if v_branch_key is null and v_has_branch_map then
      return jsonb_build_object(
        'ok', false,
        'code', 'BRANCH_REQUIRED',
        'error', format('Cannot accept order %s: branch_id is missing for product %s which uses branch-specific stock.', v_order.order_number, v_prod.name_en)
      );
    end if;

    if v_branch_key is not null and v_prod.branch_stock is not null and (v_prod.branch_stock ? v_branch_key) then
      v_branch_available := round((v_prod.branch_stock->>v_branch_key)::numeric, 3);
      v_available := least(v_branch_available, v_global_stock);
    elsif v_branch_key is not null and v_has_branch_map then
      v_available := least(v_global_stock, greatest(0::numeric, round(v_global_stock - v_other_branch_total, 3)));
    else
      v_available := v_global_stock;
    end if;

    if v_available < v_qty then
      return jsonb_build_object(
        'ok', false,
        'code', 'INSUFFICIENT_STOCK',
        'error', format('Insufficient stock for %s (available %s, requested %s)', v_prod.name_en, v_available, v_qty)
      );
    end if;
  end loop;

  -- Second pass: deduct exact stock once per product (no silent clamping) and write inventory adjustments
  for v_line in
    select
      btrim(elem->>'productId') as product_id,
      round(sum((elem->>'quantity')::numeric), 3)::numeric(12,3) as total_qty
    from jsonb_array_elements(v_order.items) as elem
    group by btrim(elem->>'productId')
    order by btrim(elem->>'productId')
  loop
    v_qty := v_line.total_qty;
    select * into v_prod
    from public.products
    where id::text = v_line.product_id and user_id = p_user_id
    for update;

    if not found then
      raise exception 'Product % disappeared during stock deduction.', v_line.product_id using errcode = 'P0002';
    end if;

    if v_prod.stock is null
       or btrim(coalesce(v_prod.stock::text, '')) = ''
       or btrim(v_prod.stock::text) ~* '^(nan|[+-]?inf(inity)?)$'
       or (v_prod.stock::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$' then
      raise exception 'Non-finite global stock encountered for product %.', v_prod.id using errcode = '22023';
    end if;
    v_global_stock := round(v_prod.stock::numeric, 3);
    v_new_global := round(v_global_stock - v_qty, 3);
    if v_new_global < 0 then
      raise exception 'Insufficient global stock for product % (available %, requested %).', v_prod.id, v_global_stock, v_qty using errcode = '22023';
    end if;

    v_new_branch_stock := coalesce(v_prod.branch_stock, '{}'::jsonb);
    v_has_branch_map := (
      v_prod.branch_stock is not null
      and jsonb_typeof(v_prod.branch_stock) = 'object'
      and exists (select 1 from jsonb_object_keys(v_prod.branch_stock))
    );

    if v_branch_key is null and v_has_branch_map then
      raise exception 'Branch ID is required for product % which maintains branch_stock.', v_prod.id using errcode = '22023';
    end if;

    v_other_branch_total := 0;
    if v_has_branch_map then
      select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
      into v_other_branch_total
      from jsonb_each(v_prod.branch_stock) as kv(key, value);

      if round(v_other_branch_total, 3) > v_global_stock then
        raise exception 'Inconsistent branch stock allocations for product % (branch total %, global stock %).', v_prod.id, v_other_branch_total, v_global_stock using errcode = '22023';
      end if;
    end if;

    if v_branch_key is not null and v_prod.branch_stock is not null and (v_prod.branch_stock ? v_branch_key) then
      v_available := round((v_prod.branch_stock->>v_branch_key)::numeric, 3);
      v_new_branch_qty := round(v_available - v_qty, 3);
      if v_new_branch_qty < 0 then
        raise exception 'Insufficient branch stock for product % at branch % (available %, requested %).', v_prod.id, v_branch_key, v_available, v_qty using errcode = '22023';
      end if;
      v_new_branch_stock := jsonb_set(v_new_branch_stock, array[v_branch_key], to_jsonb(v_new_branch_qty), true);
    elsif v_branch_key is not null and v_has_branch_map then
      v_available := least(v_global_stock, greatest(0::numeric, round(v_global_stock - v_other_branch_total, 3)));
      v_new_branch_qty := round(v_available - v_qty, 3);
      if v_new_branch_qty < 0 then
        raise exception 'Insufficient unallocated branch stock for product % at branch % (available %, requested %).', v_prod.id, v_branch_key, v_available, v_qty using errcode = '22023';
      end if;
      v_new_branch_stock := jsonb_set(v_new_branch_stock, array[v_branch_key], to_jsonb(v_new_branch_qty), true);
    else
      v_available := v_global_stock;
      v_new_branch_qty := v_new_global;
    end if;

    if v_has_branch_map then
      select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
      into v_other_branch_total
      from jsonb_each(v_new_branch_stock) as kv(key, value);

      if round(v_other_branch_total, 3) > v_new_global then
        raise exception 'Post-deduction branch stock allocations exceed global stock for product % (branch total %, global stock %).', v_prod.id, v_other_branch_total, v_new_global using errcode = '22023';
      end if;
    end if;

    update public.products
    set stock = v_new_global,
        branch_stock = v_new_branch_stock,
        updated_at = v_now
    where id = v_prod.id and user_id = p_user_id;

    insert into public.inventory_adjustments (
      id, user_id, product_id, product_name, sku, selling_unit, branch_id,
      adjustment_type, quantity_change, previous_stock, new_stock, reason, actor_name, created_at
    ) values (
      gen_random_uuid(),
      p_user_id,
      v_prod.id,
      v_prod.name_en,
      v_prod.sku,
      coalesce(v_prod.selling_unit, 'piece'),
      v_branch_key,
      'Sale Stock Out',
      -v_qty,
      v_available,
      v_new_branch_qty,
      'Omnichannel Order Accepted: ' || v_order.order_number,
      v_effective_actor_name,
      v_now
    );
  end loop;

  v_sanitized_history_entry :=
    case
      when nullif(btrim(coalesce(p_history_entry ->> 'note', '')), '') is not null
        then jsonb_build_object('note', btrim(p_history_entry ->> 'note'))
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'status', 'accepted',
      'actorId', v_effective_actor_id,
      'actorName', v_effective_actor_name,
      'actorRole', v_effective_actor_role,
      'changedAt', v_now
    );

  v_updated_history := coalesce(v_order.status_history, '[]'::jsonb) || jsonb_build_array(v_sanitized_history_entry);
  if v_is_service_role
     and p_notification_entry is not null
     and jsonb_typeof(p_notification_entry) = 'object' then
    v_updated_notifications := coalesce(v_order.notification_log, '[]'::jsonb) || jsonb_build_array(p_notification_entry);
  else
    v_updated_notifications := coalesce(v_order.notification_log, '[]'::jsonb);
  end if;

  update public.omnichannel_orders
  set status = 'accepted',
      stock_reserved = true,
      stock_reserved_at = v_now,
      status_history = v_updated_history,
      notification_log = v_updated_notifications,
      updated_by = v_effective_actor_name,
      updated_at = v_now
  where id = p_order_id and user_id = p_user_id
  returning * into v_order;

  insert into public.order_audit_logs (
    id, user_id, order_id, action, actor_id, actor_name, actor_role, previous_status, new_status, details, created_at
  ) values (
    'oaud-' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    v_order.id,
    'order_accepted_stock_deducted',
    v_effective_actor_id,
    v_effective_actor_name,
    v_effective_actor_role,
    'new',
    'accepted',
    'Accepted omnichannel order ' || v_order.order_number || ' and deducted stock once.',
    v_now
  );

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.accept_omnichannel_order_with_stock(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.accept_omnichannel_order_with_stock(
  uuid, text, text, text, text, jsonb, jsonb
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. ATOMIC POSTGRES RPC: PREPARING / READY / DELIVERED TRANSITION + AUDIT LOG
-- ---------------------------------------------------------------------------
create or replace function public.transition_omnichannel_order_status(
  p_user_id uuid,
  p_order_id text,
  p_target_status text,
  p_note text default null,
  p_actor_id text default null,
  p_actor_name text default null,
  p_actor_role text default null,
  p_notification_entry jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_db_role text := coalesce(nullif(current_setting('role', true), ''), '');
  v_is_service_role boolean := (v_db_role = 'service_role');
  v_caller_uid uuid := auth.uid();
  v_headers jsonb := '{}'::jsonb;
  v_staff_token text;
  v_session record;
  v_owner record;
  v_has_employees boolean := false;
  v_emp record;
  v_requested_actor_id text := nullif(btrim(coalesce(p_actor_id, '')), '');
  v_effective_actor_id text;
  v_effective_actor_name text;
  v_effective_actor_role text;
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_order public.omnichannel_orders%rowtype;
  v_prev_status text;
  v_now timestamptz := now();
  v_clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_sanitized_history_entry jsonb;
  v_updated_notifications jsonb;
begin
  if p_user_id is null then
    raise exception 'Tenant user_id is required.' using errcode = '22004';
  end if;

  if v_target_status not in ('preparing', 'ready', 'delivered') then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATUS',
      'error', 'transition_omnichannel_order_status only handles preparing, ready, or delivered transitions.'
    );
  end if;

  -- Never trust client-supplied p_actor_id, p_actor_name, or p_actor_role for authenticated callers
  if not v_is_service_role then
    if v_caller_uid is null then
      raise exception 'Authentication required.' using errcode = '42501';
    end if;

    if v_caller_uid <> p_user_id then
      raise exception 'Unauthorized tenant access.' using errcode = '42501';
    end if;

    begin
      v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    exception when others then
      v_headers := '{}'::jsonb;
    end;

    v_staff_token := nullif(btrim(coalesce(v_headers ->> 'x-staff-session', '')), '');

    if v_staff_token is not null then
      select
        s.employee_id,
        s.role as session_role,
        e.name as employee_name,
        e.role as employee_role
      into v_session
      from public.staff_sessions s
      join public.employees e
        on e.id = s.employee_id
       and e.user_id = s.user_id
      where s.token = v_staff_token
        and s.user_id = v_caller_uid
        and s.expires_at > now()
        and e.is_active = true
      limit 1;

      if not found then
        raise exception 'Invalid or expired staff PIN session.' using errcode = '42501';
      end if;

      if v_session.employee_role is distinct from v_session.session_role
         or v_session.employee_role not in ('admin', 'manager', 'cashier') then
        raise exception 'Insufficient staff permissions to update omnichannel order status.' using errcode = '42501';
      end if;

      v_effective_actor_id := nullif(btrim(coalesce(v_session.employee_id, '')), '');
      v_effective_actor_name := nullif(btrim(coalesce(v_session.employee_name, '')), '');
      v_effective_actor_role := v_session.employee_role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = v_caller_uid
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Verified staff PIN session is required.' using errcode = '42501';
      end if;

      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = v_caller_uid
      limit 1;

      if not found then
        raise exception 'Authenticated owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  else
    if v_requested_actor_id is not null then
      select e.id, e.name, e.role, e.is_active
      into v_emp
      from public.employees e
      where e.user_id = p_user_id
        and e.id = v_requested_actor_id
      limit 1;
    end if;

    if v_requested_actor_id is not null and found then
      if v_emp.is_active is not true then
        raise exception 'Staff account is inactive.' using errcode = '42501';
      end if;
      if v_emp.role not in ('admin', 'manager', 'cashier') then
        raise exception 'Staff role is not permitted to update omnichannel order status.' using errcode = '42501';
      end if;
      v_effective_actor_id := v_emp.id;
      v_effective_actor_name := nullif(btrim(coalesce(v_emp.name, '')), '');
      v_effective_actor_role := v_emp.role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = p_user_id
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Authorized active staff record is required to update omnichannel order status.' using errcode = '42501';
      end if;

      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = p_user_id
      limit 1;

      if not found then
        raise exception 'Tenant owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  end if;

  if v_effective_actor_id is null
     or v_effective_actor_name is null
     or v_effective_actor_role is null then
    raise exception 'Verified actor identity (id, name, and role) could not be established.' using errcode = '42501';
  end if;

  select * into v_order
  from public.omnichannel_orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Order not found.');
  end if;

  v_prev_status := v_order.status;
  if not (
    (v_prev_status = 'accepted' and v_target_status in ('preparing', 'ready'))
    or (v_prev_status = 'preparing' and v_target_status = 'ready')
    or (v_prev_status = 'ready' and v_target_status = 'delivered')
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TRANSITION',
      'error', format('Cannot move order %s from "%s" to "%s".', v_order.order_number, v_prev_status, v_target_status)
    );
  end if;

  v_sanitized_history_entry :=
    case
      when v_clean_note is not null
        then jsonb_build_object('note', v_clean_note)
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'status', v_target_status,
      'actorId', v_effective_actor_id,
      'actorName', v_effective_actor_name,
      'actorRole', v_effective_actor_role,
      'changedAt', v_now
    );

  if v_is_service_role
     and p_notification_entry is not null
     and jsonb_typeof(p_notification_entry) = 'object' then
    v_updated_notifications := coalesce(v_order.notification_log, '[]'::jsonb) || jsonb_build_array(p_notification_entry);
  else
    v_updated_notifications := coalesce(v_order.notification_log, '[]'::jsonb);
  end if;

  update public.omnichannel_orders
  set status = v_target_status,
      status_history = coalesce(v_order.status_history, '[]'::jsonb) || jsonb_build_array(v_sanitized_history_entry),
      notification_log = v_updated_notifications,
      updated_by = v_effective_actor_name,
      updated_at = v_now
  where id = p_order_id and user_id = p_user_id
  returning * into v_order;

  insert into public.order_audit_logs (
    id, user_id, order_id, action, actor_id, actor_name, actor_role, previous_status, new_status, details, created_at
  ) values (
    'oaud-' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    v_order.id,
    'order_status_' || v_target_status,
    v_effective_actor_id,
    v_effective_actor_name,
    v_effective_actor_role,
    v_prev_status,
    v_target_status,
    coalesce(v_clean_note, 'Moved from ' || v_prev_status || ' to ' || v_target_status),
    v_now
  );

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.transition_omnichannel_order_status(
  uuid, text, text, text, text, text, text, jsonb
) from public, anon;

grant execute on function public.transition_omnichannel_order_status(
  uuid, text, text, text, text, text, text, jsonb
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. ATOMIC POSTGRES RPC: CANCEL/REJECT ORDER + SINGLE STOCK RESTORATION
-- ---------------------------------------------------------------------------
create or replace function public.cancel_or_reject_omnichannel_order_with_restock(
  p_user_id uuid,
  p_order_id text,
  p_target_status text,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_history_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_db_role text := coalesce(nullif(current_setting('role', true), ''), '');
  v_is_service_role boolean := (v_db_role = 'service_role');
  v_caller_uid uuid := auth.uid();
  v_headers jsonb := '{}'::jsonb;
  v_staff_token text;
  v_session record;
  v_owner record;
  v_has_employees boolean := false;
  v_emp record;
  v_requested_actor_id text := nullif(btrim(coalesce(p_actor_id, '')), '');
  v_effective_actor_role text;
  v_effective_actor_name text;
  v_effective_actor_id text;
  v_order public.omnichannel_orders%rowtype;
  v_prev_status text;
  v_raw_item jsonb;
  v_qty_check numeric;
  v_line record;
  v_prod public.products%rowtype;
  v_qty numeric(12,3);
  v_branch_key text;
  v_global_stock numeric(12,3);
  v_has_branch_map boolean := false;
  v_other_branch_total numeric(12,3) := 0;
  v_has_negative_branch boolean := false;
  v_available numeric(12,3);
  v_new_global numeric(12,3);
  v_new_branch_stock jsonb;
  v_new_branch_qty numeric(12,3);
  v_now timestamptz := now();
  v_did_restock boolean := false;
  v_sanitized_history_entry jsonb;
begin
  if p_user_id is null then
    raise exception 'Tenant user_id is required.' using errcode = '22004';
  end if;

  -- Never trust client-supplied p_actor_id, p_actor_name, or p_actor_role for authenticated callers
  if not v_is_service_role then
    if v_caller_uid is null then
      raise exception 'Authentication required.' using errcode = '42501';
    end if;

    if v_caller_uid <> p_user_id then
      raise exception 'Unauthorized tenant access.' using errcode = '42501';
    end if;

    begin
      v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    exception when others then
      v_headers := '{}'::jsonb;
    end;

    v_staff_token := nullif(btrim(coalesce(v_headers ->> 'x-staff-session', '')), '');

    if v_staff_token is not null then
      select
        s.employee_id,
        s.role as session_role,
        e.name as employee_name,
        e.role as employee_role
      into v_session
      from public.staff_sessions s
      join public.employees e
        on e.id = s.employee_id
       and e.user_id = s.user_id
      where s.token = v_staff_token
        and s.user_id = v_caller_uid
        and s.expires_at > now()
        and e.is_active = true
      limit 1;

      if not found then
        raise exception 'Invalid or expired staff PIN session.' using errcode = '42501';
      end if;

      if v_session.employee_role is distinct from v_session.session_role
         or v_session.employee_role not in ('admin', 'manager') then
        raise exception 'Only Admin or Manager can cancel or reject omnichannel orders.' using errcode = '42501';
      end if;

      v_effective_actor_id := nullif(btrim(coalesce(v_session.employee_id, '')), '');
      v_effective_actor_name := nullif(btrim(coalesce(v_session.employee_name, '')), '');
      v_effective_actor_role := v_session.employee_role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = v_caller_uid
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Verified staff PIN session is required.' using errcode = '42501';
      end if;

      -- Initial owner bootstrap (zero active employees): resolve verified identity directly from auth.users
      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = v_caller_uid
      limit 1;

      if not found then
        raise exception 'Authenticated owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  else
    -- Server-side service_role path: validate actor against public.employees or verified tenant auth.users during bootstrap
    if v_requested_actor_id is not null then
      select e.id, e.name, e.role, e.is_active
      into v_emp
      from public.employees e
      where e.user_id = p_user_id
        and e.id = v_requested_actor_id
      limit 1;
    end if;

    if v_requested_actor_id is not null and found then
      if v_emp.is_active is not true then
        raise exception 'Staff account is inactive.' using errcode = '42501';
      end if;
      if v_emp.role not in ('admin', 'manager') then
        raise exception 'Only Admin or Manager can cancel or reject omnichannel orders.' using errcode = '42501';
      end if;
      v_effective_actor_id := v_emp.id;
      v_effective_actor_name := nullif(btrim(coalesce(v_emp.name, '')), '');
      v_effective_actor_role := v_emp.role;
    else
      select exists (
        select 1
        from public.employees e
        where e.user_id = p_user_id
          and e.is_active = true
      ) into v_has_employees;

      if v_has_employees then
        raise exception 'Authorized Admin or Manager staff record is required to cancel or reject omnichannel orders.' using errcode = '42501';
      end if;

      select u.id, u.email, u.raw_user_meta_data
      into v_owner
      from auth.users u
      where u.id = p_user_id
      limit 1;

      if not found then
        raise exception 'Tenant owner identity could not be verified.' using errcode = '42501';
      end if;

      v_effective_actor_id := v_owner.id::text;
      v_effective_actor_name := coalesce(
        nullif(btrim(coalesce(v_owner.raw_user_meta_data ->> 'full_name', '')), ''),
        nullif(btrim(coalesce(v_owner.email, '')), '')
      );
      v_effective_actor_role := 'admin';
    end if;
  end if;

  if v_effective_actor_id is null
     or v_effective_actor_name is null
     or v_effective_actor_role is null then
    raise exception 'Verified actor identity (id, name, and role) could not be established.' using errcode = '42501';
  end if;

  if p_target_status not in ('rejected', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'error', 'Target status must be rejected or cancelled.');
  end if;

  select * into v_order
  from public.omnichannel_orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Order not found.');
  end if;

  v_prev_status := v_order.status;
  if v_prev_status in ('delivered', 'rejected', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TRANSITION', 'error', 'Completed or already closed orders cannot be changed.');
  end if;

  if p_target_status = 'rejected' and v_prev_status <> 'new' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TRANSITION', 'error', 'Only new orders can be rejected; accepted orders must be cancelled.');
  end if;

  v_branch_key := nullif(btrim(coalesce(v_order.branch_id::text, '')), '');

  -- Restore stock ONLY if stock was reserved AND not yet restored
  if v_order.stock_reserved and v_order.stock_restored_at is null then
    if jsonb_typeof(coalesce(v_order.items, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_order.items, '[]'::jsonb)) = 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'EMPTY_ITEMS',
        'error', 'Cannot restore reserved stock: order contains no items.'
      );
    end if;

    for v_raw_item in select * from jsonb_array_elements(v_order.items)
    loop
      if nullif(btrim(coalesce(v_raw_item->>'productId', '')), '') is null then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_ORDER_ITEM',
          'error', 'Cannot restore reserved stock: order item is missing a valid product reference.'
        );
      end if;
      if jsonb_typeof(v_raw_item->'quantity') not in ('number', 'string')
         or nullif(btrim(coalesce(v_raw_item->>'quantity', '')), '') is null
         or btrim(v_raw_item->>'quantity') ~* '^(nan|[+-]?inf(inity)?)$' then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_QUANTITY',
          'error', 'Cannot restore reserved stock: order item contains a non-finite or invalid quantity.'
        );
      end if;
      begin
        v_qty_check := (v_raw_item->>'quantity')::numeric;
        if v_qty_check is null or v_qty_check::text ~* '^(nan|[+-]?inf(inity)?)$' then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_QUANTITY',
            'error', 'Cannot restore reserved stock: order item contains a non-finite or invalid quantity.'
          );
        end if;
        v_qty_check := round(v_qty_check, 3);
      exception when others then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_QUANTITY',
          'error', 'Cannot restore reserved stock: order item contains an invalid quantity.'
        );
      end;
      if v_qty_check is null or v_qty_check <= 0 then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_QUANTITY',
          'error', 'Cannot restore reserved stock: order item quantity must be greater than 0.'
        );
      end if;
    end loop;

    -- First pass: lock and verify every referenced product exists and has valid stock state before any mutation
    for v_line in
      select
        btrim(elem->>'productId') as product_id,
        max(coalesce(nullif(btrim(coalesce(elem->>'nameEn', '')), ''), btrim(elem->>'productId'))) as name_en,
        sum((elem->>'quantity')::numeric) as total_qty
      from jsonb_array_elements(v_order.items) as elem
      group by btrim(elem->>'productId')
      order by btrim(elem->>'productId')
    loop
      begin
        if v_line.total_qty is null or v_line.total_qty::text ~* '^(nan|[+-]?inf(inity)?)$' then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_QUANTITY',
            'error', 'Cannot restore reserved stock: aggregated item quantity is invalid.'
          );
        end if;
        v_qty := round(v_line.total_qty, 3);
      exception when others then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_QUANTITY',
          'error', 'Cannot restore reserved stock: aggregated item quantity is out of range.'
        );
      end;
      if v_qty is null or v_qty <= 0 then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_QUANTITY',
          'error', 'Cannot restore reserved stock: aggregated item quantity is invalid.'
        );
      end if;

      select * into v_prod
      from public.products
      where id::text = v_line.product_id and user_id = p_user_id
      for update;

      if not found then
        return jsonb_build_object(
          'ok', false,
          'code', 'PRODUCT_NOT_FOUND',
          'error', format('Cannot restore reserved stock: referenced product "%s" (%s) is missing or does not belong to this shop.', v_line.name_en, v_line.product_id)
        );
      end if;

      begin
        if v_prod.stock is null
           or btrim(coalesce(v_prod.stock::text, '')) = ''
           or btrim(v_prod.stock::text) ~* '^(nan|[+-]?inf(inity)?)$'
           or (v_prod.stock::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$' then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('Cannot restore reserved stock: product "%s" has an invalid global stock state.', v_prod.name_en)
          );
        end if;
        v_global_stock := round(v_prod.stock::numeric, 3);
        v_new_global := round(v_global_stock + v_qty, 3);
      exception when others then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('Cannot restore reserved stock: product "%s" has an invalid global stock state.', v_prod.name_en)
        );
      end;
      if v_global_stock < 0 then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('Cannot restore reserved stock: product "%s" has an invalid global stock state.', v_prod.name_en)
        );
      end if;

      if v_prod.branch_stock is not null and jsonb_typeof(v_prod.branch_stock) <> 'object' then
        return jsonb_build_object(
          'ok', false,
          'code', 'INVALID_STOCK_STATE',
          'error', format('Cannot restore reserved stock: product "%s" has an invalid branch_stock structure.', v_prod.name_en)
        );
      end if;

      v_has_branch_map := false;
      v_other_branch_total := 0;
      v_has_negative_branch := false;
      if v_prod.branch_stock is not null then
        begin
          select
            count(*) > 0,
            coalesce(bool_or(
              jsonb_typeof(kv.value) not in ('number', 'string')
              or btrim(coalesce(kv.value #>> '{}', '')) = ''
              or btrim(kv.value #>> '{}') ~* '^(nan|[+-]?inf(inity)?)$'
              or ((kv.value #>> '{}')::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$'
              or round((kv.value #>> '{}')::numeric, 3) < 0
            ), false)
          into v_has_branch_map, v_has_negative_branch
          from jsonb_each(v_prod.branch_stock) as kv(key, value);
        exception when others then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('Cannot restore reserved stock: product "%s" has corrupted branch_stock data.', v_prod.name_en)
          );
        end;
        if v_has_negative_branch then
          return jsonb_build_object(
            'ok', false,
            'code', 'INVALID_STOCK_STATE',
            'error', format('Cannot restore reserved stock: product "%s" has invalid or negative branch_stock.', v_prod.name_en)
          );
        end if;
        if v_has_branch_map then
          begin
            select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
            into v_other_branch_total
            from jsonb_each(v_prod.branch_stock) as kv(key, value);
          exception when others then
            return jsonb_build_object(
              'ok', false,
              'code', 'INVALID_STOCK_STATE',
              'error', format('Cannot restore reserved stock: product "%s" has corrupted branch_stock data.', v_prod.name_en)
            );
          end;
          if round(v_other_branch_total, 3) > v_global_stock then
            return jsonb_build_object(
              'ok', false,
              'code', 'INVALID_STOCK_STATE',
              'error', format('Cannot restore reserved stock: product "%s" has branch stock allocations (%s) exceeding global stock (%s).', v_prod.name_en, v_other_branch_total, v_global_stock)
            );
          end if;
        end if;
      end if;

      if v_branch_key is null and v_has_branch_map then
        return jsonb_build_object(
          'ok', false,
          'code', 'BRANCH_REQUIRED',
          'error', format('Cannot restore reserved stock for order %s: branch_id is missing for product %s which uses branch-specific stock.', v_order.order_number, v_prod.name_en)
        );
      end if;
    end loop;

    -- Second pass: atomically restore all locked products and log inventory adjustments
    v_did_restock := true;
    for v_line in
      select
        btrim(elem->>'productId') as product_id,
        round(sum((elem->>'quantity')::numeric), 3)::numeric(12,3) as total_qty
      from jsonb_array_elements(v_order.items) as elem
      group by btrim(elem->>'productId')
      order by btrim(elem->>'productId')
    loop
      v_qty := v_line.total_qty;
      select * into v_prod
      from public.products
      where id::text = v_line.product_id and user_id = p_user_id
      for update;

      if not found then
        raise exception 'Product % disappeared during reserved stock restoration.', v_line.product_id using errcode = 'P0002';
      end if;

      if v_prod.stock is null
         or btrim(coalesce(v_prod.stock::text, '')) = ''
         or btrim(v_prod.stock::text) ~* '^(nan|[+-]?inf(inity)?)$'
         or (v_prod.stock::numeric)::text ~* '^(nan|[+-]?inf(inity)?)$' then
        raise exception 'Non-finite global stock encountered during restoration for product %.', v_prod.id using errcode = '22023';
      end if;
      v_global_stock := round(v_prod.stock::numeric, 3);
      v_new_global := round(v_global_stock + v_qty, 3);
      v_new_branch_stock := coalesce(v_prod.branch_stock, '{}'::jsonb);
      v_has_branch_map := (
        v_prod.branch_stock is not null
        and jsonb_typeof(v_prod.branch_stock) = 'object'
        and exists (select 1 from jsonb_object_keys(v_prod.branch_stock))
      );

      if v_branch_key is null and v_has_branch_map then
        raise exception 'Branch ID is required during stock restoration for product % which maintains branch_stock.', v_prod.id using errcode = '22023';
      end if;

      v_other_branch_total := 0;
      if v_has_branch_map then
        select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
        into v_other_branch_total
        from jsonb_each(v_prod.branch_stock) as kv(key, value);

        if round(v_other_branch_total, 3) > v_global_stock then
          raise exception 'Inconsistent branch stock allocations during restoration for product % (branch total %, global stock %).', v_prod.id, v_other_branch_total, v_global_stock using errcode = '22023';
        end if;
      end if;

      if v_branch_key is not null and v_prod.branch_stock is not null and (v_prod.branch_stock ? v_branch_key) then
        v_available := round((v_prod.branch_stock->>v_branch_key)::numeric, 3);
        v_new_branch_qty := round(v_available + v_qty, 3);
        v_new_branch_stock := jsonb_set(v_new_branch_stock, array[v_branch_key], to_jsonb(v_new_branch_qty), true);
      elsif v_branch_key is not null and v_has_branch_map then
        v_available := least(v_global_stock, greatest(0::numeric, round(v_global_stock - v_other_branch_total, 3)));
        v_new_branch_qty := round(v_available + v_qty, 3);
        v_new_branch_stock := jsonb_set(v_new_branch_stock, array[v_branch_key], to_jsonb(v_new_branch_qty), true);
      else
        v_available := v_global_stock;
        v_new_branch_qty := v_new_global;
      end if;

      if v_has_branch_map then
        select coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
        into v_other_branch_total
        from jsonb_each(v_new_branch_stock) as kv(key, value);

        if round(v_other_branch_total, 3) > v_new_global then
          raise exception 'Post-restoration branch stock allocations exceed global stock for product % (branch total %, global stock %).', v_prod.id, v_other_branch_total, v_new_global using errcode = '22023';
        end if;
      end if;

      update public.products
      set stock = v_new_global,
          branch_stock = v_new_branch_stock,
          updated_at = v_now
      where id = v_prod.id and user_id = p_user_id;

      insert into public.inventory_adjustments (
        id, user_id, product_id, product_name, sku, selling_unit, branch_id,
        adjustment_type, quantity_change, previous_stock, new_stock, reason, actor_name, created_at
      ) values (
        gen_random_uuid(),
        p_user_id,
        v_prod.id,
        v_prod.name_en,
        v_prod.sku,
        coalesce(v_prod.selling_unit, 'piece'),
        v_branch_key,
        'Sale Return In',
        v_qty,
        v_available,
        v_new_branch_qty,
        'Omnichannel Order ' || initcap(p_target_status) || ': ' || v_order.order_number,
        v_effective_actor_name,
        v_now
      );
    end loop;
  end if;

  v_sanitized_history_entry :=
    case
      when nullif(btrim(coalesce(p_history_entry ->> 'note', '')), '') is not null
        then jsonb_build_object('note', btrim(p_history_entry ->> 'note'))
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'status', p_target_status,
      'actorId', v_effective_actor_id,
      'actorName', v_effective_actor_name,
      'actorRole', v_effective_actor_role,
      'changedAt', v_now
    );

  update public.omnichannel_orders
  set status = p_target_status,
      stock_reserved = case when v_did_restock then false else v_order.stock_reserved end,
      stock_restored_at = case when v_did_restock then v_now else v_order.stock_restored_at end,
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      status_history = coalesce(v_order.status_history, '[]'::jsonb) || jsonb_build_array(v_sanitized_history_entry),
      updated_by = v_effective_actor_name,
      updated_at = v_now
  where id = p_order_id and user_id = p_user_id
  returning * into v_order;

  insert into public.order_audit_logs (
    id, user_id, order_id, action, actor_id, actor_name, actor_role, previous_status, new_status, details, created_at
  ) values (
    'oaud-' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    v_order.id,
    case when v_did_restock then 'order_' || p_target_status || '_stock_restored' else 'order_' || p_target_status end,
    v_effective_actor_id,
    v_effective_actor_name,
    v_effective_actor_role,
    v_prev_status,
    p_target_status,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Order ' || p_target_status),
    v_now
  );

  return jsonb_build_object('ok', true, 'restocked', v_did_restock, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.cancel_or_reject_omnichannel_order_with_restock(
  uuid, text, text, text, text, text, text, jsonb
) from public, anon;

grant execute on function public.cancel_or_reject_omnichannel_order_with_restock(
  uuid, text, text, text, text, text, text, jsonb
) to authenticated, service_role;

commit;
