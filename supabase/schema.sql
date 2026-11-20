-- Khaas Retail POS — Supabase PostgreSQL Schema & Row Level Security
-- Run this SQL in your Supabase Project -> SQL Editor

create extension if not exists "pgcrypto";

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
  cost numeric not null default 0 check (cost >= 0),
  stock integer not null default 0 check (stock >= 0),
  image text not null default '',
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Shopkeepers manage own products"
  on public.products
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Sales / Orders Table (scoped per shopkeeper user_id)
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
  tax_rate numeric not null default 0.05,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  amount_tendered numeric not null default 0,
  change_due numeric not null default 0
);

alter table public.orders enable row level security;

create policy "Shopkeepers manage own orders"
  on public.orders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Udhaar / Khata Customers Table (scoped per shopkeeper user_id)
create table if not exists public.udhaar_customers (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.udhaar_customers enable row level security;

create policy "Shopkeepers manage own udhaar customers"
  on public.udhaar_customers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Udhaar / Khata Ledger Entries Table (scoped per shopkeeper user_id)
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

alter table public.udhaar_entries enable row level security;

create policy "Shopkeepers manage own udhaar entries"
  on public.udhaar_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
