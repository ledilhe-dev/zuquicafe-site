alter table menu_cards add column if not exists rfid_code text;

update menu_orders
set status='success',
    idvenda=response_payload #>> '{result,0,idvenda}',
    numeropedido=response_payload #>> '{result,0,numeropedido}',
    error_message=null
where status='failed'
  and response_payload #>> '{result,0,gravado}' = 'true';
