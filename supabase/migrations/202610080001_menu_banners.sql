create table if not exists public.menu_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  alt_text text not null default '',
  image_url text not null,
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.menu_banners enable row level security;
revoke all on public.menu_banners from anon, authenticated;
create index if not exists menu_banners_order_idx on public.menu_banners(available, sort_order, created_at);
