alter table public.menu_admin_profiles
  add column if not exists nome text;

update public.menu_admin_profiles
set nome = case
  when lower(username) = 'admin' then 'Administrador'
  else username
end
where nullif(trim(nome), '') is null;

alter table public.menu_admin_profiles
  alter column nome set not null;

