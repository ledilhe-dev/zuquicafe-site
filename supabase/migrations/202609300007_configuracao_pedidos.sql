alter table public.menu_settings
  add column if not exists waiter_id integer not null default 20,
  add column if not exists test_idvenda text,
  add column if not exists test_numeropedido text,
  add column if not exists test_validated_at timestamptz;

alter table public.menu_settings
  drop constraint if exists menu_settings_waiter_id_positive;

alter table public.menu_settings
  add constraint menu_settings_waiter_id_positive check (waiter_id > 0);

-- Resultado real confirmado pelo Raffinato no primeiro teste controlado.
update public.menu_settings
set test_validated = true,
    test_idvenda = '174581',
    test_numeropedido = '2777',
    test_validated_at = coalesce(test_validated_at, now())
where id = true;
