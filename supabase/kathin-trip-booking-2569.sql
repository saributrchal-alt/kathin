-- Seat booking for the 7 November 2026 Kathin host excursion.
-- All records are accessed through the authenticated Kathin server endpoint only.

create table if not exists public.kathin_trip_vans (
  id uuid primary key default gen_random_uuid(),
  van_number integer not null unique check (van_number >= 1),
  seat_count integer not null default 13 check (seat_count between 1 and 13),
  active boolean not null default true,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.kathin_trip_member_details (
  member_id uuid primary key references public.members(id) on delete cascade,
  phone text not null check (phone ~ '^[+0-9() -]{8,20}$'),
  passport_status text not null check (passport_status in ('yes', 'no')),
  updated_at timestamptz not null default now()
);

create table if not exists public.kathin_trip_bookings (
  id uuid primary key default gen_random_uuid(),
  event_key text not null default 'kathin-2569-trip-2026-11-07'
    check (event_key = 'kathin-2569-trip-2026-11-07'),
  member_id uuid not null references public.members(id) on delete cascade,
  van_id uuid not null references public.kathin_trip_vans(id) on delete restrict,
  seat_number integer not null check (seat_number between 1 and 13),
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.members(id) on delete set null
);

-- A booked seat can belong to only one active reservation. Cancelled seats can be rebooked.
create unique index if not exists kathin_trip_one_active_booking_per_seat
  on public.kathin_trip_bookings (van_id, seat_number)
  where status = 'booked';

create index if not exists kathin_trip_bookings_member_status_idx
  on public.kathin_trip_bookings (member_id, status, created_at desc);

alter table public.kathin_trip_vans enable row level security;
alter table public.kathin_trip_member_details enable row level security;
alter table public.kathin_trip_bookings enable row level security;

-- Do not expose trip profiles or booking details to browser-side roles.
revoke all on table public.kathin_trip_vans from public, anon, authenticated;
revoke all on table public.kathin_trip_member_details from public, anon, authenticated;
revoke all on table public.kathin_trip_bookings from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.kathin_trip_vans to service_role;
grant select, insert, update, delete on table public.kathin_trip_member_details to service_role;
grant select, insert, update, delete on table public.kathin_trip_bookings to service_role;

insert into public.kathin_trip_vans (van_number, seat_count, active)
values (1, 13, true), (2, 13, true), (3, 13, true)
on conflict (van_number) do nothing;
