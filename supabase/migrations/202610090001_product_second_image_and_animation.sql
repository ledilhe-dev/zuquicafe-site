alter table public.menu_products
  add column if not exists additional_image_url text,
  add column if not exists animate_images boolean not null default false;

comment on column public.menu_products.image_url is
  'Imagem principal do produto, sempre exibida primeiro.';
comment on column public.menu_products.additional_image_url is
  'Segunda imagem opcional do produto.';
comment on column public.menu_products.animate_images is
  'Alterna suavemente entre a imagem principal e a adicional no cardápio.';
