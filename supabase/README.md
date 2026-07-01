# Supabase

## Aplicar la migración

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** en el dashboard de tu proyecto.
3. Pega el contenido de `migrations/0001_init.sql` y ejecútalo.
   - Alternativamente, con la [Supabase CLI](https://supabase.com/docs/guides/cli):
     ```bash
     supabase link --project-ref <tu-project-ref>
     supabase db push
     ```
4. Copia las credenciales del proyecto (Settings -> API) a `web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings -> API -> service_role, **secreto**, solo en backend)

## Tablas creadas

- **profiles**: datos del usuario, zona horaria y `notion_database_id` (la base de datos de Notion donde se crean las páginas de cada tarea).
- **integrations**: tokens OAuth de Google y Notion por usuario (`provider` = `google` | `notion`).
- **items**: tareas/eventos con `type` (`compromiso`, `personal`, `evento`), rango de fechas, estado de la saga (`status`) y referencias a `google_event_id` / `notion_page_id`.

Todas las tablas tienen RLS habilitado: cada usuario solo puede leer/escribir sus propias filas (`auth.uid() = user_id`).

Un trigger crea automáticamente la fila en `profiles` cuando un usuario se registra en Supabase Auth.
