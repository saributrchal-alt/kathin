-- Open real drink orders from 29 September 2026 (Bangkok time).
-- Existing orders and drink rights are preserved. Run in Supabase SQL Editor.
begin;
update public.kathin_drink_event
set starts_on = date '2026-09-29', is_open = true, updated_at = now()
where event_key = 'kathin-2569';
alter table public.kathin_drink_orders
  drop constraint if exists kathin_drink_orders_service_day_check;
alter table public.kathin_drink_counters
  drop constraint if exists kathin_drink_counters_service_day_check;

create or replace function public.place_kathin_drink_order(
  p_actor_id text, p_member_id text, p_menu_id text, p_service_day date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_right public.kathin_drink_rights%rowtype; v_seq integer; v_order public.kathin_drink_orders%rowtype;
begin
  if p_service_day is null or p_service_day <> (now() at time zone 'Asia/Bangkok')::date then raise exception 'INVALID_SERVICE_DAY'; end if;
  if p_actor_id is distinct from p_member_id and
     not exists(select 1 from public.members where id::text=p_actor_id and role='admin') and
     not exists(select 1 from public.kathin_drink_staff where member_id=p_actor_id and active) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.kathin_drink_event where event_key='kathin-2569' and is_open) then raise exception 'EVENT_CLOSED'; end if;
  if not exists(select 1 from public.kathin_drink_event where event_key='kathin-2569' and p_service_day between starts_on and ends_on) then raise exception 'EVENT_NOT_ACTIVE'; end if;
  if not exists(select 1 from public.kathin_drink_menu where id=p_menu_id and active) then raise exception 'INVALID_MENU'; end if;
  select * into v_right from public.kathin_drink_rights
    where event_key='kathin-2569' and member_id=p_member_id
      and id not in(select right_id from public.kathin_drink_orders where status <> 'cancelled')
    order by id for update skip locked limit 1;
  if v_right.id is null then raise exception 'NO_DRINK_RIGHT'; end if;
  insert into public.kathin_drink_counters(service_day,last_seq) values(p_service_day,1)
    on conflict(service_day) do update set last_seq=public.kathin_drink_counters.last_seq+1
    returning last_seq into v_seq;
  insert into public.kathin_drink_orders(event_key,member_id,right_id,menu_id,service_day,queue_seq,queue_number,created_by)
    values('kathin-2569',p_member_id,v_right.id,p_menu_id,p_service_day,
      v_seq, (case when p_service_day=date '2026-11-07' then '7' when p_service_day=date '2026-11-08' then '8' else to_char(p_service_day,'YYYYMMDD') || '-' end) || lpad(v_seq::text,greatest(3,length(v_seq::text)),'0'), p_actor_id)
    returning * into v_order;
  return jsonb_build_object('id',v_order.id,'queue_number',v_order.queue_number,'status',v_order.status);
end $$;
revoke all on function public.place_kathin_drink_order(text,text,text,date) from public,anon,authenticated;
grant execute on function public.place_kathin_drink_order(text,text,text,date) to service_role;

commit;
