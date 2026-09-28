begin;
alter table public.kathin_drink_menu
  add column if not exists description text not null default '',
  add column if not exists image_url text;
commit;
