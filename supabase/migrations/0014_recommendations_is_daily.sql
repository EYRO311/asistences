-- Marca si la recomendación de un item viene de la "recomendación automática"
-- del día (compartida entre todas las tareas de ese día) en vez de haberse
-- generado específicamente para ese item. Sirve para que el detalle de la
-- tarea avise que está viendo la recomendación del día completo antes de
-- que el usuario decida regenerarla (lo que la vuelve a dejar específica).
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS is_daily boolean NOT NULL DEFAULT false;
