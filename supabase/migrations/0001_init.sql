-- =========================================================
-- Esquema inicial: perfiles, integraciones OAuth e items
-- =========================================================

-- Perfil de usuario (espejo de auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  timezone text not null default 'America/Mexico_City',
  notion_database_id text,
  created_at timestamptz not null default now()
);

-- Tokens OAuth por proveedor (google / notion)
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'notion')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  workspace_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Tipos de item y estados de la saga
do $$ begin
  create type item_type as enum ('compromiso', 'personal', 'evento');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type item_status as enum ('draft', 'syncing', 'confirmed', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

-- Items: tareas/eventos clasificados
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type item_type not null,
  title text not null,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean not null default false,
  add_to_calendar boolean not null default true,
  status item_status not null default 'draft',
  google_event_id text,
  notion_page_id text,
  notion_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_user_id_idx on items (user_id);
create index if not exists items_start_time_idx on items (start_time);

-- =========================================================
-- Row Level Security: cada usuario solo ve/edita sus filas
-- =========================================================

alter table profiles enable row level security;
alter table integrations enable row level security;
alter table items enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own integrations" on integrations;
create policy "own integrations" on integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own items" on items;
create policy "own items" on items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- Trigger: crear fila en profiles al registrarse un usuario
-- =========================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Trigger: mantener updated_at al día
-- =========================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_items_updated_at on items;
create trigger set_items_updated_at
  before update on items
  for each row execute function public.set_updated_at();

drop trigger if exists set_integrations_updated_at on integrations;
create trigger set_integrations_updated_at
  before update on integrations
  for each row execute function public.set_updated_at();
