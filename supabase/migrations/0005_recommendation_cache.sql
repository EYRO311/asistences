-- =========================================================
-- Cache de la recomendación generada por IA (vestimenta + clima),
-- para no volver a llamar a Gemini/clima en cada apertura del modal.
-- Se invalida (se pone en null) cada vez que se edita la tarea.
-- =========================================================

alter table items
  add column if not exists cached_recommendation jsonb;
