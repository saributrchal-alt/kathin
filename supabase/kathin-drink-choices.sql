begin;
alter table public.kathin_drink_menu add column if not exists preparations text[];
alter table public.kathin_drink_orders add column if not exists preparation text;

create or replace function public.place_kathin_drink_choice(
  p_actor_id text, p_member_id text, p_menu_id text, p_service_day date, p_preparation text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_menu public.kathin_drink_menu%rowtype; v_result jsonb;
begin
  select * into v_menu from public.kathin_drink_menu where id=p_menu_id and active for share;
  if v_menu.id is null then raise exception 'INVALID_MENU'; end if;
  if p_preparation is null or p_preparation not in ('hot','iced','blended')
    or not (p_preparation = any(coalesce(v_menu.preparations,
      case when v_menu.category='blended' then array['blended'] else array['hot'] end)))
    then raise exception 'INVALID_PREPARATION'; end if;
  v_result := public.place_kathin_drink_order(p_actor_id,p_member_id,p_menu_id,p_service_day);
  update public.kathin_drink_orders set preparation=p_preparation where id=(v_result->>'id')::bigint;
  return v_result || jsonb_build_object('preparation',p_preparation);
end $$;
revoke all on function public.place_kathin_drink_choice(text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.place_kathin_drink_choice(text,text,text,date,text) to service_role;
commit;
