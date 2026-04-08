import { and, asc, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type { ChatMessage, ChatSession, VoiceSession, VoiceSessionEvent } from '../../types/storage';
import type { MessageRepo, AppendMessageInput } from '../messageRepo';
import type { SessionRepo, CreateSessionInput } from '../sessionRepo';
import type {
  VoiceSessionLogRepo,
  AppendVoiceSessionEventInput,
  StartVoiceSessionInput,
} from '../voiceSessionLogRepo';
import { getVoiceAssistantDb } from './client';
import { chatMessageTable, chatSessionTable, voiceSessionEventTable, voiceSessionTable } from './schema';

function toChatSession(row: typeof chatSessionTable.$inferSelect): ChatSession {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ChatSession['status'],
    systemPromptSnapshot: row.systemPromptSnapshot ?? null,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageAt: row.lastMessageAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toChatMessage(row: typeof chatMessageTable.$inferSelect): ChatMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ChatMessage['role'],
    type: row.type as ChatMessage['type'],
    content: row.content,
    streamState: row.streamState as ChatMessage['streamState'],
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: row.createdAt,
  };
}

function toVoiceSession(row: typeof voiceSessionTable.$inferSelect): VoiceSession {
  return {
    id: row.id,
    chatSessionId: row.chatSessionId,
    sdkSessionId: row.sdkSessionId ?? null,
    interactionMode: row.interactionMode as VoiceSession['interactionMode'],
    replyChain: row.replyChain as VoiceSession['replyChain'],
    phase: row.phase as VoiceSession['phase'],
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}

function toVoiceSessionEvent(row: typeof voiceSessionEventTable.$inferSelect): VoiceSessionEvent {
  return {
    id: row.id,
    voiceSessionId: row.voiceSessionId,
    eventType: row.eventType,
    turnId: row.turnId ?? null,
    traceId: row.traceId ?? null,
    payloadJson: row.payloadJson ?? null,
    createdAt: row.createdAt,
  };
}

export class SqliteVoiceAssistantStorageRepo implements SessionRepo, MessageRepo, VoiceSessionLogRepo {
  async create(input: CreateSessionInput): Promise<ChatSession> {
    const database = await getVoiceAssistantDb();
    await database.insert(chatSessionTable).values({
      id: input.id,
      title: input.title,
      status: input.status,
      systemPromptSnapshot: input.systemPromptSnapshot ?? null,
      lastMessagePreview: '',
      lastMessageAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
    const created = await this.getById(input.id);
    if (!created) {
      throw new Error('failed to load created chat session');
    }
    return created;
  }

  async list(): Promise<ChatSession[]> {
    const database = await getVoiceAssistantDb();
    const rows = await database.select().from(chatSessionTable).orderBy(desc(chatSessionTable.updatedAt));
    return rows.map(toChatSession);
  }

  async getById(sessionId: string): Promise<ChatSession | null> {
    const database = await getVoiceAssistantDb();
    const rows = await database.select().from(chatSessionTable).where(eq(chatSessionTable.id, sessionId)).limit(1);
    const first = rows[0];
    return first ? toChatSession(first) : null;
  }

  async renameTitle(sessionId: string, title: string, updatedAt: number): Promise<boolean> {
    const database = await getVoiceAssistantDb();
    const result = await database
      .update(chatSessionTable)
      .set({
        title,
        updatedAt,
      })
      .where(eq(chatSessionTable.id, sessionId));
    return result.changes > 0;
  }

  async updateStatus(sessionId: string, status: ChatSession['status'], updatedAt: number): Promise<void> {
    const database = await getVoiceAssistantDb();
    await database
      .update(chatSessionTable)
      .set({
        status,
        updatedAt,
      })
      .where(eq(chatSessionTable.id, sessionId));
  }

  async updateSystemPromptSnapshot(sessionId: string, snapshot: string): Promise<void> {
    const database = await getVoiceAssistantDb();
    await database
      .update(chatSessionTable)
      .set({ systemPromptSnapshot: snapshot })
      .where(eq(chatSessionTable.id, sessionId));
  }

  async delete(sessionId: string): Promise<boolean> {
    const database = await getVoiceAssistantDb();
    const result = await database.delete(chatSessionTable).where(eq(chatSessionTable.id, sessionId));
    return result.changes > 0;
  }

  async append(input: AppendMessageInput): Promise<ChatMessage> {
    const database = await getVoiceAssistantDb();
    let persisted: typeof chatMessageTable.$inferSelect | null = null;

    await database.transaction(async (transaction) => {
      if (input.idempotencyKey) {
        const existing = await transaction
          .select()
          .from(chatMessageTable)
          .where(eq(chatMessageTable.idempotencyKey, input.idempotencyKey))
          .limit(1);
        const first = existing[0];
        if (first) {
          persisted = first;
          return;
        }
      }

      await transaction.insert(chatMessageTable).values({
        id: input.id,
        sessionId: input.sessionId,
        role: input.role,
        type: input.type,
        content: input.content,
        streamState: input.streamState ?? 'final',
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: input.createdAt,
      });

      await transaction
        .update(chatSessionTable)
        .set({
          lastMessagePreview: input.content,
          lastMessageAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .where(
          and(
            eq(chatSessionTable.id, input.sessionId),
            or(isNull(chatSessionTable.lastMessageAt), lte(chatSessionTable.lastMessageAt, input.createdAt)),
          ),
        );

      const created = await transaction
        .select()
        .from(chatMessageTable)
        .where(eq(chatMessageTable.id, input.id))
        .limit(1);
      persisted = created[0] ?? null;
    });

    if (!persisted) {
      throw new Error('failed to load created chat message');
    }
    return toChatMessage(persisted);
  }

  async listBySession(sessionId: string): Promise<ChatMessage[]> {
    const database = await getVoiceAssistantDb();
    const rows = await database.$client.getAllAsync<{
      id: string;
      sessionId: string;
      role: string;
      type: string;
      content: string;
      streamState: string;
      idempotencyKey: string | null;
      createdAt: number;
    }>(
      `SELECT
        id,
        session_id AS sessionId,
        role,
        type,
        content,
        stream_state AS streamState,
        idempotency_key AS idempotencyKey,
        created_at AS createdAt
      FROM chat_message
      WHERE session_id = ?
      ORDER BY created_at ASC, rowid ASC;`,
      sessionId,
    );
    return rows.map((row) =>
      toChatMessage({
        id: row.id,
        sessionId: row.sessionId,
        role: row.role,
        type: row.type,
        content: row.content,
        streamState: row.streamState,
        idempotencyKey: row.idempotencyKey,
        createdAt: row.createdAt,
      }),
    );
  }

  async startSession(input: StartVoiceSessionInput): Promise<VoiceSession> {
    const database = await getVoiceAssistantDb();
    await database.insert(voiceSessionTable).values({
      id: input.id,
      chatSessionId: input.chatSessionId,
      sdkSessionId: input.sdkSessionId ?? null,
      interactionMode: input.interactionMode,
      replyChain: input.replyChain,
      phase: 'starting',
      startedAt: input.startedAt,
      endedAt: null,
      errorCode: null,
      errorMessage: null,
    });
    const rows = await database.select().from(voiceSessionTable).where(eq(voiceSessionTable.id, input.id)).limit(1);
    const first = rows[0];
    if (!first) {
      throw new Error('failed to load created voice session');
    }
    return toVoiceSession(first);
  }

  async updateSessionPhase(
    voiceSessionId: string,
    phase: VoiceSession['phase'],
    options?: { endedAt?: number | null; errorCode?: string | null; errorMessage?: string | null },
  ): Promise<void> {
    const database = await getVoiceAssistantDb();
    await database
      .update(voiceSessionTable)
      .set({
        phase,
        endedAt: options?.endedAt ?? null,
        errorCode: options?.errorCode ?? null,
        errorMessage: options?.errorMessage ?? null,
      })
      .where(eq(voiceSessionTable.id, voiceSessionId));
  }

  async appendEvent(input: AppendVoiceSessionEventInput): Promise<VoiceSessionEvent> {
    const database = await getVoiceAssistantDb();
    const result = await database.insert(voiceSessionEventTable).values({
      voiceSessionId: input.voiceSessionId,
      eventType: input.eventType,
      turnId: input.turnId ?? null,
      traceId: input.traceId ?? null,
      payloadJson: input.payloadJson ?? null,
      createdAt: input.createdAt,
    });

    const insertedId = Number(result.lastInsertRowId);
    const rows = await database
      .select()
      .from(voiceSessionEventTable)
      .where(eq(voiceSessionEventTable.id, insertedId))
      .limit(1);
    const first = rows[0];
    if (!first) {
      throw new Error('failed to load created voice session event');
    }
    return toVoiceSessionEvent(first);
  }

  async listSessionsByChatSession(chatSessionId: string): Promise<VoiceSession[]> {
    const database = await getVoiceAssistantDb();
    const rows = await database
      .select()
      .from(voiceSessionTable)
      .where(eq(voiceSessionTable.chatSessionId, chatSessionId))
      .orderBy(desc(voiceSessionTable.startedAt));
    return rows.map(toVoiceSession);
  }

  async listEventsBySession(voiceSessionId: string): Promise<VoiceSessionEvent[]> {
    const database = await getVoiceAssistantDb();
    const rows = await database
      .select()
      .from(voiceSessionEventTable)
      .where(eq(voiceSessionEventTable.voiceSessionId, voiceSessionId))
      .orderBy(asc(voiceSessionEventTable.createdAt), asc(voiceSessionEventTable.id));
    return rows.map(toVoiceSessionEvent);
  }
}
