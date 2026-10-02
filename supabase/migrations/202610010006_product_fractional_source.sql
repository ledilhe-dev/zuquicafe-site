alter table public.menu_products
  add column if not exists source_allows_fractional boolean not null default false;

comment on column public.menu_products.source_allows_fractional is
  'Indica se o Raffinato permite venda fracionada para o produto.';
