import { createInitialDialogOrchestratorState } from './state';
import type { DialogOrchestratorAction, DialogOrchestratorState } from './types';

function mergeAssistantDraft(currentDraft: string, incomingText: string): string {
  if (!incomingText) {
    return currentDraft;
  }
  if (!currentDraft) {
    return incomingText;
  }
  if (incomingText.startsWith(currentDraft) || incomingText.includes(currentDraft)) {
    return incomingText;
  }
  if (
    currentDraft.startsWith(incomingText) ||
    currentDraft.includes(incomingText) ||
    currentDraft.endsWith(incomingText)
  ) {
    return currentDraft;
  }

  const maxOverlap = Math.min(currentDraft.length, incomingText.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (currentDraft.slice(-overlap) === incomingText.slice(0, overlap)) {
      return `${currentDraft}${incomingText.slice(overlap)}`;
    }
  }

  return `${currentDraft}${incomingText}`;
}

export function reduceDialogOrchestratorState(
  state: DialogOrchestratorState,
  action: DialogOrchestratorAction,
): DialogOrchestratorState {
  switch (action.type) {
    case 'session_starting':
      return {
        ...state,
        session: {
          ...state.session,
          sessionEpoch: action.sessionEpoch,
          sdkSessionId: null,
          dialogId: null,
          conversationId: action.conversationId,
          interactionMode: action.interactionMode,
          replyChain: action.replyChain,
          workMode: action.workMode,
          phase: 'starting',
        },
        turn: {
          ...state.turn,
          phase: action.interactionMode === 'voice' ? 'listening' : 'awaiting_reply',
        },
        draft: {
          ...state.draft,
          liveTranscript: '',
          assistantDraft: '',
          source: null,
          persisted: false,
        },
      };
    case 'session_started':
      return {
        ...state,
        session: {
          ...state.session,
          sdkSessionId: action.sdkSessionId,
        },
      };
    case 'session_ready':
      return {
        ...state,
        session: {
          ...state.session,
          phase: 'ready',
          dialogId: action.dialogId,
          sdkSessionId: state.session.sdkSessionId ?? action.sdkSessionId,
        },
      };
    case 'session_stopping':
      return {
        ...state,
        session: {
          ...state.session,
          phase: 'stopping',
        },
      };
    case 'session_stopped':
      return {
        ...createInitialDialogOrchestratorState(),
        session: {
          ...createInitialDialogOrchestratorState().session,
          sessionEpoch: state.session.sessionEpoch,
        },
      };
    case 'session_error':
      return {
        ...state,
        session: {
          ...state.session,
          phase: 'error',
        },
      };
    case 'turn_started':
      return {
        ...state,
        turn: {
          ...state.turn,
          turnId: state.turn.turnId + 1,
          phase: 'listening',
          userText: '',
          assistantMessageType: action.assistantMessageType,
          replyOwner: null,
          platformReplyAllowed: action.platformReplyAllowed,
          interrupted: false,
        },
        draft: {
          ...state.draft,
          liveTranscript: '',
          assistantDraft: '',
          source: null,
          persisted: false,
        },
      };
    case 'turn_interrupted':
      return {
        ...state,
        turn: {
          ...state.turn,
          interrupted: true,
          phase: 'interrupted',
        },
      };
    case 'turn_user_text':
      return {
        ...state,
        turn: {
          ...state.turn,
          userText: action.text,
          phase: 'awaiting_reply',
        },
      };
    case 'turn_reply_owner':
      return {
        ...state,
        turn: {
          ...state.turn,
          replyOwner: action.owner,
          platformReplyAllowed: action.owner === 'custom' ? false : state.turn.platformReplyAllowed,
        },
      };
    case 'turn_phase':
      return {
        ...state,
        turn: {
          ...state.turn,
          phase: action.phase,
        },
      };
    case 'generation_bump_command':
      return {
        ...state,
        generation: {
          ...state.generation,
          commandEpoch: state.generation.commandEpoch + 1,
        },
      };
    case 'generation_bump_reply':
      return {
        ...state,
        generation: {
          ...state.generation,
          replyGeneration: state.generation.replyGeneration + 1,
        },
      };
    case 'draft_live_transcript':
      return {
        ...state,
        draft: {
          ...state.draft,
          liveTranscript: action.text,
        },
      };
    case 'draft_reply_delta':
      return {
        ...state,
        draft: {
          ...state.draft,
          assistantDraft: mergeAssistantDraft(state.draft.assistantDraft, action.text),
          source: action.source,
          persisted: false,
        },
      };
    case 'draft_reply_finalized':
      return {
        ...state,
        turn: {
          ...state.turn,
          phase: 'finalized',
        },
        draft: {
          ...state.draft,
          persisted: action.persisted,
        },
      };
    case 'draft_clear':
      return {
        ...state,
        draft: {
          ...state.draft,
          liveTranscript: '',
          assistantDraft: '',
          source: null,
          persisted: false,
        },
      };
    default:
      return state;
  }
}
