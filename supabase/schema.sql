-- Khaas Retail POS — Supabase PostgreSQL Schema, Storage Bucket & Row Level Security
-- Run this SQL in your Supabase Project -> SQL Editor

create extension if not exists "pgcrypto";

-- Ensure API roles can access the public schema
grant usage on schema public to anon, authenticated, service_role;

-- 1. Products Table (scoped per shopkeeper user_id)
create table if not exists public.products (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  barcode text not null,
  name_en text not null,
  name_ur text not null,
  category text not null check (category in ('beverages', 'bakery', 'pantry')),
  price numeric not null check (price >= 0),
  cost_price numeric not null default 0 check (cost_price >= 0),
  tax_rate numeric not null default 0 check (tax_rate >= 0),
  selling_unit text not null default 'piece' check (selling_unit in ('kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle')),
  stock numeric(12,3) not null default 0 check (stock >= 0),
  image_url text not null default '',
  created_at timestamptz not null default now()
);

-- Safe migrations if products table already existed from an earlier version
alter table public.products add column if not exists cost_price numeric not null default 0;
alter table public.products add column if not exists tax_rate numeric not null default 0;
alter table public.products add column if not exists selling_unit text not null default 'piece';
alter table public.products add column if not exists image_url text not null default '';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'cost'
  ) then
    alter table public.products alter column cost drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'image'
  ) then
    alter table public.products alter column image drop not null;
  end if;
end $$;

create index if not exists idx_products_user_id on public.products(user_id);

grant select, insert, update, delete on table public.products to authenticated;
grant all privileges on table public.products to service_role;

alter table public.products enable row level security;

drop policy if exists "Shopkeepers manage own products" on public.products;
create policy "Shopkeepers manage own products"
  on public.products
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Storage Bucket for Product Photos ('product-images')
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

drop policy if exists "Authenticated users upload own product images" on storage.objects;
create policy "Authenticated users upload own product images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Authenticated users update own product images" on storage.objects;
create policy "Authenticated users update own product images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Authenticated users delete own product images" on storage.objects;
create policy "Authenticated users delete own product images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Sales / Orders Table (scoped per shopkeeper user_id)
create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_number text not null,
  created_at timestamptz not null default now(),
  customer_name text not null default '',
  udhaar_customer_id text,
  payment_method text not null check (payment_method in ('cash', 'card', 'mobile', 'jazzcash', 'easypaisa', 'udhaar')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  amount_tendered numeric not null default 0,
  change_due numeric not null default 0,
  return_status text not null default 'completed',
  refunded_amount numeric not null default 0,
  returned_at timestamptz,
  return_note text not null default ''
);

alter table public.orders add column if not exists return_status text not null default 'completed';
alter table public.orders add column if not exists refunded_amount numeric not null default 0;
alter table public.orders add column if not exists returned_at timestamptz;
alter table public.orders add column if not exists return_note text not null default '';
alter table public.orders add column if not exists transaction_id text not null default '';

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'card', 'mobile', 'jazzcash', 'easypaisa', 'udhaar'));

create index if not exists idx_orders_user_id on public.orders(user_id);

grant select, insert, update, delete on table public.orders to authenticated;
grant all privileges on table public.orders to service_role;

alter table public.orders enable row level security;

drop policy if exists "Shopkeepers manage own orders" on public.orders;
create policy "Shopkeepers manage own orders"
  on public.orders
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Udhaar / Khata Customers Table (scoped per shopkeeper user_id)
create table if not exists public.udhaar_customers (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_udhaar_customers_user_id on public.udhaar_customers(user_id);

grant select, insert, update, delete on table public.udhaar_customers to authenticated;
grant all privileges on table public.udhaar_customers to service_role;

alter table public.udhaar_customers enable row level security;

drop policy if exists "Shopkeepers manage own udhaar customers" on public.udhaar_customers;
create policy "Shopkeepers manage own udhaar customers"
  on public.udhaar_customers
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Udhaar / Khata Ledger Entries Table (scoped per shopkeeper user_id)
create table if not exists public.udhaar_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null references public.udhaar_customers(id) on delete cascade,
  type text not null check (type in ('credit', 'payment')),
  amount numeric not null check (amount > 0),
  note text not null default '',
  receipt_number text,
  created_at timestamptz not null default now()
);

create index if not exists idx_udhaar_entries_user_id on public.udhaar_entries(user_id);
create index if not exists idx_udhaar_entries_customer_id on public.udhaar_entries(customer_id);

grant select, insert, update, delete on table public.udhaar_entries to authenticated;
grant all privileges on table public.udhaar_entries to service_role;

alter table public.udhaar_entries enable row level security;

drop policy if exists "Shopkeepers manage own udhaar entries" on public.udhaar_entries;
create policy "Shopkeepers manage own udhaar entries"
  on public.udhaar_entries
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Vendors / Suppliers Table (Phase 2)
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text not null default '',
  phone text not null default '',
  address text not null default '',
  balance numeric not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_vendors_user_id on public.vendors(user_id);

grant select, insert, update, delete on table public.vendors to authenticated;
grant all privileges on table public.vendors to service_role;

alter table public.vendors enable row level security;

drop policy if exists "Shopkeepers manage own vendors" on public.vendors;
create policy "Shopkeepers manage own vendors"
  on public.vendors
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 7. Purchases Table (Phase 2)
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  vendor_name text not null default '',
  invoice_number text not null default '',
  total_amount numeric not null default 0 check (total_amount >= 0),
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  balance_due numeric not null default 0 check (balance_due >= 0),
  status text not null default 'received',
  note text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Safe additive columns if purchases existed with core schema
alter table public.purchases add column if not exists vendor_name text not null default '';
alter table public.purchases add column if not exists balance_due numeric not null default 0;
alter table public.purchases add column if not exists status text not null default 'received';
alter table public.purchases add column if not exists note text not null default '';
alter table public.purchases add column if not exists notes text not null default '';

create index if not exists idx_purchases_user_id on public.purchases(user_id);
create index if not exists idx_purchases_vendor_id on public.purchases(vendor_id);

grant select, insert, update, delete on table public.purchases to authenticated;
grant all privileges on table public.purchases to service_role;

alter table public.purchases enable row level security;

drop policy if exists "Shopkeepers manage own purchases" on public.purchases;
create policy "Shopkeepers manage own purchases"
  on public.purchases
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 8. Purchase Line Items Table (Phase 2)
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id text not null,
  product_name text not null default '',
  sku text not null default '',
  selling_unit text not null default 'piece' check (selling_unit in ('kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  cost_price numeric not null default 0 check (cost_price >= 0),
  line_total numeric not null default 0 check (line_total >= 0)
);

-- Safe additive columns & RLS backfill if purchase_items existed with core schema
alter table public.purchase_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.purchase_items add column if not exists product_name text not null default '';
alter table public.purchase_items add column if not exists sku text not null default '';
alter table public.purchase_items add column if not exists selling_unit text not null default 'piece';
alter table public.purchase_items add column if not exists unit_cost numeric not null default 0;
alter table public.purchase_items add column if not exists cost_price numeric not null default 0;
alter table public.purchase_items add column if not exists line_total numeric not null default 0;

update public.purchase_items pi
set user_id = p.user_id
from public.purchases p
where pi.purchase_id = p.id
  and pi.user_id is null;

create index if not exists idx_purchase_items_user_id on public.purchase_items(user_id);
create index if not exists idx_purchase_items_purchase_id on public.purchase_items(purchase_id);

grant select, insert, update, delete on table public.purchase_items to authenticated;
grant all privileges on table public.purchase_items to service_role;

alter table public.purchase_items enable row level security;

drop policy if exists "Shopkeepers manage own purchase items" on public.purchase_items;
create policy "Shopkeepers manage own purchase items"
  on public.purchase_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 9. Inventory Adjustments Table (Phase 2)
create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_name text not null default '',
  sku text not null default '',
  selling_unit text not null default 'piece' check (selling_unit in ('kg', 'g', 'litre', 'ml', 'metre', 'cm', 'piece', 'packet', 'box', 'bottle')),
  adjustment_type text not null check (adjustment_type in ('Damaged', 'Expired', 'Lost/Theft', 'Stock Count Correction')),
  quantity_change numeric(12,3) not null,
  previous_stock numeric(12,3) not null default 0,
  new_stock numeric(12,3) not null default 0,
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- Safe additive columns if inventory_adjustments existed with core schema
alter table public.inventory_adjustments add column if not exists product_name text not null default '';
alter table public.inventory_adjustments add column if not exists sku text not null default '';
alter table public.inventory_adjustments add column if not exists selling_unit text not null default 'piece';
alter table public.inventory_adjustments add column if not exists previous_stock numeric(12,3) not null default 0;
alter table public.inventory_adjustments add column if not exists new_stock numeric(12,3) not null default 0;

create index if not exists idx_inventory_adjustments_user_id on public.inventory_adjustments(user_id);
create index if not exists idx_inventory_adjustments_product_id on public.inventory_adjustments(product_id);

grant select, insert, update, delete on table public.inventory_adjustments to authenticated;
grant all privileges on table public.inventory_adjustments to service_role;

alter table public.inventory_adjustments enable row level security;

drop policy if exists "Shopkeepers manage own inventory adjustments" on public.inventory_adjustments;
create policy "Shopkeepers manage own inventory adjustments"
  on public.inventory_adjustments
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 10. Link Orders/Sales to Customers (Phase 3)
alter table public.orders add column if not exists customer_id text;
create index if not exists idx_orders_customer_id on public.orders(customer_id);

-- 11. Customers Table (Phase 3)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  address text not null default '',
  balance numeric not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_user_id on public.customers(user_id);

grant select, insert, update, delete on table public.customers to authenticated;
grant all privileges on table public.customers to service_role;

alter table public.customers enable row level security;

drop policy if exists "Shopkeepers manage own customers" on public.customers;
create policy "Shopkeepers manage own customers"
  on public.customers
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 12. Employees / Staff & Permissions Table (Phase 3)
create table if not exists public.employees (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  role text not null check (role in ('admin', 'manager', 'cashier')),
  pin_code text not null default '****',
  pin_hash text,
  pin_updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_employees_user_id on public.employees(user_id);

grant select, insert, update, delete on table public.employees to authenticated;
grant all privileges on table public.employees to service_role;

alter table public.employees enable row level security;

drop policy if exists "Shopkeepers manage own employees" on public.employees;
create policy "Shopkeepers manage own employees"
  on public.employees
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 13. Store Settings Table (Phase 3)
create table if not exists public.store_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_name text not null default 'Khaas Retail',
  phone text not null default '+92 42 3578 9021',
  address text not null default 'Plot 14-B, Gulberg III, Lahore',
  tax_number text not null default 'STRN: 32-08-9410-221-4',
  receipt_footer text not null default 'Thank you for shopping at Khaas Retail!',
  jazzcash_account_title text not null default '',
  jazzcash_account_number text not null default '',
  easypaisa_account_title text not null default '',
  easypaisa_account_number text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.store_settings add column if not exists jazzcash_account_title text not null default '';
alter table public.store_settings add column if not exists jazzcash_account_number text not null default '';
alter table public.store_settings add column if not exists easypaisa_account_title text not null default '';
alter table public.store_settings add column if not exists easypaisa_account_number text not null default '';

grant select, insert, update, delete on table public.store_settings to authenticated;
grant all privileges on table public.store_settings to service_role;

alter table public.store_settings enable row level security;

drop policy if exists "Shopkeepers manage own store settings" on public.store_settings;
create policy "Shopkeepers manage own store settings"
  on public.store_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 14. Udhaar Customers WhatsApp Phone & Scheduled Reminder Columns
alter table public.udhaar_customers add column if not exists customer_phone text not null default '';
alter table public.udhaar_customers add column if not exists reminder_schedule text not null default 'none';
alter table public.udhaar_customers add column if not exists due_date date;

-- 15. Daily Shop Expenses Table
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'Other',
  amount numeric not null check (amount >= 0),
  notes text not null default '',
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_date on public.expenses(expense_date);

grant select, insert, update, delete on table public.expenses to authenticated;
grant all privileges on table public.expenses to service_role;

alter table public.expenses enable row level security;

drop policy if exists "Shopkeepers manage own expenses" on public.expenses;
create policy "Shopkeepers manage own expenses"
  on public.expenses
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 16. SaaS Subscriptions & Trial Lock Table
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  shop_name text not null default '',
  plan_name text not null default '30-Day Free Trial',
  expires_at timestamptz not null default (now() + interval '30 days'),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists shop_name text not null default '';
alter table public.subscriptions add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_subscriptions_email on public.subscriptions(email);

grant select, insert, update, delete on table public.subscriptions to authenticated;
grant all privileges on table public.subscriptions to service_role;

alter table public.subscriptions enable row level security;

-- 17. Explicit Super Admin Role Table & Subscriptions RLS (replaces prefix matching)
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
where lower(email) = 'bc260436573@vu.edu.pk'
on conflict (user_id) do update set email = excluded.email;

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
  with check ((auth.uid() = user_id and is_blocked = false) or public.is_super_admin());

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


