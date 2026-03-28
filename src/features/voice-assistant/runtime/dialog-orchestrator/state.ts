import type { DialogOrchestratorState } from './types';

export function createInitialDialogOrchestratorState(): DialogOrchestratorState {
  return {
    session: {
      sessionEpoch: 0,
      sdkSessionId: null,
      dialogId: null,
      conversationId: null,
      interactionMode: null,
      replyChain: null,
      workMode: null,
      phase: 'idle',
    },
    turn: {
      turnId: 0,
      phase: 'idle',
      userText: '',
      assistantMessageType: 'text',
      replyOwner: null,
      platformReplyAllowed: true,
      interrupted: false,
    },
    generation: {
      commandEpoch: 0,
      replyGeneration: 0,
    },
    draft: {
      liveTranscript: '',
      assistantDraft: '',
      source: null,
      persisted: false,
    },
  };
}
