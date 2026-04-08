import type { SQLiteDatabase } from 'expo-sqlite';

const TARGET_SCHEMA_VERSION = 1;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_session (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('idle', 'listening', 'thinking', 'speaking', 'error')),
  system_prompt_snapshot TEXT,
  last_message_preview TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_message (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  type TEXT NOT NULL CHECK (type IN ('text', 'audio')),
  content TEXT NOT NULL,
  stream_state TEXT NOT NULL DEFAULT 'final' CHECK (stream_state IN ('partial', 'final')),
  idempotency_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_session_updated_at ON chat_session(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_message_session_created_at ON chat_message(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS runtime_config (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_session (
  id TEXT PRIMARY KEY NOT NULL,
  chat_session_id TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
  sdk_session_id TEXT,
  interaction_mode TEXT NOT NULL CHECK (interaction_mode IN ('voice', 'text')),
  reply_chain TEXT NOT NULL CHECK (reply_chain IN ('official_s2s', 'custom_llm')),
  phase TEXT NOT NULL CHECK (phase IN ('starting', 'ready', 'stopping', 'stopped', 'error')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_voice_session_chat_started_at ON voice_session(chat_session_id, started_at DESC);

CREATE TABLE IF NOT EXISTS voice_session_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  voice_session_id TEXT NOT NULL REFERENCES voice_session(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  turn_id INTEGER,
  trace_id TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_session_event_session_created_at
ON voice_session_event(voice_session_id, created_at ASC);
`;

type VersionRow = { version: number };

export async function ensureVoiceAssistantSchema(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  await database.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), version INTEGER NOT NULL, updated_at INTEGER NOT NULL);',
  );
  const now = Date.now();
  await database.runAsync(
    'INSERT OR IGNORE INTO schema_version(id, version, updated_at) VALUES (1, 0, ?);',
    now,
  );

  const current = await database.getFirstAsync<VersionRow>('SELECT version FROM schema_version WHERE id = 1;');
  const currentVersion = current?.version ?? 0;
  if (currentVersion >= TARGET_SCHEMA_VERSION) {
    return;
  }

  await database.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(CREATE_TABLES_SQL);
    await txn.runAsync(
      'UPDATE schema_version SET version = ?, updated_at = ? WHERE id = 1;',
      TARGET_SCHEMA_VERSION,
      Date.now(),
    );
  });
}
