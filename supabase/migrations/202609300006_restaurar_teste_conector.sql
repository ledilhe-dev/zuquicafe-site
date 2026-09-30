update menu_catalog_connectors connector
set connection_tested_at = coalesce(
  connector.connection_tested_at,
  (
    select max(coalesce(run.finished_at, run.started_at))
    from menu_catalog_sync_runs run
    where run.store_key = connector.store_key
      and run.status = 'success'
  )
)
where connector.active = true
  and connector.store_id is not null;
