with duplicated_orders as (
  select
    id,
    row_number() over (
      partition by coalesce(store_key, ''), coalesce(source_branch_id, 0), sort_order
      order by digital_enabled desc, created_at, id
    ) as occurrence
  from menu_categories
  where sort_order > 0
)
update menu_categories as category
set sort_order = 0
from duplicated_orders
where category.id = duplicated_orders.id
  and duplicated_orders.occurrence > 1;

create unique index if not exists menu_categories_unique_positive_sort_order
  on menu_categories (
    coalesce(store_key, ''),
    coalesce(source_branch_id, 0),
    sort_order
  )
  where sort_order > 0;
