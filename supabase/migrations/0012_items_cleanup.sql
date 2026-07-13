-- Limpieza de items: elimina columnas que se movieron a otras tablas
-- IMPORTANTE: ejecutar DESPUÉS de 0011 (que migra los datos primero)

ALTER TABLE items
  DROP COLUMN IF EXISTS cached_recommendation,
  DROP COLUMN IF EXISTS due_date;

-- Encriptación de description y location:
-- Los campos permanecen como text en la BD.
-- A partir de aquí la app escribe valores encriptados (AES-256-GCM).
-- No se requiere cambio de tipo en PostgreSQL.
-- Agregar ENCRYPTION_KEY en .env.local y Vercel antes de desplegar el código.

-- Índice de apoyo para filtros por categories (útil con el array)
CREATE INDEX IF NOT EXISTS items_categories_idx ON items USING GIN (categories);
