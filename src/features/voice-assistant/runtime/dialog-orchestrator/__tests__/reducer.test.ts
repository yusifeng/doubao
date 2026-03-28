import { reduceDialogOrchestratorState } from '../reducer';
import { createInitialDialogOrchestratorState } from '../state';
import { collectInvariantViolations } from '../invariants';

describe('dialog orchestrator reducer', () => {
  it('evolves engine_start -> session_ready -> asr_final -> reply_final contract', () => {
    let state = createInitialDialogOrchestratorState();

    state = reduceDialogOrchestratorState(state, {
      type: 'session_starting',
      sessionEpoch: 1,
      conversationId: 'c1',
      interactionMode: 'voice',
      replyChain: 'official_s2s',
      workMode: 'default',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'session_started',
      sdkSessionId: 's1',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'session_ready',
      sdkSessionId: 'dialog-1',
      dialogId: 'dialog-1',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'turn_started',
      assistantMessageType: 'audio',
      platformReplyAllowed: true,
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'turn_user_text',
      text: '你好',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'turn_reply_owner',
      owner: 'platform',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'draft_reply_delta',
      text: '我是',
      source: 'platform',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'draft_reply_delta',
      text: '我是柯南',
      source: 'platform',
    });
    state = reduceDialogOrchestratorState(state, {
      type: 'draft_reply_finalized',
      persisted: true,
    });

    expect(state.session.phase).toBe('ready');
    expect(state.turn.phase).toBe('finalized');
    expect(state.turn.userText).toBe('你好');
    expect(state.draft.assistantDraft).toBe('我是柯南');
    expect(state.draft.persisted).toBe(true);
    expect(collectInvariantViolations(state)).toEqual([]);
  });

  it('drops platform permission when custom reply owner takes over', () => {
    let state = createInitialDialogOrchestratorState();
    state = reduceDialogOrchestratorState(state, {
      type: 'turn_reply_owner',
      owner: 'custom',
    });

    expect(state.turn.replyOwner).toBe('custom');
    expect(state.turn.platformReplyAllowed).toBe(false);
    expect(collectInvariantViolations(state)).toEqual([]);
  });
});
