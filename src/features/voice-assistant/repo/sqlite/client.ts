import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureVoiceAssistantSchema } from './migration';
import { sqliteVoiceAssistantSchema } from './schema';

type VoiceAssistantDb = ExpoSQLiteDatabase<typeof sqliteVoiceAssistantSchema> & {
  $client: SQLiteDatabase;
};

const DATABASE_NAME = 'voice_assistant.db';

let databasePromise: Promise<VoiceAssistantDb> | null = null;
let sqliteAvailability: boolean | null = null;

export function isVoiceAssistantSqliteAvailable(): boolean {
  if (sqliteAvailability !== null) {
    return sqliteAvailability;
  }
  try {
    const probeDb = SQLite.openDatabaseSync('__voice_assistant_probe__.db');
    probeDb.closeSync();
    sqliteAvailability = true;
  } catch {
    sqliteAvailability = false;
  }
  return sqliteAvailability;
}

export async function getVoiceAssistantDb(): Promise<VoiceAssistantDb> {
  if (!isVoiceAssistantSqliteAvailable()) {
    throw new Error('voice assistant sqlite is unavailable in current runtime');
  }
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = (async () => {
    try {
      const sqliteDb = SQLite.openDatabaseSync(DATABASE_NAME);
      await ensureVoiceAssistantSchema(sqliteDb);
      return drizzle(sqliteDb, { schema: sqliteVoiceAssistantSchema });
    } catch (error) {
      databasePromise = null;
      throw error;
    }
  })();

  return databasePromise;
}
