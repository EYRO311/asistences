-- =========================================================
-- Origen del item: creado desde la app, o importado por
-- sincronización desde Google Calendar / Notion.
-- =========================================================

alter table items
  add column if not exists source text not null default 'app'
    check (source in ('app', 'google_sync', 'notion_sync'));
