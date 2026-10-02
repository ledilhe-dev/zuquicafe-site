insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-product-images',
  'menu-product-images',
  true,
  3145728,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
