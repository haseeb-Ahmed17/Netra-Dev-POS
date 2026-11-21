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
  stock integer not null default 0 check (stock >= 0),
  image_url text not null default '',
  created_at timestamptz not null default now()
);

-- Safe migrations if products table already existed from an earlier version
alter table public.products add column if not exists cost_price numeric not null default 0;
alter table public.products add column if not exists tax_rate numeric not null default 0;
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
  payment_method text not null check (payment_method in ('cash', 'card', 'mobile', 'udhaar')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  amount_tendered numeric not null default 0,
  change_due numeric not null default 0
);

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
