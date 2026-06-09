-- =====================================================================
-- 25 Pskyn Aesthetic Laser Workshop 2026 — seat ledger
-- Shared pool of 8 seats across ALL tiers. Overselling is impossible
-- because reserve_seat() locks the event row before counting.
-- Run this in the Supabase SQL editor.
-- =====================================================================

create table if not exists workshop_event (
  id          text primary key,
  name        text not null,
  total_seats int  not null,
  created_at  timestamptz default now()
);

insert into workshop_event (id, name, total_seats)
values ('laser-2026', '25 Pskyn Aesthetic Laser Workshop 2026', 8)
on conflict (id) do nothing;

create table if not exists seat_reservations (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null references workshop_event(id),
  reference   text unique not null,
  tier        text not null,
  full_name   text,
  email       text not null,
  phone       text,
  amount_kobo bigint not null,
  status      text not null default 'pending'
              check (status in ('pending','paid','released','expired','overflow')),
  expires_at  timestamptz not null,
  created_at  timestamptz default now(),
  paid_at     timestamptz
);

create index if not exists idx_seat_status  on seat_reservations(event_id, status);
create index if not exists idx_seat_expires on seat_reservations(expires_at);

-- Lock down direct client access. The API uses the service-role key,
-- which bypasses RLS. With RLS on and no policies, the anon/public key
-- can neither read nor write this table.
alter table workshop_event    enable row level security;
alter table seat_reservations enable row level security;

-- ---------------------------------------------------------------------
-- Seats currently taken = paid + still-live pending holds
-- ---------------------------------------------------------------------
create or replace function seats_taken(p_event text)
returns int language sql stable as $$
  select count(*)::int
  from seat_reservations
  where event_id = p_event
    and (status = 'paid' or (status = 'pending' and expires_at > now()));
$$;

-- ---------------------------------------------------------------------
-- Atomically reserve one seat. Returns the reservation id, or NULL if
-- the pool is full. FOR UPDATE on the event row serialises concurrent
-- callers so two buyers can never both grab the last seat.
-- ---------------------------------------------------------------------
create or replace function reserve_seat(
  p_event text, p_reference text, p_tier text,
  p_name text, p_email text, p_phone text,
  p_amount bigint, p_ttl_minutes int
) returns uuid
language plpgsql as $$
declare
  v_total int;
  v_taken int;
  v_id    uuid;
begin
  select total_seats into v_total from workshop_event where id = p_event for update;
  if v_total is null then
    raise exception 'unknown event %', p_event;
  end if;

  select count(*) into v_taken from seat_reservations
  where event_id = p_event
    and (status = 'paid' or (status = 'pending' and expires_at > now()));

  if v_taken >= v_total then
    return null;  -- sold out
  end if;

  insert into seat_reservations(
    event_id, reference, tier, full_name, email, phone, amount_kobo, status, expires_at
  ) values (
    p_event, p_reference, p_tier, p_name, p_email, p_phone, p_amount, 'pending',
    now() + make_interval(mins => p_ttl_minutes)
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Finalise a paid seat. Idempotent (webhook may fire repeatedly) and
-- capacity-guarded: if all 8 are already paid, this seat is flagged
-- 'overflow' for a manual/auto refund rather than seating a 9th person.
-- Returns 'paid' | 'overflow' | 'unknown'.
-- ---------------------------------------------------------------------
create or replace function finalize_seat(p_event text, p_reference text)
returns text
language plpgsql as $$
declare
  v_total int;
  v_paid  int;
  v_cur   text;
begin
  select total_seats into v_total from workshop_event where id = p_event for update;

  select status into v_cur from seat_reservations where reference = p_reference;
  if v_cur is null then return 'unknown'; end if;
  if v_cur = 'paid' then return 'paid'; end if;       -- idempotent
  if v_cur = 'overflow' then return 'overflow'; end if;

  select count(*) into v_paid from seat_reservations
  where event_id = p_event and status = 'paid';

  if v_paid >= v_total then
    update seat_reservations set status = 'overflow', paid_at = now()
    where reference = p_reference;
    return 'overflow';
  end if;

  update seat_reservations set status = 'paid', paid_at = now()
  where reference = p_reference;
  return 'paid';
end;
$$;

-- ---------------------------------------------------------------------
-- Housekeeping: mark expired holds. Optional — seats_taken() already
-- ignores expired holds, so this is only for tidy data / reporting.
-- ---------------------------------------------------------------------
create or replace function release_expired()
returns int language sql as $$
  with upd as (
    update seat_reservations set status = 'expired'
    where status = 'pending' and expires_at <= now()
    returning 1
  ) select count(*)::int from upd;
$$;
