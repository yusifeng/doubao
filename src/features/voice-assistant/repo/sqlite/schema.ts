import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const schemaVersionTable = sqliteTable('schema_version', {
  id: integer('id').primaryKey().notNull(),
  version: integer('version').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chatSessionTable = sqliteTable(
  'chat_session',
  {
    id: text('id').primaryKey().notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    systemPromptSnapshot: text('system_prompt_snapshot'),
    lastMessagePreview: text('last_message_preview').notNull().default(''),
    lastMessageAt: integer('last_message_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_chat_session_updated_at').on(table.updatedAt)],
);

export const chatMessageTable = sqliteTable(
  'chat_message',
  {
    id: text('id').primaryKey().notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessionTable.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    type: text('type').notNull(),
    content: text('content').notNull(),
    streamState: text('stream_state').notNull().default('final'),
    idempotencyKey: text('idempotency_key'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_chat_message_session_created_at').on(table.sessionId, table.createdAt),
    uniqueIndex('uidx_chat_message_idempotency_key').on(table.idempotencyKey),
  ],
);

export const runtimeConfigTable = sqliteTable(
  'runtime_config',
  {
    key: text('key').primaryKey().notNull(),
    valueJson: text('value_json').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_runtime_config_updated_at').on(table.updatedAt)],
);

export const voiceSessionTable = sqliteTable(
  'voice_session',
  {
    id: text('id').primaryKey().notNull(),
    chatSessionId: text('chat_session_id')
      .notNull()
      .references(() => chatSessionTable.id, { onDelete: 'cascade' }),
    sdkSessionId: text('sdk_session_id'),
    interactionMode: text('interaction_mode').notNull(),
    replyChain: text('reply_chain').notNull(),
    phase: text('phase').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
  },
  (table) => [index('idx_voice_session_chat_started_at').on(table.chatSessionId, table.startedAt)],
);

export const voiceSessionEventTable = sqliteTable(
  'voice_session_event',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    voiceSessionId: text('voice_session_id')
      .notNull()
      .references(() => voiceSessionTable.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    turnId: integer('turn_id'),
    traceId: text('trace_id'),
    payloadJson: text('payload_json'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_voice_session_event_session_created_at').on(table.voiceSessionId, table.createdAt)],
);

export const sqliteVoiceAssistantSchema = {
  schemaVersionTable,
  chatSessionTable,
  chatMessageTable,
  runtimeConfigTable,
  voiceSessionTable,
  voiceSessionEventTable,
};
