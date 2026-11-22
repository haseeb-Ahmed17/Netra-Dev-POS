-- ============================================================================
-- Khaas Retail POS — Production-Safe Schema Alignment & RLS Hardening Migration
-- Target: Supabase PostgreSQL (review & run manually in Supabase SQL Editor)
--
-- Safety guarantees:
--   * Idempotent & additive: safe to run multiple times; never drops tables,
--     never drops columns, and never deletes or resets business records.
--   * Preserves all existing valid tenant-scoped RLS policies (`auth.uid()` +
--     `user_id` ownership checks), RESTRICTIVE policies, and service_role policies.
--   * Preserves and warns on any unclassified/custom policies instead of
--     dropping them; only drops unambiguously open-access wildcard policies
--     (e.g., `USING (true)`, `1 = 1`, `auth.role() = 'authenticated'`,
--     `auth.uid() IS NOT NULL` with no `user_id` ownership check).
--   * Does not broaden `anon` or `authenticated` grants unnecessarily; revokes
--     `anon` privileges on tenant tables and ensures `purchase_items` grants.
--   * Preserves UUID PKs/FKs and upgrades `purchase_items.user_id` FK to
--     `ON DELETE RESTRICT` so deleting an auth user cannot wipe audit history.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Purchases: additive columns matching PurchaseRecord + idempotent backfill
--    Verified live columns referenced: p.id, p.user_id, p.vendor_id,
--    p.total_amount, p.paid_amount, p.notes, v.id, v.name, v.company.
-- ----------------------------------------------------------------------------
alter table public.purchases add column if not exists vendor_name text not null default '';
alter table public.purchases add column if not exists balance_due numeric not null default 0;
alter table public.purchases add column if not exists status text not null default 'received';
alter table public.purchases add column if not exists note text not null default '';
alter table public.purchases add column if not exists notes text not null default '';

update public.purchases p
set
  vendor_name = coalesce(
    nullif(p.vendor_name, ''),
    case
      when coalesce(v.company, '') <> '' then v.name || ' (' || v.company || ')'
      else v.name
    end
  ),
  balance_due = greatest(0, coalesce(p.total_amount, 0) - coalesce(p.paid_amount, 0)),
  note = coalesce(nullif(p.note, ''), nullif(p.notes, ''), '')
from public.vendors v
where p.vendor_id = v.id
  and (
    p.vendor_name = ''
    or (p.balance_due = 0 and coalesce(p.total_amount, 0) > coalesce(p.paid_amount, 0))
    or (p.note = '' and coalesce(p.notes, '') <> '')
  );

-- ----------------------------------------------------------------------------
-- 2. Purchase Items: additive columns, safe FK (ON DELETE RESTRICT), & backfill
--    Verified live columns referenced: pi.id, pi.purchase_id, pi.quantity,
--    pi.cost_price, pi.user_id, p.id, p.user_id.
-- ----------------------------------------------------------------------------
alter table public.purchase_items add column if not exists user_id uuid;
alter table public.purchase_items add column if not exists product_name text not null default '';
alter table public.purchase_items add column if not exists sku text not null default '';
alter table public.purchase_items add column if not exists unit_cost numeric not null default 0;
alter table public.purchase_items add column if not exists cost_price numeric not null default 0;
alter table public.purchase_items add column if not exists line_total numeric not null default 0;

do $$
declare
  v_fk_name text;
  v_del_type "char";
begin
  select c.conname, c.confdeltype
  into v_fk_name, v_del_type
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
  where n.nspname = 'public'
    and t.relname = 'purchase_items'
    and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and array_length(c.conkey, 1) = 1
    and a.attname = 'user_id'
  limit 1;

  if v_fk_name is null then
    alter table public.purchase_items
      add constraint purchase_items_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete restrict;
  elsif v_del_type = 'c' then
    -- Upgrade CASCADE to RESTRICT to prevent accidental business audit loss
    execute format('alter table public.purchase_items drop constraint %I', v_fk_name);
    alter table public.purchase_items
      add constraint purchase_items_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete restrict;
  end if;
end $$;

-- Backfill user_id strictly from matching parent purchase when pi.user_id is NULL
-- and parent p.user_id is populated. Never overwrites existing user_id values.
update public.purchase_items pi
set user_id = p.user_id
from public.purchases p
where pi.purchase_id = p.id
  and pi.user_id is null
  and p.user_id is not null;

-- Non-destructive integrity audit on purchase_items.user_id:
-- Reports any orphaned rows, remaining NULL user_id rows, or cross-tenant
-- mismatches against parent purchases without modifying or deleting rows.
do $$
declare
  v_null_user_count bigint;
  v_orphan_count bigint;
  v_mismatch_count bigint;
begin
  select count(*) into v_null_user_count
  from public.purchase_items
  where user_id is null;

  select count(*) into v_orphan_count
  from public.purchase_items pi
  left join public.purchases p on p.id = pi.purchase_id
  where p.id is null;

  select count(*) into v_mismatch_count
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.user_id is not null
    and p.user_id is not null
    and pi.user_id <> p.user_id;

  if v_null_user_count > 0 or v_orphan_count > 0 then
    raise notice 'purchase_items post-backfill audit: % row(s) have NULL user_id, % row(s) have no matching parent purchase. Preserved intact; isolated from tenant API access by RLS.',
      v_null_user_count, v_orphan_count;
  end if;

  if v_mismatch_count > 0 then
    raise warning 'purchase_items integrity warning: % row(s) have pi.user_id <> purchases.user_id. Preserved intact for manual administrator review.',
      v_mismatch_count;
  end if;
end $$;

-- Idempotent backfill for unit_cost, cost_price, and line_total
update public.purchase_items
set
  unit_cost = case when unit_cost = 0 and coalesce(cost_price, 0) > 0 then cost_price else unit_cost end,
  cost_price = case when cost_price = 0 and coalesce(unit_cost, 0) > 0 then unit_cost else cost_price end,
  line_total = case
    when line_total = 0 and coalesce(quantity, 0) > 0 and greatest(coalesce(unit_cost, 0), coalesce(cost_price, 0)) > 0
      then coalesce(quantity, 0) * greatest(coalesce(unit_cost, 0), coalesce(cost_price, 0))
    else line_total
  end
where (unit_cost = 0 and coalesce(cost_price, 0) > 0)
   or (cost_price = 0 and coalesce(unit_cost, 0) > 0)
   or (line_total = 0 and coalesce(quantity, 0) > 0 and greatest(coalesce(unit_cost, 0), coalesce(cost_price, 0)) > 0);

create index if not exists idx_purchase_items_user_id on public.purchase_items(user_id);
create index if not exists idx_purchase_items_purchase_id on public.purchase_items(purchase_id);

-- ----------------------------------------------------------------------------
-- 3. Inventory Adjustments: additive audit columns
-- ----------------------------------------------------------------------------
alter table public.inventory_adjustments add column if not exists product_name text not null default '';
alter table public.inventory_adjustments add column if not exists sku text not null default '';
alter table public.inventory_adjustments add column if not exists previous_stock integer not null default 0;
alter table public.inventory_adjustments add column if not exists new_stock integer not null default 0;

-- ----------------------------------------------------------------------------
-- 4. RLS Policy Classification, Open-Bypass Cleanup & Tenant Enforcement
--    Covers: purchase_items, vendors, purchases, inventory_adjustments,
--            customers, and expenses.
--
--    Classification rules for PERMISSIVE non-service_role policies:
--      1. VALID_TENANT_OWNERSHIP: contains `auth.uid()` AND word `user_id`,
--         with no `OR` clauses, `IS NULL`, or `!=`/`<>` on `user_id` -> PRESERVED.
--      2. UNSAFE_OPEN_WILDCARD: explicitly `true`, `1 = 1`,
--         `auth.role() = 'authenticated'`, or `auth.uid() IS NOT NULL` with
--         no tenant check -> DROPPED and logged.
--      3. UNCLASSIFIED: any other expression (e.g. `OR`, `auth.jwt()`, custom
--         functions) -> PRESERVED and logged via RAISE WARNING for review.
-- ----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables text[] := array[
    'purchase_items',
    'vendors',
    'purchases',
    'inventory_adjustments',
    'customers',
    'expenses'
  ];
  pol record;
  v_qual text;
  v_check text;
  v_qual_compact text;
  v_check_compact text;
  v_qual_is_valid boolean;
  v_check_is_valid boolean;
  v_qual_is_wildcard boolean;
  v_check_is_wildcard boolean;
  v_classification text;
  v_has_select boolean;
  v_has_insert boolean;
  v_has_update boolean;
  v_has_delete boolean;
  v_policy_name text;
begin
  foreach v_table in array v_tables loop
    -- Remove anonymous privileges on all tenant tables without broadening peer table grants
    execute format('revoke all on table public.%I from anon', v_table);

    -- Ensure authenticated CRUD grants on purchase_items (required for POS sync)
    if v_table = 'purchase_items' then
      execute 'grant select, insert, update, delete on table public.purchase_items to authenticated';
    end if;

    execute format('alter table public.%I enable row level security', v_table);

    -- Classify every existing policy on the table
    for pol in
      select
        policyname,
        permissive,
        roles::text[] as role_list,
        cmd,
        coalesce(qual, '') as qual_expr,
        coalesce(with_check, '') as check_expr
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
      order by policyname
    loop
      -- Always preserve RESTRICTIVE policies and service_role-only policies
      if pol.permissive <> 'PERMISSIVE' or pol.role_list = array['service_role'] then
        raise notice 'Preserving policy "%" on public.% (permissive=%, roles=%)',
          pol.policyname, v_table, pol.permissive, pol.role_list;
        continue;
      end if;

      v_qual := pol.qual_expr;
      v_check := pol.check_expr;
      v_qual_compact := regexp_replace(lower(v_qual), '\s+', '', 'g');
      v_check_compact := regexp_replace(lower(v_check), '\s+', '', 'g');

      v_qual_is_valid := (
        v_qual <> ''
        and v_qual ~* 'auth\.uid\(\)'
        and v_qual ~* '\muser_id\M'
        and v_qual !~* '\mor\M'
        and v_qual !~* '\mis\s+null\M'
        and v_qual !~* 'user_id\s*(!=|<>)|(!=|<>)\s*user_id'
      );

      v_check_is_valid := (
        v_check <> ''
        and v_check ~* 'auth\.uid\(\)'
        and v_check ~* '\muser_id\M'
        and v_check !~* '\mor\M'
        and v_check !~* '\mis\s+null\M'
        and v_check !~* 'user_id\s*(!=|<>)|(!=|<>)\s*user_id'
      );

      v_qual_is_wildcard := (
        v_qual_compact ~ '^\(*true(::boolean)?\)*$'
        or v_qual_compact ~ '^\(*1=1\)*$'
        or v_qual_compact ~ '^\(*\(?(auth\.)?role\(\)\)*=''authenticated''(::text)?\)*$'
        or v_qual_compact ~ '^\(*\(?auth\.uid\(\)\)*isnotnull\)*$'
      );

      v_check_is_wildcard := (
        v_check_compact ~ '^\(*true(::boolean)?\)*$'
        or v_check_compact ~ '^\(*1=1\)*$'
        or v_check_compact ~ '^\(*\(?(auth\.)?role\(\)\)*=''authenticated''(::text)?\)*$'
        or v_check_compact ~ '^\(*\(?auth\.uid\(\)\)*isnotnull\)*$'
      );

      v_classification := 'UNCLASSIFIED';

      if pol.cmd in ('SELECT', 'DELETE') then
        if v_qual_is_valid then
          v_classification := 'VALID_TENANT_OWNERSHIP';
        elsif v_qual_is_wildcard then
          v_classification := 'UNSAFE_OPEN_WILDCARD';
        end if;
      elsif pol.cmd = 'INSERT' then
        if v_check_is_valid then
          v_classification := 'VALID_TENANT_OWNERSHIP';
        elsif v_check_is_wildcard then
          v_classification := 'UNSAFE_OPEN_WILDCARD';
        end if;
      elsif pol.cmd in ('UPDATE', 'ALL') then
        if v_qual_is_valid and (v_check = '' or v_check_is_valid) then
          v_classification := 'VALID_TENANT_OWNERSHIP';
        elsif (v_qual_is_wildcard and (v_check = '' or v_check_is_wildcard))
           or (v_qual = '' and v_check_is_wildcard) then
          v_classification := 'UNSAFE_OPEN_WILDCARD';
        end if;
      end if;

      if v_classification = 'VALID_TENANT_OWNERSHIP' then
        raise notice 'Preserving valid tenant-scoped policy "%" on public.% (cmd=%, roles=%)',
          pol.policyname, v_table, pol.cmd, pol.role_list;
      elsif v_classification = 'UNSAFE_OPEN_WILDCARD' then
        raise notice 'Dropping unambiguously open wildcard policy "%" on public.% (cmd=%, roles=%, qual=[%], with_check=[%])',
          pol.policyname, v_table, pol.cmd, pol.role_list, v_qual, v_check;
        execute format('drop policy %I on public.%I', pol.policyname, v_table);
      else
        -- Per safety policy: preserve unclassified policies and report for manual review
        raise warning 'Preserving UNCLASSIFIED policy "%" on public.% for manual review (cmd=%, roles=%, qual=[%], with_check=[%])',
          pol.policyname, v_table, pol.cmd, pol.role_list, v_qual, v_check;
      end if;
    end loop;

    -- Verify whether authenticated CRUD coverage already exists via valid user_id policies
    select
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'SELECT')
          and coalesce(p.qual, '') ~* 'auth\.uid\(\)'
          and coalesce(p.qual, '') ~* '\muser_id\M'
          and coalesce(p.qual, '') !~* '\mor\M'
          and coalesce(p.qual, '') !~* '\mis\s+null\M'
      ),
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'INSERT')
          and (
            (p.cmd = 'INSERT'
              and coalesce(p.with_check, '') ~* 'auth\.uid\(\)'
              and coalesce(p.with_check, '') ~* '\muser_id\M'
              and coalesce(p.with_check, '') !~* '\mor\M'
              and coalesce(p.with_check, '') !~* '\mis\s+null\M')
            or (p.cmd = 'ALL'
              and coalesce(nullif(p.with_check, ''), p.qual, '') ~* 'auth\.uid\(\)'
              and coalesce(nullif(p.with_check, ''), p.qual, '') ~* '\muser_id\M'
              and coalesce(nullif(p.with_check, ''), p.qual, '') !~* '\mor\M'
              and coalesce(nullif(p.with_check, ''), p.qual, '') !~* '\mis\s+null\M')
          )
      ),
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'UPDATE')
          and coalesce(p.qual, '') ~* 'auth\.uid\(\)'
          and coalesce(p.qual, '') ~* '\muser_id\M'
          and coalesce(p.qual, '') !~* '\mor\M'
          and coalesce(p.qual, '') !~* '\mis\s+null\M'
          and coalesce(nullif(p.with_check, ''), p.qual, '') ~* 'auth\.uid\(\)'
          and coalesce(nullif(p.with_check, ''), p.qual, '') ~* '\muser_id\M'
          and coalesce(nullif(p.with_check, ''), p.qual, '') !~* '\mor\M'
          and coalesce(nullif(p.with_check, ''), p.qual, '') !~* '\mis\s+null\M'
      ),
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'DELETE')
          and coalesce(p.qual, '') ~* 'auth\.uid\(\)'
          and coalesce(p.qual, '') ~* '\muser_id\M'
          and coalesce(p.qual, '') !~* '\mor\M'
          and coalesce(p.qual, '') !~* '\mis\s+null\M'
      )
    into v_has_select, v_has_insert, v_has_update, v_has_delete;

    if not (v_has_select and v_has_insert and v_has_update and v_has_delete) then
      v_policy_name := format('Shopkeepers manage own %s', replace(v_table, '_', ' '));
      -- Avoid colliding with an existing policy name without dropping valid policies
      if exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = v_table and policyname = v_policy_name
      ) then
        v_policy_name := v_policy_name || ' (tenant enforcement)';
      end if;

      execute format(
        'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id and user_id is not null) with check (auth.uid() = user_id and user_id is not null)',
        v_policy_name,
        v_table
      );
      raise notice 'Created missing tenant-scoped policy "%" on public.%', v_policy_name, v_table;
    end if;
  end loop;
end $$;

commit;
