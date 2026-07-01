-- =========================================================
-- Campos adicionales de la base de datos de Notion en items
-- =========================================================

alter table items
  add column if not exists due_date timestamptz,
  add column if not exists priority text check (priority in ('alta', 'media', 'baja')),
  add column if not exists effort text check (effort in ('pequeno', 'media', 'grande')),
  add column if not exists task_status text check (task_status in ('sin_empezar', 'en_curso', 'listo')) default 'sin_empezar',
  add column if not exists categories text[] not null default '{}',
  add column if not exists outfit_suggestion text;
