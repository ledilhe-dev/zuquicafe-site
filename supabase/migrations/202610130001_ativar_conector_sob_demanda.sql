alter table public.menu_catalog_connectors
  add column if not exists demand_until timestamptz;

comment on column public.menu_catalog_connectors.demand_until is
  'Mantém o despacho de pedidos ativo temporariamente após uso do cardápio.';

