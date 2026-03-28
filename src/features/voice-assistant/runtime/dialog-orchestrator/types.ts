export type InteractionMode = 'voice' | 'text';

export type ReplyChain = 'official_s2s' | 'custom_llm';

export type SessionPhase = 'idle' | 'starting' | 'ready' | 'stopping' | 'error';

export type TurnPhase =
  | 'idle'
  | 'listening'
  | 'awaiting_reply'
  | 'replying'
  | 'speaking'
  | 'interrupted'
  | 'finalized';

export type ReplyOwner = 'platform' | 'custom' | null;

export type DraftSource = 'platform' | 'custom' | null;

export type SessionState = {
  sessionEpoch: number;
  sdkSessionId: string | null;
  dialogId: string | null;
  conversationId: string | null;
  interactionMode: InteractionMode | null;
  replyChain: ReplyChain | null;
  workMode: 'default' | 'delegate_chat_tts_text' | null;
  phase: SessionPhase;
};

export type TurnState = {
  turnId: number;
  phase: TurnPhase;
  userText: string;
  assistantMessageType: 'audio' | 'text';
  replyOwner: ReplyOwner;
  platformReplyAllowed: boolean;
  interrupted: boolean;
};

export type GenerationState = {
  commandEpoch: number;
  replyGeneration: number;
};

export type DraftState = {
  liveTranscript: string;
  assistantDraft: string;
  source: DraftSource;
  persisted: boolean;
};

export type DialogOrchestratorState = {
  session: SessionState;
  turn: TurnState;
  generation: GenerationState;
  draft: DraftState;
};

export type DialogOrchestratorAction =
  | {
      type: 'session_starting';
      sessionEpoch: number;
      conversationId: string;
      interactionMode: InteractionMode;
      replyChain: ReplyChain;
      workMode: 'default' | 'delegate_chat_tts_text';
    }
  | {
      type: 'session_started';
      sdkSessionId: string | null;
    }
  | {
      type: 'session_ready';
      sdkSessionId: string | null;
      dialogId: string | null;
    }
  | {
      type: 'session_stopping';
    }
  | {
      type: 'session_stopped';
    }
  | {
      type: 'session_error';
    }
  | {
      type: 'turn_started';
      assistantMessageType: 'audio' | 'text';
      platformReplyAllowed: boolean;
    }
  | {
      type: 'turn_interrupted';
    }
  | {
      type: 'turn_user_text';
      text: string;
    }
  | {
      type: 'turn_reply_owner';
      owner: ReplyOwner;
    }
  | {
      type: 'turn_phase';
      phase: TurnPhase;
    }
  | {
      type: 'generation_bump_command';
    }
  | {
      type: 'generation_bump_reply';
    }
  | {
      type: 'draft_live_transcript';
      text: string;
    }
  | {
      type: 'draft_reply_delta';
      text: string;
      source: DraftSource;
    }
  | {
      type: 'draft_reply_finalized';
      persisted: boolean;
    }
  | {
      type: 'draft_clear';
    };
