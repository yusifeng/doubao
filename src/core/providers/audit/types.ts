import type { LogLevel } from '../observability/types';

export type AuditStage =
  | 'session.starting'
  | 'session.stopped'
  | 'turn.started'
  | 'turn.user_final'
  | 'reply.platform.partial'
  | 'reply.platform.final'
  | 'reply.custom.request_start'
  | 'reply.custom.first_chunk'
  | 'reply.custom.final'
  | 'reply.custom.failed'
  | 'tts.playback_start'
  | 'tts.playback_finish'
  | 'tts.playback_interrupted'
  | 'guard.platform_leak';

export type AuditEvent = {
  stage: AuditStage;
  traceId: string;
  level?: LogLevel;
  message?: string;
  questionId?: string;
  replyId?: string;
  sessionId?: string | null;
  dialogId?: string | null;
  turnId?: number;
  mode?: 'voice' | 'text' | null;
  replyChain?: 'official_s2s' | 'custom_llm' | null;
  phase?: string;
  [extra: string]: unknown;
};

export interface AuditProvider {
  record(event: AuditEvent): void;
}
