-- Books table
create table if not exists public.books (
  id text primary key,
  title text not null,
  storage_path text not null,
  cover_url text,
  created_at timestamptz default now()
);

-- Entitlements table
create table if not exists public.entitlements (
  user_id uuid references auth.users(id) on delete cascade,
  book_id text references public.books(id) on delete cascade,
  active boolean default true,
  updated_at timestamptz default now(),
  primary key (user_id, book_id)
);

-- Optional view for quick listing
create or replace view public.v_entitlements as
select e.user_id, e.book_id, e.active, e.updated_at, b.title, b.cover_url, b.storage_path
from entitlements e
join books b on b.id = e.book_id;

-- Allow authenticated users to read books list and their own entitlements
alter table public.books enable row level security;
alter table public.entitlements enable row level security;

create policy "Public can read books list" on public.books
  for select using (true);

create policy "Users read own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);

create policy "Admins manage entitlements" on public.entitlements
  for all using (auth.role() = 'service_role');
