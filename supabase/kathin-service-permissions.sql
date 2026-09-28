begin;
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.kathin_drink_event,
  public.kathin_drink_menu,
  public.kathin_drink_staff,
  public.kathin_drink_rights,
  public.kathin_drink_orders,
  public.kathin_drink_counters
to service_role;
grant usage, select on sequence
  public.kathin_drink_rights_id_seq,
  public.kathin_drink_orders_id_seq
to service_role;
commit;
