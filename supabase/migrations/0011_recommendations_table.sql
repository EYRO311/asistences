-- Separa las recomendaciones en su propia tabla
-- items: 1 recomendación por item (1:1)
-- goals: 1 recomendación compartida por todos los goals del mismo recurrence_type

-- ── Recomendaciones de items ──────────────────────────────────────────────────
CREATE TABLE recommendations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             uuid        UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  outfit_brief        text,        -- solo ropa, sin encriptar, vista rápida en tarjeta
  full_text           text,        -- recomendación completa, sin encriptar
  location_name       text,        -- ubicación resuelta (sin encriptar)
  weather             jsonb,
  travel              jsonb,
  preferred_transport text,
  generated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Recomendaciones de metas (agrupadas por período) ─────────────────────────
-- Una fila por (user_id, recurrence_type): todas las metas del mismo período
-- comparten la misma recomendación
CREATE TABLE goal_recommendations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recurrence_type  text        NOT NULL
                   CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
  outfit_brief     text,
  full_text        text,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recurrence_type)
);

-- RLS
ALTER TABLE recommendations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recommendations_user_policy" ON recommendations
  FOR ALL
  USING  (item_id IN (SELECT id FROM items WHERE user_id = auth.uid()))
  WITH CHECK (item_id IN (SELECT id FROM items WHERE user_id = auth.uid()));

CREATE POLICY "goal_recommendations_user_policy" ON goal_recommendations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX recommendations_item_id_idx           ON recommendations(item_id);
CREATE INDEX goal_recommendations_user_period_idx  ON goal_recommendations(user_id, recurrence_type);

-- ── Migrar datos existentes de cached_recommendation ─────────────────────────
-- Mueve la caché actual de items a la nueva tabla antes de eliminar la columna
INSERT INTO recommendations (
  item_id,
  outfit_brief,
  full_text,
  location_name,
  weather,
  travel,
  preferred_transport
)
SELECT
  id,
  cached_recommendation->>'outfit_suggestion',
  cached_recommendation->>'recommendation',
  cached_recommendation->>'location',
  cached_recommendation->'weather',
  cached_recommendation->'travel',
  cached_recommendation->>'preferredTransport'
FROM items
WHERE cached_recommendation IS NOT NULL
  AND cached_recommendation->>'recommendation' IS NOT NULL;
