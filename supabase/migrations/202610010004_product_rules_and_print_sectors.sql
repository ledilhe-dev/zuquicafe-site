alter table public.menu_references
  add column if not exists print_sector_id integer;

alter table public.menu_products
  add column if not exists default_observation text,
  add column if not exists observation_required boolean not null default false,
  add column if not exists min_quantity integer not null default 1,
  add column if not exists max_quantity integer not null default 99;

alter table public.menu_products
  drop constraint if exists menu_products_quantity_range;

alter table public.menu_products
  add constraint menu_products_quantity_range
  check (min_quantity >= 1 and max_quantity >= min_quantity and max_quantity <= 999);

alter table public.menu_products
  drop constraint if exists menu_products_default_observation_length;

alter table public.menu_products
  add constraint menu_products_default_observation_length
  check (default_observation is null or char_length(default_observation) <= 200);

comment on column public.menu_references.print_sector_id is 'ID numérico do setor de impressão Raffinato usado pelos pedidos desta mesa.';
comment on column public.menu_products.default_observation is 'Texto inicial da observação individual do produto.';
comment on column public.menu_products.observation_required is 'Exige confirmação/preenchimento da observação antes do envio.';
comment on column public.menu_products.min_quantity is 'Quantidade mínima ao adicionar este produto.';
comment on column public.menu_products.max_quantity is 'Quantidade máxima permitida deste produto no pedido.';
