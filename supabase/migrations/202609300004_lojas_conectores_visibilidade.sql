create table if not exists menu_stores(
  id uuid primary key default gen_random_uuid(),
  store_key text unique not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into menu_stores(store_key,name) values('zuqui-filial-1','Zuqui Café') on conflict(store_key) do nothing;

alter table menu_catalog_connectors drop constraint if exists menu_catalog_connectors_store_key_key;
alter table menu_catalog_connectors add column if not exists installation_id uuid unique default gen_random_uuid();
alter table menu_catalog_connectors add column if not exists installation_name text not null default 'Servidor da loja';
alter table menu_catalog_connectors add column if not exists store_id uuid references menu_stores(id);
alter table menu_catalog_connectors add column if not exists raffinato_branch_id int;
alter table menu_catalog_connectors add column if not exists connection_tested_at timestamptz;
alter table menu_catalog_connectors add column if not exists connection_test_error text;
update menu_catalog_connectors c set store_id=s.id from menu_stores s where c.store_id is null and s.store_key=c.store_key;
update menu_catalog_connectors set raffinato_branch_id=1 where raffinato_branch_id is null and store_key='zuqui-filial-1';
create unique index if not exists menu_catalog_one_active_connector_per_store on menu_catalog_connectors(store_id) where active;

alter table menu_categories add column if not exists source_branch_id int;
alter table menu_categories add column if not exists source_tree text;
alter table menu_categories add column if not exists digital_enabled boolean not null default false;
alter table menu_products add column if not exists source_branch_id int;
alter table menu_products add column if not exists cardapio_override boolean;
update menu_categories set source_branch_id=1 where source_branch_id is null and store_key='zuqui-filial-1';
update menu_products set source_branch_id=1 where source_branch_id is null and store_key='zuqui-filial-1';
update menu_products set cardapio_override=true where visible=true and cardapio_override is null;
update menu_categories c set digital_enabled=true where exists(select 1 from menu_products p where p.category_id=c.id and p.cardapio_override=true);
drop index if exists menu_categories_store_raffinato_uidx;
drop index if exists menu_products_store_raffinato_uidx;
create unique index menu_categories_store_branch_raffinato_uidx on menu_categories(store_key,source_branch_id,raffinato_category_id);
create unique index menu_products_store_branch_raffinato_uidx on menu_products(store_key,source_branch_id,raffinato_product_id);

alter table menu_stores enable row level security;
revoke all on menu_stores from anon,authenticated;
