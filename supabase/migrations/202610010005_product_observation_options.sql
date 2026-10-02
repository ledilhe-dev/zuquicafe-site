alter table public.menu_products
  add column if not exists observation_options jsonb not null default '[]'::jsonb;

alter table public.menu_products
  drop constraint if exists menu_products_observation_options_array;

alter table public.menu_products
  add constraint menu_products_observation_options_array
  check (jsonb_typeof(observation_options) = 'array' and jsonb_array_length(observation_options) <= 20);

comment on column public.menu_products.observation_options is
  'Opções de escolha exibidas ao cliente e enviadas como observação individual do item.';
