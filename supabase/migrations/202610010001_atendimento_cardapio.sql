create table if not exists public.menu_service_requests (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.menu_cards(id),
  card_label text not null,
  reference_id uuid references public.menu_references(id),
  reference_name text,
  request_type text not null check (request_type in ('Atendimento', 'Fechar conta', 'Dúvida no pedido')),
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create index if not exists menu_service_requests_open_idx
  on public.menu_service_requests(status, created_at desc);
create index if not exists menu_service_requests_card_idx
  on public.menu_service_requests(card_id, created_at desc);

alter table public.menu_service_requests enable row level security;
revoke all on public.menu_service_requests from anon, authenticated;

comment on table public.menu_service_requests is
  'Chamados do cardápio digital. Não aciona impressão do Raffinato; a equipe acompanha pela fila administrativa.';
