-- Kathin drink queue board: opt-in public identity, ready pickup state and reversible hiding.
-- Safe additive changes; existing orders and the legacy Staff workflow remain intact.
begin;

alter table public.kathin_drink_orders
  add column if not exists ready_at timestamptz,
  add column if not exists ready_by text,
  add column if not exists display_hidden_at timestamptz,
  add column if not exists display_hidden_by text,
  add column if not exists display_consent boolean not null default false;

alter table public.kathin_drink_orders
  drop constraint if exists kathin_drink_orders_status_check;
alter table public.kathin_drink_orders
  add constraint kathin_drink_orders_status_check
  check (status in ('pending','accepted','ready','sent','cancelled'));

create index if not exists kathin_drink_orders_board_idx
  on public.kathin_drink_orders(event_key,service_day,status,queue_seq);

-- Invoked ONLY by the Kathin API using its service role after it verifies Staff/Admin.
-- Serialize transitions per service day; avoid multiple operators promoting the same queue.
create or replace function public.kathin_drink_board_action(
  p_order_id bigint,
  p_action text,
  p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.kathin_drink_orders%rowtype;
  v_date date;
  v_next_id bigint;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null or length(trim(p_actor_id)) = 0 then
    raise exception 'FORBIDDEN';
  end if;

  select service_day into v_date
  from public.kathin_drink_orders
  where id = p_order_id and event_key = 'kathin-2569';
  if v_date is null then raise exception 'QUEUE_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('kathin-drink-board'), hashtext(v_date::text));

  select * into v_order
  from public.kathin_drink_orders
  where id = p_order_id and event_key = 'kathin-2569'
  for update;
  if not found then raise exception 'QUEUE_NOT_FOUND'; end if;

  if p_action = 'accept' and v_order.status = 'pending' then
    update public.kathin_drink_orders
    set status = 'accepted', accepted_at = v_now, accepted_by = p_actor_id
    where id = p_order_id;

  elsif p_action = 'ready' and v_order.status = 'accepted' then
    update public.kathin_drink_orders
    set status = 'ready', ready_at = v_now, ready_by = p_actor_id,
        display_hidden_at = null, display_hidden_by = null
    where id = p_order_id;

    -- Automatically move the next waiting order into preparation if no
    -- other order for this day is currently in preparation.
    if not exists (
      select 1 from public.kathin_drink_orders
      where event_key = 'kathin-2569' and service_day = v_order.service_day
        and status = 'accepted'
    ) then
      select id into v_next_id
      from public.kathin_drink_orders
      where event_key = 'kathin-2569' and service_day = v_order.service_day
        and status = 'pending'
      order by queue_seq asc
      limit 1 for update;

      if v_next_id is not null then
        update public.kathin_drink_orders
        set status = 'accepted', accepted_at = v_now, accepted_by = p_actor_id
        where id = v_next_id;
      end if;
    end if;

  elsif p_action = 'picked' and v_order.status = 'ready' then
    update public.kathin_drink_orders
    set status = 'sent', sent_at = v_now, sent_by = p_actor_id
    where id = p_order_id;

  elsif p_action = 'hide' and v_order.status = 'ready'
      and v_order.display_hidden_at is null then
    update public.kathin_drink_orders
    set display_hidden_at = v_now, display_hidden_by = p_actor_id
    where id = p_order_id;

  elsif p_action = 'show' and v_order.status = 'ready'
      and v_order.display_hidden_at is not null then
    update public.kathin_drink_orders
    set display_hidden_at = null, display_hidden_by = null
    where id = p_order_id;

  else
    raise exception 'QUEUE_STATE_CONFLICT';
  end if;

  return jsonb_build_object(
    'id', p_order_id, 'action', p_action, 'queue_number', v_order.queue_number,
    'promoted_order_id', v_next_id
  );
end;
$$;

revoke all on function public.kathin_drink_board_action(bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.kathin_drink_board_action(bigint,text,text)
  to service_role;

commit;
