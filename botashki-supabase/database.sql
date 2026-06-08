-- database.sql
-- Вставь весь файл в Supabase → SQL Editor → New query → Run.

-- 1) Таблица профилей пользователей
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  selected_year int default 2026,
  theme text default 'light' check (theme in ('light', 'dark')),
  accent_color text default 'blue',
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Пожелания пользователей админу
create table if not exists public.suggestions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  message text not null,
  status text default 'new' check (status in ('new', 'read', 'done')),
  created_at timestamptz default now()
);

-- 3) Прогресс по словам
create table if not exists public.user_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course text not null default 'english',
  word_key text not null,
  learned boolean default true,
  updated_at timestamptz default now(),
  unique(user_id, course, word_key)
);

-- 4) Автоматически создать profile после регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 5) Функция: проверить, админ ли текущий пользователь
create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

-- 6) RLS включить
alter table public.profiles enable row level security;
alter table public.suggestions enable row level security;
alter table public.user_progress enable row level security;

-- 7) Policies для profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_current_user_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- 8) Policies для suggestions
drop policy if exists "suggestions_insert_own" on public.suggestions;
create policy "suggestions_insert_own"
on public.suggestions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "suggestions_select_own_or_admin" on public.suggestions;
create policy "suggestions_select_own_or_admin"
on public.suggestions
for select
to authenticated
using (user_id = auth.uid() or public.is_current_user_admin());

drop policy if exists "suggestions_update_admin" on public.suggestions;
create policy "suggestions_update_admin"
on public.suggestions
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

-- 9) Policies для user_progress
drop policy if exists "progress_select_own" on public.user_progress;
create policy "progress_select_own"
on public.user_progress
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "progress_insert_own" on public.user_progress;
create policy "progress_insert_own"
on public.user_progress
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "progress_update_own" on public.user_progress;
create policy "progress_update_own"
on public.user_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 10) После того как ты зарегистрируешься на сайте, сделай себя админом:
-- Замени email на свой, потом запусти только эту строку.
-- update public.profiles set is_admin = true where email = 'mahagim.bet.box@gmail.com';
