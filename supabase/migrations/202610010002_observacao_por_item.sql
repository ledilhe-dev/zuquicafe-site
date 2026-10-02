alter table public.menu_order_items
  add column if not exists observation text;

alter table public.menu_order_items
  drop constraint if exists menu_order_items_observation_length;

alter table public.menu_order_items
  add constraint menu_order_items_observation_length
  check (observation is null or char_length(observation) <= 200);

comment on column public.menu_order_items.observation is
  'Observação individual enviada pelo cliente para este item do pedido.';
