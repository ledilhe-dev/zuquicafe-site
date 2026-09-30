alter table menu_orders add column if not exists store_key text;
alter table menu_orders add column if not exists source_branch_id int;
alter table menu_orders add column if not exists receipt_token_hash text;
alter table menu_orders add column if not exists dispatch_started_at timestamptz;

create unique index if not exists menu_orders_receipt_token_hash_uidx
  on menu_orders(receipt_token_hash) where receipt_token_hash is not null;
create index if not exists menu_orders_dispatch_queue_idx
  on menu_orders(store_key,source_branch_id,status,created_at);
