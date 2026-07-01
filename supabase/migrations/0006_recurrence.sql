-- =========================================================
-- Horario recurrente (p. ej. "Trabajo"): días de la semana y
-- hora de inicio/fin que se repiten, contando como una sola tarea.
-- =========================================================

alter table items
  add column if not exists recurrence_days int[] not null default '{}', -- 1=lunes ... 7=domingo
  add column if not exists recurrence_start_time text, -- "HH:mm"
  add column if not exists recurrence_end_time text; -- "HH:mm"
