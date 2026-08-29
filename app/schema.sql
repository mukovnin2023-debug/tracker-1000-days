-- Схема для публичного мультипользовательского трекера челленджей.
-- Выполнить целиком в Supabase: SQL Editor -> New query -> вставить -> Run.

create extension if not exists pgcrypto;

create table if not exists trackers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal text,
  target_days int not null check (target_days > 0),
  checkbox_label text not null,
  category text not null,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id bigint generated always as identity primary key,
  tracker_id uuid not null references trackers(id) on delete cascade,
  day_number int not null,
  done boolean not null default false,
  plan text,
  note text,
  updated_at timestamptz not null default now(),
  unique (tracker_id, day_number)
);

create table if not exists link_clicks (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('author_open','instagram_click')),
  created_at timestamptz not null default now()
);

-- RLS включена, но политик на прямой доступ к таблицам нет -> anon-ключ
-- не может делать SELECT/INSERT/UPDATE напрямую по таблицам.
-- Весь доступ идёт только через функции ниже (security definer),
-- поэтому нельзя перечислить чужие трекеры, зная только anon key.
alter table trackers enable row level security;
alter table entries enable row level security;
alter table link_clicks enable row level security;

create or replace function create_tracker(
  p_title text, p_goal text, p_target_days int, p_checkbox_label text, p_category text
) returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  insert into trackers (title, goal, target_days, checkbox_label, category)
  values (p_title, p_goal, p_target_days, p_checkbox_label, p_category)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function get_tracker(p_id uuid)
returns trackers
language sql security definer as $$
  select * from trackers where id = p_id;
$$;

create or replace function get_entries(p_tracker_id uuid)
returns setof entries
language sql security definer as $$
  select * from entries where tracker_id = p_tracker_id order by day_number;
$$;

create or replace function upsert_entry(
  p_tracker_id uuid, p_day int, p_done boolean, p_plan text, p_note text
) returns void
language plpgsql security definer as $$
begin
  insert into entries (tracker_id, day_number, done, plan, note, updated_at)
  values (p_tracker_id, p_day, p_done, p_plan, p_note, now())
  on conflict (tracker_id, day_number)
  do update set done = excluded.done, plan = excluded.plan, note = excluded.note, updated_at = now();
end;
$$;

create or replace function log_click(p_event_type text)
returns void
language plpgsql security definer as $$
begin
  if p_event_type not in ('author_open','instagram_click') then
    return;
  end if;
  insert into link_clicks (event_type) values (p_event_type);
end;
$$;

-- Статистика для вас (не для публичного использования, но технически
-- доступна через anon key любому, кто узнает имя функции — это
-- обезличенные агрегаты, без персональных данных):
create or replace function get_category_stats()
returns table(category text, cnt bigint)
language sql security definer as $$
  select category, count(*) as cnt from trackers group by category order by cnt desc;
$$;

create or replace function get_click_stats()
returns table(event_type text, cnt bigint)
language sql security definer as $$
  select event_type, count(*) as cnt from link_clicks group by event_type;
$$;

create or replace function get_total_trackers()
returns bigint
language sql security definer as $$
  select count(*) from trackers;
$$;

grant execute on function create_tracker(text, text, int, text, text) to anon, authenticated;
grant execute on function get_tracker(uuid) to anon, authenticated;
grant execute on function get_entries(uuid) to anon, authenticated;
grant execute on function upsert_entry(uuid, int, boolean, text, text) to anon, authenticated;
grant execute on function log_click(text) to anon, authenticated;
grant execute on function get_category_stats() to anon, authenticated;
grant execute on function get_click_stats() to anon, authenticated;
grant execute on function get_total_trackers() to anon, authenticated;
