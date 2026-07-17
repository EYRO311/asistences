-- Recomendación única "del día" (botón "Recomendación automática" en Inicio):
-- una fila por (user_id, date) con la recomendación combinada para todas las
-- tareas del día, generada a partir de preguntas puntuales (mismo outfit para
-- todo el día, transporte, código de vestimenta/idea ya pensada) en vez de
-- pedirle a Gemini que las infiera desde cero.
CREATE TABLE daily_recommendations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  full_text    text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE daily_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_recommendations_user_policy" ON daily_recommendations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX daily_recommendations_user_date_idx ON daily_recommendations(user_id, date);
