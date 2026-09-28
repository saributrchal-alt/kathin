-- Kathin 2569 free drink ordering. Run once in the temple Supabase SQL editor.
begin;

create table if not exists public.kathin_drink_event (
  event_key text primary key,
  is_open boolean not null default true,
  starts_on date not null default '2026-11-07',
  ends_on date not null default '2026-11-08',
  updated_at timestamptz not null default now()
);
insert into public.kathin_drink_event(event_key) values ('kathin-2569') on conflict do nothing;

create table if not exists public.kathin_drink_menu (
  id text primary key,
  name_th text not null,
  name_en text not null,
  category text not null check(category in ('drip','blended')),
  active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.kathin_drink_menu(id,name_th,name_en,category,sort_order) values
 ('drip-black','กาแฟดริป','Drip coffee','drip',10),
 ('drip-milk','กาแฟดริปนม','Drip milk coffee','drip',20),
 ('thai-tea','ชาไทย','Thai tea','drip',30),
 ('green-tea','ชาเขียวนม','Green milk tea','drip',40),
 ('cocoa','โกโก้','Cocoa','drip',50),
 ('blend-coffee','กาแฟปั่น','Blended coffee','blended',60),
 ('blend-thai-tea','ชาไทยปั่น','Blended Thai tea','blended',70),
 ('blend-cocoa','โกโก้ปั่น','Blended cocoa','blended',80)
on conflict(id) do nothing;

create table if not exists public.kathin_drink_staff (
  member_id text primary key,
  assigned_by text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.kathin_drink_rights (
  id bigint generated always as identity primary key,
  event_key text not null references public.kathin_drink_event(event_key),
  member_id text not null,
  grant_number integer not null,
  source text not null check(source in ('existing_member','new_member','staff')),
  granted_by text,
  created_at timestamptz not null default now(),
  unique(event_key,member_id,grant_number)
);
create table if not exists public.kathin_drink_orders (
  id bigint generated always as identity primary key,
  event_key text not null references public.kathin_drink_event(event_key),
  member_id text not null,
  right_id bigint not null references public.kathin_drink_rights(id),
  menu_id text not null references public.kathin_drink_menu(id),
  service_day date not null check(service_day in ('2026-11-07','2026-11-08')),
  queue_seq integer not null,
  queue_number text not null,
  status text not null default 'pending' check(status in ('pending','accepted','sent','cancelled')),
  created_by text not null,
  accepted_by text,
  sent_by text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  sent_at timestamptz,
  unique(event_key,service_day,queue_seq),
  unique(event_key,queue_number)
);
create table if not exists public.kathin_drink_counters (
  service_day date primary key check(service_day in ('2026-11-07','2026-11-08')),
  last_seq integer not null default 0
);

-- One event right for every existing member; uniqueness makes reruns safe.
insert into public.kathin_drink_rights(event_key,member_id,grant_number,source)
select 'kathin-2569', m.id::text, 1, 'existing_member'
from public.members m
on conflict(event_key,member_id,grant_number) do nothing;

create or replace function public.kathin_drink_new_member_right()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.kathin_drink_rights(event_key,member_id,grant_number,source)
  values('kathin-2569',new.id::text,1,'new_member')
  on conflict(event_key,member_id,grant_number) do nothing;
  return new;
end $$;
drop trigger if exists kathin_drink_new_member_right_trigger on public.members;
create trigger kathin_drink_new_member_right_trigger after insert on public.members
for each row execute function public.kathin_drink_new_member_right();

create or replace function public.place_kathin_drink_order(
  p_actor_id text, p_member_id text, p_menu_id text, p_service_day date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_right public.kathin_drink_rights%rowtype; v_seq integer; v_order public.kathin_drink_orders%rowtype;
begin
  if p_service_day not in (date '2026-11-07',date '2026-11-08') then raise exception 'INVALID_SERVICE_DAY'; end if;
  if p_service_day <> (now() at time zone 'Asia/Bangkok')::date then raise exception 'INVALID_SERVICE_DAY'; end if;
  if p_actor_id is distinct from p_member_id and
     not exists(select 1 from public.members where id::text=p_actor_id and role='admin') and
     not exists(select 1 from public.kathin_drink_staff where member_id=p_actor_id and active) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.kathin_drink_event where event_key='kathin-2569' and is_open) then raise exception 'EVENT_CLOSED'; end if;
  if (now() at time zone 'Asia/Bangkok')::date not between date '2026-11-07' and date '2026-11-08' then raise exception 'EVENT_NOT_ACTIVE'; end if;
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
      v_seq, (case when p_service_day=date '2026-11-07' then '7' else '8' end) || lpad(v_seq::text,3,'0'), p_actor_id)
    returning * into v_order;
  return jsonb_build_object('id',v_order.id,'queue_number',v_order.queue_number,'status',v_order.status);
end $$;
revoke all on function public.place_kathin_drink_order(text,text,text,date) from public,anon,authenticated;
grant execute on function public.place_kathin_drink_order(text,text,text,date) to service_role;

create or replace function public.grant_kathin_drink_right(p_actor_id text, p_member_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_number integer;
begin
  if not exists(select 1 from public.members where id::text=p_member_id) then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not exists(select 1 from public.members where id::text=p_actor_id and role='admin') and
     not exists(select 1 from public.kathin_drink_staff where member_id=p_actor_id and active) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kathin-right:' || p_member_id, 0));
  select coalesce(max(grant_number),0)+1 into v_number from public.kathin_drink_rights
    where event_key='kathin-2569' and member_id=p_member_id;
  insert into public.kathin_drink_rights(event_key,member_id,grant_number,source,granted_by)
    values('kathin-2569',p_member_id,v_number,'staff',p_actor_id);
  return jsonb_build_object('member_id',p_member_id,'grant_number',v_number);
end $$;
revoke all on function public.grant_kathin_drink_right(text,text) from public,anon,authenticated;
grant execute on function public.grant_kathin_drink_right(text,text) to service_role;

alter table public.kathin_drink_event enable row level security;
alter table public.kathin_drink_menu enable row level security;
alter table public.kathin_drink_staff enable row level security;
alter table public.kathin_drink_rights enable row level security;
alter table public.kathin_drink_orders enable row level security;
alter table public.kathin_drink_counters enable row level security;
revoke all on public.kathin_drink_event,public.kathin_drink_menu,public.kathin_drink_staff,
  public.kathin_drink_rights,public.kathin_drink_orders,public.kathin_drink_counters from anon,authenticated;
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
alter table public.kathin_drink_menu
  add column if not exists description text not null default '',
  add column if not exists image_url text;
alter table public.kathin_drink_menu add column if not exists preparations text[];
alter table public.kathin_drink_orders add column if not exists preparation text;

create or replace function public.place_kathin_drink_choice(
  p_actor_id text, p_member_id text, p_menu_id text, p_service_day date, p_preparation text
) returns jsonb language plpgsql security definer set search_path = '' as $
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
end $;
revoke all on function public.place_kathin_drink_choice(text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.place_kathin_drink_choice(text,text,text,date,text) to service_role;
commit;
