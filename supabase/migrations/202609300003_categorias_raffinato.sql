alter table menu_categories add column if not exists store_key text;
alter table menu_categories add column if not exists raffinato_category_id bigint;
alter table menu_categories add column if not exists source_name text;
alter table menu_categories add column if not exists source_updated_at timestamptz;
create unique index if not exists menu_categories_store_raffinato_uidx on menu_categories(store_key,raffinato_category_id);
