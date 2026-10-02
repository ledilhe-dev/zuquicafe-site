create table if not exists public.menu_dispatcher_leases (
  store_key text not null,
  source_branch_id bigint not null,
  connector_version text not null,
  last_seen_at timestamptz not null default now(),
  primary key (store_key, source_branch_id)
);

alter table public.menu_dispatcher_leases enable row level security;
revoke all on public.menu_dispatcher_leases from anon, authenticated;
