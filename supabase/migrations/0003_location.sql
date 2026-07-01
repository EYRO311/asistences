-- =========================================================
-- Ubicación: dirección por defecto del usuario y por tarea
-- =========================================================

alter table profiles
  add column if not exists location text;

alter table items
  add column if not exists location text;
