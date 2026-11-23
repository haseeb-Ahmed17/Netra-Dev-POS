-- ============================================================================
-- Khaas Retail POS — Production-Safe Schema Alignment & RLS Hardening Migration
-- Target: Supabase PostgreSQL (review & run manually in Supabase SQL Editor)
--
-- Security & Safety Guarantees:
--   * Idempotent & additive: wrapped in an explicit transaction (`begin; ... commit;`),
--     never drops tables, never drops columns, never deletes or resets rows.
--   * Strict ownership verification: classifies a policy as VALID_TENANT_OWNERSHIP
--     ONLY when its normalized expression matches an exact `auth.uid() = user_id`
--     (or `user_id = auth.uid()`) ownership equality check — never via loose
--     keyword matching.
--   * Fail-closed on unclassified PERMISSIVE policies: preserves any unclassified
--     PERMISSIVE policy and aborts with `RAISE EXCEPTION` before committing so
--     no hidden OR-combined RLS bypass can remain after migration.
--   * Independent per-command RLS verification: verifies `SELECT` (`USING`),
--     `INSERT` (`WITH CHECK`), `UPDATE` (`USING` + `WITH CHECK`), and `DELETE`
--     (`USING`) independently, confirming `user_id` exists on every target table.
--   * Foreign key integrity: validates all non-NULL `purchase_items.user_id`
--     values against `auth.users(id)` BEFORE adding/updating any FK, preserves
--     existing valid `RESTRICT` / `NO ACTION` constraints, and safely upgrades
--     `CASCADE` / `SET NULL` / `SET DEFAULT` constraints to `ON DELETE RESTRICT`.
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
-- 2. Purchase Items: additive columns, verified user_id backfill, & safe FK
--    Verified live columns referenced: pi.id, pi.purchase_id, pi.quantity,
--    pi.cost_price, pi.user_id, p.id, p.user_id.
-- ----------------------------------------------------------------------------
alter table public.purchase_items add column if not exists user_id uuid;
alter table public.purchase_items add column if not exists product_name text not null default '';
alter table public.purchase_items add column if not exists sku text not null default '';
alter table public.purchase_items add column if not exists unit_cost numeric not null default 0;
alter table public.purchase_items add column if not exists cost_price numeric not null default 0;
alter table public.purchase_items add column if not exists line_total numeric not null default 0;

-- Step 2a: Backfill user_id strictly from matching parent purchase when
-- pi.user_id is NULL and p.user_id is populated. Never overwrites existing values.
update public.purchase_items pi
set user_id = p.user_id
from public.purchases p
where pi.purchase_id = p.id
  and pi.user_id is null
  and p.user_id is not null;

-- Step 2b: Validate existing non-NULL purchase_items.user_id references auth.users(id)
-- and audit orphans/mismatches BEFORE adding or modifying the foreign key.
do $$
declare
  v_invalid_auth_user_count bigint;
  v_null_user_count bigint;
  v_orphan_count bigint;
  v_mismatch_count bigint;
begin
  select count(*) into v_invalid_auth_user_count
  from public.purchase_items pi
  left join auth.users u on u.id = pi.user_id
  where pi.user_id is not null
    and u.id is null;

  if v_invalid_auth_user_count > 0 then
    raise exception
      'Aborting migration: % row(s) in public.purchase_items have non-NULL user_id values that do not exist in auth.users(id). No records were deleted or modified. Inspect with: SELECT pi.id, pi.purchase_id, pi.user_id FROM public.purchase_items pi LEFT JOIN auth.users u ON u.id = pi.user_id WHERE pi.user_id IS NOT NULL AND u.id IS NULL;',
      v_invalid_auth_user_count;
  end if;

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

  if v_mismatch_count > 0 then
    raise exception
      'Aborting migration: % row(s) in public.purchase_items have pi.user_id <> purchases.user_id. No records were deleted or modified. Resolve ownership mismatch manually before enforcing RLS.',
      v_mismatch_count;
  end if;

  if v_null_user_count > 0 or v_orphan_count > 0 then
    raise notice 'purchase_items post-backfill audit: % row(s) have NULL user_id, % row(s) have no matching parent purchase. Preserved intact and isolated from tenant API access by RLS.',
      v_null_user_count, v_orphan_count;
  end if;
end $$;

-- Step 2c: Inspect existing purchase_items.user_id -> auth.users(id) FKs.
-- Preserve valid RESTRICT ('r') / NO ACTION ('a') constraints.
-- Safely replace CASCADE ('c'), SET NULL ('n'), or SET DEFAULT ('d') with RESTRICT.
do $$
declare
  fk record;
  v_has_valid_fk boolean := false;
  v_new_fk_name text := 'purchase_items_user_id_fkey';
begin
  for fk in
    select
      c.conname,
      c.confdeltype
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
    order by c.conname
  loop
    if fk.confdeltype in ('r', 'a') then
      v_has_valid_fk := true;
      raise notice 'Preserving valid FK "%" on public.purchase_items(user_id) with ON DELETE %',
        fk.conname,
        case fk.confdeltype when 'r' then 'RESTRICT' else 'NO ACTION' end;
    elsif fk.confdeltype in ('c', 'n', 'd') then
      raise notice 'Replacing unsafe FK "%" (ON DELETE %) on public.purchase_items(user_id) with ON DELETE RESTRICT',
        fk.conname,
        case fk.confdeltype
          when 'c' then 'CASCADE'
          when 'n' then 'SET NULL'
          else 'SET DEFAULT'
        end;
      execute format('alter table public.purchase_items drop constraint %I', fk.conname);
    end if;
  end loop;

  if not v_has_valid_fk then
    if exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = 'purchase_items' and c.conname = v_new_fk_name
    ) then
      v_new_fk_name := 'purchase_items_user_id_restrict_fkey';
    end if;

    execute format(
      'alter table public.purchase_items add constraint %I foreign key (user_id) references auth.users(id) on delete restrict',
      v_new_fk_name
    );
    raise notice 'Added FK "%" on public.purchase_items(user_id) REFERENCES auth.users(id) ON DELETE RESTRICT',
      v_new_fk_name;
  end if;
end $$;

-- Step 2d: Idempotent backfill for unit_cost, cost_price, and line_total
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
-- 4. Strict RLS Policy Verification, Safe Enforcement & Fail-Closed Guard
--    Covers: purchase_items, vendors, purchases, inventory_adjustments,
--            customers, and expenses.
--
--    Performs:
--      a) Verifies `user_id` column exists (type `uuid`) on every target table.
--      b) Revokes `anon` table privileges without broadening `authenticated`.
--      c) Enables RLS (`ENABLE ROW LEVEL SECURITY`).
--      d) Classifies EVERY existing policy strictly using normalized exact
--         ownership equality (`auth.uid() = user_id` / `user_id = auth.uid()`).
--         - VALID_TENANT_OWNERSHIP / RESTRICTIVE / service_role -> PRESERVED.
--         - UNSAFE_OPEN_WILDCARD (`true`, `1=1`, `auth.role()='authenticated'`,
--           `auth.uid() is not null`) -> DROPPED and logged.
--         - UNCLASSIFIED PERMISSIVE -> PRESERVED, recorded, and aborts via
--           RAISE EXCEPTION before commit so no hidden OR-bypass remains.
--      e) Verifies SELECT (USING), INSERT (WITH CHECK), UPDATE (USING + WITH CHECK),
--         and DELETE (USING) independently and adds any missing per-command policies.
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
  v_user_id_type text;
  pol record;
  v_qual_compact text;
  v_check_compact text;
  v_uid_expr constant text := '\(*(\(selectauth\.uid\(\)(asuid)?\)|auth\.uid\(\))\)*';
  v_col_expr constant text := '\(*([a-z_]+\.)?user_id(::uuid)?\)*';
  v_eq_all text;
  v_nn_expr constant text := '\(*([a-z_]+\.)?user_idisnotnull\)*';
  v_owner_re text;
  v_wildcard_re constant text := '^(\(*true(::boolean)?\)*|\(*1=1\)*|\(*\(?(auth\.)?role\(\)\)*=''authenticated''(::text)?\)*|\(*\(?auth\.uid\(\)\)*isnotnull\)*)$';
  v_qual_is_valid boolean;
  v_check_is_valid boolean;
  v_qual_is_wildcard boolean;
  v_check_is_wildcard boolean;
  v_classification text;
  v_unclassified_list text := '';
  v_has_select boolean;
  v_has_insert boolean;
  v_has_update boolean;
  v_has_delete boolean;
  v_policy_name text;
begin
  v_eq_all := '(' || v_uid_expr || '=' || v_col_expr || '|' || v_col_expr || '=' || v_uid_expr || ')';
  v_owner_re := '^\(*(' || v_eq_all || '|\(*' || v_eq_all || '\)*and' || v_nn_expr || '|' || v_nn_expr || 'and\(*' || v_eq_all || '\)*)\)*$';

  foreach v_table in array v_tables loop
    -- (a) Confirm target table has required `user_id` uuid column
    select c.data_type
    into v_user_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_table
      and c.column_name = 'user_id';

    if v_user_id_type is null then
      raise exception 'Aborting migration: target table public.% is missing required column user_id.', v_table;
    elsif v_user_id_type <> 'uuid' then
      raise exception 'Aborting migration: target table public.% has user_id type %, expected uuid.', v_table, v_user_id_type;
    end if;

    -- (b) Revoke anonymous grants without broadening authenticated grants on peer tables
    execute format('revoke all on table public.%I from anon', v_table);
    if v_table = 'purchase_items' then
      execute 'grant select, insert, update, delete on table public.purchase_items to authenticated';
    end if;

    -- (c) Enable RLS
    execute format('alter table public.%I enable row level security', v_table);

    -- (d) Inspect and classify every existing policy on the table
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

      v_qual_compact := regexp_replace(lower(pol.qual_expr), '\s+', '', 'g');
      v_check_compact := regexp_replace(lower(pol.check_expr), '\s+', '', 'g');

      v_qual_is_valid := (v_qual_compact <> '' and v_qual_compact ~ v_owner_re);
      v_check_is_valid := (v_check_compact <> '' and v_check_compact ~ v_owner_re);

      v_qual_is_wildcard := (v_qual_compact <> '' and v_qual_compact ~ v_wildcard_re);
      v_check_is_wildcard := (v_check_compact <> '' and v_check_compact ~ v_wildcard_re);

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
        if v_qual_is_valid and (v_check_compact = '' or v_check_is_valid) then
          v_classification := 'VALID_TENANT_OWNERSHIP';
        elsif (v_qual_is_wildcard and (v_check_compact = '' or v_check_is_wildcard))
           or (v_qual_compact = '' and v_check_is_wildcard) then
          v_classification := 'UNSAFE_OPEN_WILDCARD';
        end if;
      end if;

      if v_classification = 'VALID_TENANT_OWNERSHIP' then
        raise notice 'Preserving verified tenant ownership policy "%" on public.% (cmd=%, roles=%)',
          pol.policyname, v_table, pol.cmd, pol.role_list;
      elsif v_classification = 'UNSAFE_OPEN_WILDCARD' then
        raise notice 'Dropping unambiguously open wildcard policy "%" on public.% (cmd=%, roles=%, qual=[%], with_check=[%])',
          pol.policyname, v_table, pol.cmd, pol.role_list, pol.qual_expr, pol.check_expr;
        execute format('drop policy %I on public.%I', pol.policyname, v_table);
      else
        -- Preserve unclassified permissive policy, record it, and fail closed before commit
        raise warning 'Preserving UNCLASSIFIED permissive policy "%" on public.% (cmd=%, roles=%, qual=[%], with_check=[%])',
          pol.policyname, v_table, pol.cmd, pol.role_list, pol.qual_expr, pol.check_expr;
        v_unclassified_list := v_unclassified_list || format(
          E'\n  - public.%s | policy="%s" | cmd=%s | roles=%s | qual=[%s] | with_check=[%s]',
          v_table, pol.policyname, pol.cmd, pol.role_list::text, pol.qual_expr, pol.check_expr
        );
      end if;
    end loop;

    -- (e) Verify SELECT, INSERT, UPDATE, and DELETE independently for authenticated
    --     using strict ownership equality checks on USING and WITH CHECK.
    select
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'SELECT')
          and regexp_replace(lower(coalesce(p.qual, '')), '\s+', '', 'g') ~ v_owner_re
      ),
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'INSERT')
          and (
            (p.cmd = 'INSERT'
              and regexp_replace(lower(coalesce(p.with_check, '')), '\s+', '', 'g') ~ v_owner_re)
            or (p.cmd = 'ALL'
              and regexp_replace(lower(coalesce(nullif(p.with_check, ''), p.qual, '')), '\s+', '', 'g') ~ v_owner_re)
          )
      ),
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'UPDATE')
          and regexp_replace(lower(coalesce(p.qual, '')), '\s+', '', 'g') ~ v_owner_re
          and regexp_replace(lower(coalesce(nullif(p.with_check, ''), p.qual, '')), '\s+', '', 'g') ~ v_owner_re
      ),
      exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = v_table
          and p.permissive = 'PERMISSIVE'
          and ('authenticated' = any(p.roles::text[]) or 'public' = any(p.roles::text[]))
          and p.cmd in ('ALL', 'DELETE')
          and regexp_replace(lower(coalesce(p.qual, '')), '\s+', '', 'g') ~ v_owner_re
      )
    into v_has_select, v_has_insert, v_has_update, v_has_delete;

    -- Create only missing per-command policies so existing valid command policies remain untouched
    if not v_has_select then
      v_policy_name := format('Shopkeepers select own %s', replace(v_table, '_', ' '));
      execute format(
        'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id and user_id is not null)',
        v_policy_name, v_table
      );
      raise notice 'Created SELECT tenant policy "%" on public.%', v_policy_name, v_table;
    end if;

    if not v_has_insert then
      v_policy_name := format('Shopkeepers insert own %s', replace(v_table, '_', ' '));
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id and user_id is not null)',
        v_policy_name, v_table
      );
      raise notice 'Created INSERT tenant policy "%" on public.%', v_policy_name, v_table;
    end if;

    if not v_has_update then
      v_policy_name := format('Shopkeepers update own %s', replace(v_table, '_', ' '));
      execute format(
        'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id and user_id is not null) with check (auth.uid() = user_id and user_id is not null)',
        v_policy_name, v_table
      );
      raise notice 'Created UPDATE tenant policy "%" on public.%', v_policy_name, v_table;
    end if;

    if not v_has_delete then
      v_policy_name := format('Shopkeepers delete own %s', replace(v_table, '_', ' '));
      execute format(
        'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id and user_id is not null)',
        v_policy_name, v_table
      );
      raise notice 'Created DELETE tenant policy "%" on public.%', v_policy_name, v_table;
    end if;
  end loop;

  -- Fail closed before commit if any unclassified PERMISSIVE policy was found
  if v_unclassified_list <> '' then
    raise exception
      'Aborting migration safely (all changes rolled back): unclassified PERMISSIVE RLS policies remain and could bypass tenant isolation via OR combination:%',
      v_unclassified_list;
  end if;
end $$;

commit;
