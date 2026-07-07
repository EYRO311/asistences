import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection | null = null;

const DB_NAME = "agenda";
const DB_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER DEFAULT 0,
  add_to_calendar INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft',
  google_event_id TEXT,
  notion_page_id TEXT,
  notion_url TEXT,
  due_date TEXT,
  priority TEXT,
  effort TEXT,
  task_status TEXT DEFAULT 'sin_empezar',
  categories TEXT DEFAULT '[]',
  outfit_suggestion TEXT,
  location TEXT,
  source TEXT DEFAULT 'app',
  cached_recommendation TEXT,
  meet_link TEXT,
  recurrence_days TEXT DEFAULT '[]',
  recurrence_start_time TEXT,
  recurrence_end_time TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  pending_delete INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);
`;

export async function openDatabase(): Promise<SQLiteDBConnection> {
  if (db) return db;

  const ret = await sqlite.checkConnectionsConsistency();
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;

  if (ret.result && isConn) {
    db = await sqlite.retrieveConnection(DB_NAME, false);
  } else {
    db = await sqlite.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false);
  }

  await db.open();
  await db.execute(SCHEMA);
  return db;
}

export async function getDb(): Promise<SQLiteDBConnection> {
  return db ?? (await openDatabase());
}
