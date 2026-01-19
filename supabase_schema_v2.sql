-- [PerfectOrder V2 Schema]

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Clean up old tables if they exist (Reset)
drop table if exists public.order_items;
drop table if exists public.orders;
drop table if exists public.market_accounts;
drop table if exists public.profiles;

-- 3. Profiles (Extends Supabase Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  role text default 'USER', -- USER, ADMIN
  plan text default 'FREE', -- FREE, PRO
  created_at timestamp with time zone default now()
);

-- 4. Market Accounts (Credentials)
create table public.market_accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  market_type text not null, -- COUPANG, NAVER, 11ST, etc.
  account_name text not null,
  
  -- Credentials (Encrypted or raw depending on requirement, storing raw for now as requested)
  vendor_id text,  -- Coupang Vendor ID / Naver Client ID
  access_key text, -- Coupang Access Key / Naver Client Secret
  secret_key text, -- Coupang Secret Key
  
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 5. Orders (Unified)
create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null, -- Optional: allow system orders
  market_account_id uuid references public.market_accounts(id) on delete set null,
  
  -- Market Identifiers
  platform text not null,
  order_number text not null, -- The Market's Order ID
  
  -- Product Info
  product_name text,
  total_amount numeric default 0,
  
  -- Customer / Shipping
  orderer_name text,
  orderer_phone text,
  receiver_name text,
  receiver_phone text,
  receiver_address text,
  
  -- Status
  status text, -- NEW, SHIPPING, DELIVERED, etc.
  ordered_at timestamp with time zone,
  
  -- Meta
  raw_data jsonb, -- Store original JSON for debugging
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Logical Key
  constraint orders_market_unique unique (platform, order_number)
);

-- RLS Policies
alter table profiles enable row level security;
alter table market_accounts enable row level security;
alter table orders enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can view own markets" on market_accounts for all using (auth.uid() = user_id);
create policy "Users can view own orders" on orders for all using (
  auth.uid() = user_id or 
  exists (select 1 from market_accounts where id = orders.market_account_id and user_id = auth.uid())
);
