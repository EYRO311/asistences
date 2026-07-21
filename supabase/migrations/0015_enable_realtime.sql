-- Fase 5 del plan de implementación: habilita Postgres Changes (Realtime)
-- en items/goals/goal_items para que mobile reciba cambios en vivo sin
-- depender de un fetch/sync manual. Las políticas RLS ya existentes en
-- estas tablas siguen aplicando — Supabase Realtime solo entrega a cada
-- cliente las filas que sus políticas RLS le permiten leer.
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE goal_items;
