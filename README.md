# Asistente de agenda

Aplicación que conecta tu Google Calendar y Notion para administrar tu semana:
crea tareas (`compromiso`, `personal`, `evento`), calcula tus huecos/días libres,
crea el evento correspondiente en Google Calendar y genera automáticamente una
página en Notion para cada tarea.

## Arquitectura

```
/web                  Next.js (App Router, TS) — UI + API routes (Node)
                       - Auth con Supabase
                       - CRUD de tareas (Saga: Supabase -> Google Calendar -> Notion)
                       - OAuth con Google y Notion
/calendar-service     Django + DRF — calcula días/horas libres a partir de Google Calendar
/supabase             Migraciones SQL (esquema + RLS)
```

Si crear/editar una tarea falla a mitad de camino (p. ej. Notion falla después
de haber creado el evento en Google), se revierten los pasos anteriores
(patrón Saga) para no dejar datos inconsistentes.

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta `supabase/migrations/0001_init.sql`.
3. Copia las credenciales (Settings -> API) — las usarás en `web/.env.local`.

Ver detalles en [`supabase/README.md`](./supabase/README.md).

## 2. Configurar Google OAuth

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) -> crea un proyecto.
2. Habilita la **Google Calendar API**.
3. Configura la pantalla de consentimiento OAuth (modo "External" para pruebas).
4. Crea credenciales **OAuth client ID** (tipo "Web application").
5. Agrega como Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
6. Copia el **Client ID** y **Client secret** a `web/.env.local`.

## 3. Configurar Notion

1. Ve a [notion.so/my-integrations](https://www.notion.so/my-integrations) y crea una
   **integración pública** (OAuth).
2. En "Redirect URIs" agrega: `http://localhost:3000/api/auth/notion/callback`.
3. Copia el **OAuth client ID** y **client secret** a `web/.env.local`.
4. En Notion, crea una base de datos donde se guardarán las páginas de tus tareas
   (cualquier base de datos con una propiedad de tipo "Title" sirve).
5. Comparte esa base de datos con tu integración (botón "Connect to" en Notion).
6. Copia el ID de la base de datos (los 32 caracteres en la URL) — lo configurarás
   luego en la pantalla de Ajustes de la app (`profiles.notion_database_id`).

## 4. Variables de entorno

```bash
cp web/.env.local.example web/.env.local
cp calendar-service/.env.example calendar-service/.env
```

Completa los valores en ambos archivos. `INTERNAL_API_KEY` debe ser **el mismo
valor** en `web/.env.local` y `calendar-service/.env` (es la clave compartida
para que Next.js llame al microservicio Django).

## 5. Levantar el frontend + Node API (Next.js)

```bash
cd web
npm install
npm run dev
```

App disponible en http://localhost:3000.

## 6. Levantar el microservicio Django

```bash
cd calendar-service
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Servicio disponible en http://localhost:8000.

## 7. Primer uso

1. Regístrate en `/login` (crea tu cuenta con Supabase Auth).
2. Ve a **Ajustes**:
   - Conecta Google Calendar.
   - Conecta Notion.
   - Pega el ID de tu base de datos de Notion y guarda.
3. Ve a **Nueva tarea**, crea una tarea de tipo `compromiso`, `personal` o `evento`.
   - Si está marcado "Agregar a Google Calendar", se crea el evento.
   - Siempre se crea una página en Notion para anotar detalles.
4. En el dashboard verás tu disponibilidad de la semana (calculada por
   `calendar-service`) y la lista de tareas.

## Esquema de datos

Ver [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql):

- **profiles**: zona horaria y `notion_database_id` por usuario.
- **integrations**: tokens OAuth de Google/Notion por usuario.
- **items**: tareas (`type`: `compromiso` | `personal` | `evento`), con
  `status` (`draft` -> `syncing` -> `confirmed` / `failed`), referencias a
  `google_event_id` y `notion_page_id`.
