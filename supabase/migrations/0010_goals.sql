-- Tabla de metas (goals)
-- Única tabla con due_date; soporta metas únicas y recurrentes (checklist por período)

CREATE TABLE goals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  description       text,                         -- encriptado a nivel app
  due_date          timestamptz,                  -- solo para metas tipo 'none' (objetivo único)
  recurrence_type   text        NOT NULL DEFAULT 'none'
                    CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly')),
  status            text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'archived')),
  categories        text[]      NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Items del checklist de cada meta
CREATE TABLE goal_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      uuid        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title        text        NOT NULL,              -- encriptado a nivel app
  completed    boolean     NOT NULL DEFAULT false,
  completed_at timestamptz,
  reset_at     timestamptz,                       -- cuándo se reinició para metas recurrentes
  order_index  int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE goals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_user_policy" ON goals
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- goal_items hereda seguridad vía su goal padre
CREATE POLICY "goal_items_user_policy" ON goal_items
  FOR ALL
  USING  (goal_id IN (SELECT id FROM goals WHERE user_id = auth.uid()))
  WITH CHECK (goal_id IN (SELECT id FROM goals WHERE user_id = auth.uid()));

-- Trigger updated_at (reutiliza la función existente set_updated_at)
CREATE TRIGGER set_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices
CREATE INDEX goals_user_id_idx      ON goals(user_id);
CREATE INDEX goals_recurrence_idx   ON goals(user_id, recurrence_type);
CREATE INDEX goal_items_goal_id_idx ON goal_items(goal_id);
