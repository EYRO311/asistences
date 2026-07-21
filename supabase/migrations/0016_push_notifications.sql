-- Fase 6 del plan de implementación: recordatorios por Web Push antes de que
-- empiece una tarea. Un usuario puede tener varias suscripciones (una por
-- navegador/dispositivo donde activó los recordatorios).
CREATE TABLE push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_user_policy" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);

-- Preferencias de recordatorios por usuario.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_minutes_before integer NOT NULL DEFAULT 15;

-- Evita reenviar el mismo recordatorio en cada pasada del cron: se guarda la
-- fecha local (del usuario) en que ya se avisó. Para tareas recurrentes esto
-- se reinicia solo cada día porque se compara contra la fecha de hoy, no se
-- vuelve a poner en null.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS last_reminder_date date;
