-- ============================================================================
-- SmartBitz POS: External E-Commerce Integrations Foundation
-- Additive, idempotent migration (Shopify, WooCommerce, Custom Website,
-- Official WhatsApp Business Cloud API status)
-- Preserves all existing POS, inventory, customer, and omnichannel data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTERNAL INTEGRATIONS REGISTRY (Per-tenant, server-encrypted credentials)
-- ---------------------------------------------------------------------------
create table if not exists public.external_integrations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (
    provider in ('shopify', 'woocommerce', 'custom_website', 'whatsapp_business')
  ),
  status text not null default 'not_connected' check (
    status in ('not_connected', 'pending_authorization', 'connected', 'error', 'disconnected')
  ),
  display_name text not null default '',
  store_domain text not null default '',
  api_key_masked text not null default '',
  webhook_secret_hash text,
  encrypted_credentials text,
  scopes text[] not null default '{}'::text[],
  last_sync_at timestamptz,
  last_sync_status text not null default 'never',
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_external_integrations_user_provider
  on public.external_integrations (user_id, provider);

create index if not exists idx_external_integrations_provider_domain
  on public.external_integrations (provider, store_domain)
  where btrim(store_domain) <> '';

-- ---------------------------------------------------------------------------
-- 2. OAUTH STATE NONCES (Replay protection for Shopify OAuth flows)
-- ---------------------------------------------------------------------------
create table if not exists public.integration_oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('shopify')),
  shop_domain text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_oauth_states_user_expires
  on public.integration_oauth_states (user_id, expires_at);

-- ---------------------------------------------------------------------------
-- 3. EXTERNAL PRODUCT & INVENTORY MAPPINGS
-- ---------------------------------------------------------------------------
create table if not exists public.external_product_mappings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('shopify', 'woocommerce', 'custom_website')),
  product_id text not null,
  external_product_id text not null,
  external_variant_id text not null default '',
  external_inventory_item_id text not null default '',
  external_sku text not null default '',
  last_synced_stock numeric(12,3),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Align product_id column type & FK cleanly with existing public.products(id) without breaking UUID/text schemas
do $$
declare
  v_products_id_type text;
  v_map_prod_type text;
  v_invalid_uuid_count bigint;
begin
  select data_type into v_products_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'id';

  select data_type into v_map_prod_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'external_product_mappings' and column_name = 'product_id';

  if v_products_id_type = 'uuid' and v_map_prod_type in ('text', 'character varying') then
    execute $q$
      select count(*)
      from public.external_product_mappings
      where product_id is not null
        and btrim(product_id) <> ''
        and btrim(product_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $q$ into v_invalid_uuid_count;

    if v_invalid_uuid_count > 0 then
      raise exception
        'Aborting migration: % row(s) in external_product_mappings.product_id contain non-UUID values while products.id is uuid.',
        v_invalid_uuid_count;
    end if;

    alter table public.external_product_mappings
      alter column product_id type uuid
      using nullif(btrim(product_id), '')::uuid;

    v_map_prod_type := 'uuid';
  elsif v_products_id_type in ('text', 'character varying') and v_map_prod_type = 'uuid' then
    alter table public.external_product_mappings
      alter column product_id type text
      using product_id::text;

    v_map_prod_type := 'text';
  end if;

  if v_products_id_type is not null and (
    (v_products_id_type = 'uuid' and v_map_prod_type = 'uuid')
    or (v_products_id_type in ('text', 'character varying') and v_map_prod_type in ('text', 'character varying'))
  ) then
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'external_product_mappings'
        and c.contype = 'f'
        and c.conname = 'external_product_mappings_product_id_fkey'
    ) then
      alter table public.external_product_mappings
        add constraint external_product_mappings_product_id_fkey
        foreign key (product_id) references public.products(id) on delete cascade;
    end if;
  end if;
end $$;

create unique index if not exists idx_external_product_mappings_unique
  on public.external_product_mappings (user_id, provider, external_product_id, external_variant_id);

create index if not exists idx_external_product_mappings_product
  on public.external_product_mappings (user_id, product_id);

-- ---------------------------------------------------------------------------
-- 4. APPEND-ONLY INTEGRATION AUDIT LOGS
-- ---------------------------------------------------------------------------
create table if not exists public.integration_audit_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null,
  action text not null,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  details text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_audit_logs_user_created
  on public.integration_audit_logs (user_id, created_at desc);

create or replace function public.prevent_integration_audit_logs_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'integration_audit_logs is strictly append-only; % operations are prohibited for all roles.', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.prevent_integration_audit_logs_mutation() from public, anon;

drop trigger if exists trg_integration_audit_logs_append_only on public.integration_audit_logs;
create trigger trg_integration_audit_logs_append_only
  before update or delete on public.integration_audit_logs
  for each row
  execute function public.prevent_integration_audit_logs_mutation();

create or replace function public.guard_integration_audit_logs_insert()
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
    raise exception 'Direct client insertion into integration_audit_logs is prohibited.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_integration_audit_logs_insert() from public, anon;

drop trigger if exists trg_integration_audit_logs_guard_insert on public.integration_audit_logs;
create trigger trg_integration_audit_logs_guard_insert
  before insert on public.integration_audit_logs
  for each row
  execute function public.guard_integration_audit_logs_insert();

-- ---------------------------------------------------------------------------
-- 5. STRICT RLS & LEAST-PRIVILEGE GRANTS FOR NEW TABLES
-- ---------------------------------------------------------------------------
alter table public.external_integrations enable row level security;
alter table public.integration_oauth_states enable row level security;
alter table public.external_product_mappings enable row level security;
alter table public.integration_audit_logs enable row level security;

-- external_integrations: authenticated Admin can SELECT ONLY non-secret display columns;
-- encrypted_credentials and webhook_secret_hash are NEVER selectable by browser clients.
revoke all on table public.external_integrations from anon, public, authenticated;
grant select (
  id,
  user_id,
  provider,
  status,
  display_name,
  store_domain,
  api_key_masked,
  scopes,
  last_sync_at,
  last_sync_status,
  last_error,
  metadata,
  connected_at,
  disconnected_at,
  created_at,
  updated_at
) on table public.external_integrations to authenticated;
grant all privileges on table public.external_integrations to service_role;

drop policy if exists external_integrations_tenant_select on public.external_integrations;
create policy external_integrations_tenant_select
  on public.external_integrations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists external_integrations_rbac_select on public.external_integrations;
create policy external_integrations_rbac_select
  on public.external_integrations
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin']));

-- integration_oauth_states: strictly server-side service_role only (zero anon/authenticated grants)
revoke all on table public.integration_oauth_states from anon, public, authenticated;
grant all privileges on table public.integration_oauth_states to service_role;

-- external_product_mappings: tenant read-only for Admin/Manager; writes by server service_role
revoke all on table public.external_product_mappings from anon, public, authenticated;
grant select on table public.external_product_mappings to authenticated;
grant all privileges on table public.external_product_mappings to service_role;

drop policy if exists external_product_mappings_tenant_select on public.external_product_mappings;
create policy external_product_mappings_tenant_select
  on public.external_product_mappings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists external_product_mappings_rbac_select on public.external_product_mappings;
create policy external_product_mappings_rbac_select
  on public.external_product_mappings
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin', 'manager']));

-- integration_audit_logs: Admin SELECT only; service_role SELECT + INSERT only (append-only)
revoke all on table public.integration_audit_logs from anon, public, authenticated, service_role;
grant select on table public.integration_audit_logs to authenticated;
grant select, insert on table public.integration_audit_logs to service_role;

drop policy if exists integration_audit_logs_tenant_select on public.integration_audit_logs;
create policy integration_audit_logs_tenant_select
  on public.integration_audit_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists integration_audit_logs_rbac_select on public.integration_audit_logs;
create policy integration_audit_logs_rbac_select
  on public.integration_audit_logs
  as restrictive
  for select
  to authenticated
  using (public.is_staff_role_in(array['admin']));

-- ---------------------------------------------------------------------------
-- 6. ADDITIVE EXTENSIONS TO OMNICHANNEL ORDERS & WEBHOOK EVENTS
-- ---------------------------------------------------------------------------
alter table public.omnichannel_orders
  add column if not exists external_source text,
  add column if not exists external_order_id text,
  add column if not exists external_order_number text,
  add column if not exists integration_id text references public.external_integrations(id) on delete set null;

create unique index if not exists idx_omnichannel_orders_external_order
  on public.omnichannel_orders (user_id, external_source, external_order_id)
  where external_source is not null
    and external_order_id is not null
    and btrim(external_order_id) <> '';

-- Safely widen omnichannel_orders.channel CHECK constraint to support external channels
do $$
declare
  c_rec record;
  v_conname text;
  v_condef text;
  v_literal text;
  v_expected text[] := array['website', 'whatsapp', 'phone', 'shopify', 'woocommerce', 'custom_website'];
  v_count int := 0;
  v_already boolean := false;
begin
  for c_rec in
    select c.conname, pg_get_constraintdef(c.oid) as condef
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'omnichannel_orders'
      and c.contype = 'c'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'channel'
  loop
    v_count := v_count + 1;
    v_conname := c_rec.conname;
    v_condef := c_rec.condef;

    for v_literal in
      select m[1]
      from regexp_matches(v_condef, '''([^'']+)''', 'g') as m
    loop
      if v_literal <> all(v_expected) then
        raise exception
          'Aborting migration: omnichannel_orders.channel constraint "%" allows unexpected value "%".',
          v_conname, v_literal;
      end if;
    end loop;
  end loop;

  if v_count > 1 then
    raise exception 'Aborting migration: found % single-column CHECK constraints on omnichannel_orders.channel.', v_count;
  end if;

  if v_condef is not null then
    v_already := position('''shopify''' in v_condef) > 0
      and position('''woocommerce''' in v_condef) > 0
      and position('''custom_website''' in v_condef) > 0;
  end if;

  if not v_already then
    if v_conname is not null then
      execute format('alter table public.omnichannel_orders drop constraint %I', v_conname);
    end if;

    alter table public.omnichannel_orders
      add constraint omnichannel_orders_channel_check
      check (channel in ('website', 'whatsapp', 'phone', 'shopify', 'woocommerce', 'custom_website'));
  end if;
end $$;

-- Safely widen webhook_events.channel CHECK constraint to support external channels
do $$
declare
  c_rec record;
  v_conname text;
  v_condef text;
  v_literal text;
  v_expected text[] := array['whatsapp', 'website', 'shopify', 'woocommerce', 'custom_website'];
  v_count int := 0;
  v_already boolean := false;
begin
  for c_rec in
    select c.conname, pg_get_constraintdef(c.oid) as condef
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'webhook_events'
      and c.contype = 'c'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'channel'
  loop
    v_count := v_count + 1;
    v_conname := c_rec.conname;
    v_condef := c_rec.condef;

    for v_literal in
      select m[1]
      from regexp_matches(v_condef, '''([^'']+)''', 'g') as m
    loop
      if v_literal <> all(v_expected) then
        raise exception
          'Aborting migration: webhook_events.channel constraint "%" allows unexpected value "%".',
          v_conname, v_literal;
      end if;
    end loop;
  end loop;

  if v_count > 1 then
    raise exception 'Aborting migration: found % single-column CHECK constraints on webhook_events.channel.', v_count;
  end if;

  if v_condef is not null then
    v_already := position('''shopify''' in v_condef) > 0
      and position('''woocommerce''' in v_condef) > 0
      and position('''custom_website''' in v_condef) > 0;
  end if;

  if not v_already then
    if v_conname is not null then
      execute format('alter table public.webhook_events drop constraint %I', v_conname);
    end if;

    alter table public.webhook_events
      add constraint webhook_events_channel_check
      check (channel in ('whatsapp', 'website', 'shopify', 'woocommerce', 'custom_website'));
  end if;
end $$;

-- Protect external metadata columns on omnichannel_orders from direct client modification
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
       or new.external_source is distinct from old.external_source
       or new.external_order_id is distinct from old.external_order_id
       or new.external_order_number is distinct from old.external_order_number
       or new.integration_id is distinct from old.integration_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Direct modification of protected omnichannel order fields is prohibited; use authorized server workflows or RPCs.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      raise exception 'Direct omnichannel order status transitions (%) are prohibited; use authorized status transition RPCs or server workflows.', new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_omnichannel_orders_update() from public, anon;

-- ---------------------------------------------------------------------------
-- 7. SERVER-ONLY RPC FOR EXTERNAL E-COMMERCE ORDER IMPORT (DEDUP + AUDIT)
-- ---------------------------------------------------------------------------
create or replace function public.import_external_omnichannel_order(
  p_user_id uuid,
  p_channel text,
  p_external_source text,
  p_external_order_id text,
  p_external_order_number text default null,
  p_integration_id text default null,
  p_customer_name text default '',
  p_customer_phone text default '',
  p_delivery_address text default '',
  p_notes text default '',
  p_branch_id text default null,
  p_payment_method text default 'online',
  p_payment_status text default 'unpaid',
  p_paid_amount numeric default 0,
  p_idempotency_key text default null,
  p_order_number text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_db_role text := coalesce(nullif(current_setting('role', true), ''), '');
  v_is_service_role boolean := (v_db_role = 'service_role');
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_ext_source text := lower(btrim(coalesce(p_external_source, '')));
  v_ext_order_id text := nullif(btrim(coalesce(p_external_order_id, '')), '');
  v_ext_order_num text := nullif(btrim(coalesce(p_external_order_number, '')), '');
  v_integration_id text := nullif(btrim(coalesce(p_integration_id, '')), '');
  v_integration public.external_integrations%rowtype;
  v_clean_idem text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing public.omnichannel_orders%rowtype;
  v_sub jsonb;
  v_branch_rec record;
  v_resolved_branch_id public.omnichannel_orders.branch_id%type := null;
  v_resolved_branch_name text := '';
  v_line record;
  v_prod public.products%rowtype;
  v_qty numeric(12,3);
  v_unit_price numeric(14,2);
  v_tax_rate numeric;
  v_line_subtotal numeric(14,2);
  v_line_tax numeric(14,2);
  v_line_total numeric(14,2);
  v_resolved_items jsonb := '[]'::jsonb;
  v_subtotal numeric(14,2) := 0;
  v_tax_amount numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_paid_amount numeric(14,2) := 0;
  v_pay_method text := lower(btrim(coalesce(p_payment_method, 'online')));
  v_pay_status text := lower(btrim(coalesce(p_payment_status, 'unpaid')));
  v_now timestamptz := now();
  v_order_id text;
  v_order_number text;
  v_created public.omnichannel_orders%rowtype;
begin
  if not v_is_service_role then
    raise exception 'External order import RPC is restricted to trusted server context.' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Tenant user_id is required.' using errcode = '22004';
  end if;

  if v_channel not in ('shopify', 'woocommerce', 'custom_website')
     or v_ext_source not in ('shopify', 'woocommerce', 'custom_website')
     or v_ext_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EXTERNAL_SOURCE', 'error', 'Valid external source and external order ID are required.');
  end if;

  -- Verify p_integration_id when provided (preserving only intentionally null workflow)
  if p_integration_id is not null then
    if v_integration_id is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_INTEGRATION',
        'error', 'Integration ID cannot be blank when provided.'
      );
    end if;

    select * into v_integration
    from public.external_integrations ei
    where ei.id = v_integration_id
    limit 1;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_INTEGRATION',
        'error', 'External integration record does not exist.'
      );
    end if;

    if v_integration.user_id is distinct from p_user_id then
      return jsonb_build_object(
        'ok', false,
        'code', 'INTEGRATION_TENANT_MISMATCH',
        'error', 'Integration does not belong to the target tenant.'
      );
    end if;

    if v_integration.provider is distinct from v_ext_source then
      return jsonb_build_object(
        'ok', false,
        'code', 'INTEGRATION_PROVIDER_MISMATCH',
        'error', 'Integration provider does not match the external order source.'
      );
    end if;

    if v_integration.status is distinct from 'connected' then
      return jsonb_build_object(
        'ok', false,
        'code', 'INTEGRATION_NOT_CONNECTED',
        'error', 'External integration must be in connected status.'
      );
    end if;
  end if;

  -- Check tenant subscription status
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

  -- Deduplicate by (user_id, external_source, external_order_id) or idempotency_key
  select * into v_existing
  from public.omnichannel_orders
  where user_id = p_user_id
    and external_source = v_ext_source
    and external_order_id = v_ext_order_id
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'deduplicated', true, 'order', to_jsonb(v_existing));
  end if;

  if v_clean_idem is not null then
    select * into v_existing
    from public.omnichannel_orders
    where user_id = p_user_id
      and idempotency_key = v_clean_idem
    limit 1;
    if found then
      return jsonb_build_object('ok', true, 'deduplicated', true, 'order', to_jsonb(v_existing));
    end if;
  end if;

  -- Resolve active branch
  if nullif(btrim(coalesce(p_branch_id, '')), '') is not null then
    select b.id, b.name into v_branch_rec
    from public.branches b
    where b.user_id = p_user_id
      and b.id::text = btrim(p_branch_id)
      and b.is_active = true
    limit 1;
  end if;

  if not found then
    select b.id, b.name into v_branch_rec
    from public.branches b
    where b.user_id = p_user_id
      and b.is_active = true
    order by b.is_main desc, b.created_at asc
    limit 1;
  end if;

  if found then
    v_resolved_branch_id := v_branch_rec.id;
    v_resolved_branch_name := coalesce(v_branch_rec.name, '');
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'EMPTY_ITEMS', 'error', 'External order must include at least one valid line item.');
  end if;

  for v_line in
    select
      btrim(elem->>'productId') as product_id,
      sum((elem->>'quantity')::numeric) as total_qty
    from jsonb_array_elements(p_items) as elem
    group by btrim(elem->>'productId')
    order by btrim(elem->>'productId')
  loop
    v_qty := round(v_line.total_qty, 3);
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_QUANTITY', 'error', 'External order contains invalid item quantity.');
    end if;

    select * into v_prod
    from public.products
    where id::text = v_line.product_id
      and user_id = p_user_id
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'error', format('Mapped product (%s) does not belong to this shop.', v_line.product_id));
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

  v_total := greatest(0::numeric, round(v_subtotal + v_tax_amount, 2));

  if v_pay_method not in ('cod', 'cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer', 'online') then
    v_pay_method := 'online';
  end if;
  if v_pay_status not in ('unpaid', 'cod_pending', 'partially_paid', 'paid', 'refunded') then
    v_pay_status := case when v_pay_method = 'cod' then 'cod_pending' else 'unpaid' end;
  end if;
  v_paid_amount := least(v_total, greatest(0::numeric, round(coalesce(p_paid_amount, 0), 2)));

  v_order_id := 'omni-' || replace(gen_random_uuid()::text, '-', '');
  v_order_number := coalesce(
    nullif(btrim(coalesce(p_order_number, '')), ''),
    case
      when v_channel = 'shopify' then 'SHP-'
      when v_channel = 'woocommerce' then 'WOO-'
      else 'EXT-'
    end || to_char(v_now, 'YYYYMMDD') || '-' || lpad((floor(random() * 9000 + 1000))::int::text, 4, '0')
  );

  insert into public.omnichannel_orders (
    id,
    user_id,
    branch_id,
    branch_name,
    order_number,
    channel,
    status,
    customer_id,
    customer_name,
    customer_phone,
    delivery_address,
    notes,
    items,
    subtotal,
    discount_amount,
    tax_amount,
    total,
    payment_method,
    payment_status,
    paid_amount,
    idempotency_key,
    external_source,
    external_order_id,
    external_order_number,
    integration_id,
    stock_reserved,
    status_history,
    notification_log,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) values (
    v_order_id,
    p_user_id,
    v_resolved_branch_id,
    v_resolved_branch_name,
    v_order_number,
    v_channel,
    'new',
    null,
    coalesce(nullif(btrim(p_customer_name), ''), 'External Store Customer'),
    coalesce(nullif(btrim(p_customer_phone), ''), 'N/A'),
    coalesce(nullif(btrim(p_delivery_address), ''), 'External Delivery'),
    coalesce(btrim(p_notes), ''),
    v_resolved_items,
    v_subtotal,
    0,
    v_tax_amount,
    v_total,
    v_pay_method,
    v_pay_status,
    v_paid_amount,
    v_clean_idem,
    v_ext_source,
    v_ext_order_id,
    v_ext_order_num,
    v_integration_id,
    false,
    jsonb_build_array(
      jsonb_build_object(
        'status', 'new',
        'changedAt', v_now,
        'actorId', v_ext_source || '_webhook',
        'actorName', initcap(replace(v_ext_source, '_', ' ')),
        'actorRole', 'webhook',
        'note', format('Imported from %s (%s)', v_ext_source, coalesce(v_ext_order_num, v_ext_order_id))
      )
    ),
    '[]'::jsonb,
    v_ext_source,
    v_ext_source,
    v_now,
    v_now
  )
  returning * into v_created;

  insert into public.order_audit_logs (
    id,
    user_id,
    order_id,
    action,
    actor_id,
    actor_name,
    actor_role,
    previous_status,
    new_status,
    details,
    created_at
  ) values (
    'oaud-' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    v_order_id,
    v_ext_source || '_order_imported',
    v_ext_source || '_webhook',
    initcap(replace(v_ext_source, '_', ' ')),
    'webhook',
    null,
    'new',
    format('Imported %s order %s -> %s', v_ext_source, coalesce(v_ext_order_num, v_ext_order_id), v_order_number),
    v_now
  );

  return jsonb_build_object('ok', true, 'deduplicated', false, 'order', to_jsonb(v_created));
end;
$$;

revoke all on function public.import_external_omnichannel_order(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.import_external_omnichannel_order(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, text, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- 8. SERVER-ONLY RPC FOR EXTERNAL ORDER CANCELLATION + STOCK RESTORATION
-- ---------------------------------------------------------------------------
create or replace function public.cancel_external_omnichannel_order_with_restock(
  p_user_id uuid,
  p_external_source text,
  p_external_order_id text,
  p_reason text default 'Cancelled in external store'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_db_role text := coalesce(nullif(current_setting('role', true), ''), '');
  v_is_service_role boolean := (v_db_role = 'service_role');
  v_ext_source text := lower(btrim(coalesce(p_external_source, '')));
  v_ext_order_id text := nullif(btrim(coalesce(p_external_order_id, '')), '');
  v_order public.omnichannel_orders%rowtype;
  v_prev_status text;
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
  v_actor_id text := v_ext_source || '_webhook';
  v_actor_name text := initcap(replace(v_ext_source, '_', ' '));
  v_history_entry jsonb;
begin
  if not v_is_service_role then
    raise exception 'External cancellation RPC is restricted to trusted server context.' using errcode = '42501';
  end if;

  if p_user_id is null or v_ext_source not in ('shopify', 'woocommerce', 'custom_website') or v_ext_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Valid tenant, external source, and order ID are required.');
  end if;

  select * into v_order
  from public.omnichannel_orders
  where user_id = p_user_id
    and external_source = v_ext_source
    and external_order_id = v_ext_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Matching external order not found for this shop.');
  end if;

  v_prev_status := v_order.status;

  if v_prev_status in ('cancelled', 'rejected') then
    return jsonb_build_object('ok', true, 'idempotent', true, 'restocked', false, 'order', to_jsonb(v_order));
  end if;

  if v_prev_status = 'delivered' then
    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_DELIVERED',
      'error', format('Order %s is already delivered and cannot be auto-cancelled by webhook.', v_order.order_number)
    );
  end if;

  -- Only restore stock if stock was actually reserved and not yet restored
  if v_order.stock_reserved = true and v_order.stock_restored_at is null then
    v_branch_key := nullif(btrim(coalesce(v_order.branch_id::text, '')), '');

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
        raise exception 'Cannot restore stock: product % missing from catalog.', v_line.product_id using errcode = 'P0002';
      end if;

      v_global_stock := round(v_prod.stock::numeric, 3);
      if v_global_stock is null or v_global_stock < 0 then
        raise exception 'Invalid global stock state for product %.', v_prod.id using errcode = '22023';
      end if;

      v_new_global := round(v_global_stock + v_qty, 3);
      v_new_branch_stock := coalesce(v_prod.branch_stock, '{}'::jsonb);
      v_has_branch_map := (
        v_prod.branch_stock is not null
        and jsonb_typeof(v_prod.branch_stock) = 'object'
        and exists (select 1 from jsonb_object_keys(v_prod.branch_stock))
      );

      if v_has_branch_map then
        select
          coalesce(bool_or(round((kv.value #>> '{}')::numeric, 3) < 0), false),
          coalesce(sum(round((kv.value #>> '{}')::numeric, 3)), 0)
        into v_has_negative_branch, v_other_branch_total
        from jsonb_each(v_prod.branch_stock) as kv(key, value);

        if v_has_negative_branch or round(v_other_branch_total, 3) > v_global_stock then
          raise exception 'Inconsistent branch stock state for product %.', v_prod.id using errcode = '22023';
        end if;
      end if;

      if v_branch_key is null and v_has_branch_map then
        raise exception 'Branch ID required to restore branch stock for product %.', v_prod.id using errcode = '22023';
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
        'External Order Cancelled: ' || v_order.order_number,
        v_actor_name,
        v_now
      );
    end loop;

    v_did_restock := true;
  end if;

  v_history_entry := jsonb_build_object(
    'status', 'cancelled',
    'actorId', v_actor_id,
    'actorName', v_actor_name,
    'actorRole', 'webhook',
    'changedAt', v_now,
    'note', coalesce(nullif(btrim(p_reason), ''), 'Cancelled in external store')
  );

  update public.omnichannel_orders
  set status = 'cancelled',
      stock_reserved = false,
      stock_restored_at = case when v_did_restock then v_now else stock_restored_at end,
      cancellation_reason = coalesce(nullif(btrim(p_reason), ''), cancellation_reason),
      status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(v_history_entry),
      updated_by = v_actor_name,
      updated_at = v_now
  where id = v_order.id and user_id = p_user_id
  returning * into v_order;

  insert into public.order_audit_logs (
    id, user_id, order_id, action, actor_id, actor_name, actor_role, previous_status, new_status, details, created_at
  ) values (
    'oaud-' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    v_order.id,
    v_ext_source || '_order_cancelled',
    v_actor_id,
    v_actor_name,
    'webhook',
    v_prev_status,
    'cancelled',
    coalesce(nullif(btrim(p_reason), ''), 'Cancelled in external store'),
    v_now
  );

  return jsonb_build_object('ok', true, 'restocked', v_did_restock, 'order', to_jsonb(v_order));
end;
$$;

revoke all on function public.cancel_external_omnichannel_order_with_restock(
  uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.cancel_external_omnichannel_order_with_restock(
  uuid, text, text, text
) to service_role;

