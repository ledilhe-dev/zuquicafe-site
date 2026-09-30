alter table menu_categories add column if not exists display_name text;
alter table menu_categories add column if not exists description text not null default '';
alter table menu_products add column if not exists display_name text;

comment on column menu_categories.display_name is 'Nome editorial exibido no cardapio e preservado nas sincronizacoes.';
comment on column menu_categories.description is 'Descricao editorial do grupo e preservada nas sincronizacoes.';
comment on column menu_products.display_name is 'Nome editorial exibido ao cliente e preservado nas sincronizacoes.';
