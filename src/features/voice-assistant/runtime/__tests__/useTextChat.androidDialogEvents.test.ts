import type { DialogEngineEvent } from '../../../../core/providers/dialog-engine/types';
import { handleAndroidLifecycleEvent } from '../useTextChat.androidDialogEvents';

function createLifecycleDeps(
  overrides?: Partial<Parameters<typeof handleAndroidLifecycleEvent>[1]>,
): Parameters<typeof handleAndroidLifecycleEvent>[1] {
  return {
    androidDialogSessionIdRef: { current: 'sdk-session-current' },
    androidDialogConversationIdRef: { current: 'conv-1' },
    androidDialogSessionReadyRef: { current: true },
    androidPlayerSpeakingRef: { current: false },
    androidDialogClientTtsEnabledRef: { current: false },
    androidDialogClientTtsSelectionEpochRef: { current: 0 },
    androidDialogClientTtsSelectionPromiseRef: { current: null },
    androidDialogClientTtsSelectionReadyRef: { current: false },
    androidCustomClientTtsStreamStartedRef: { current: false },
    androidReplyGenerationRef: { current: 0 },
    androidPlatformFinalTextByTurnKeyRef: { current: new Map() },
    androidPlatformFinalInFlightTurnKeysRef: { current: new Set() },
    androidPlatformFinalPendingTextByTurnKeyRef: { current: new Map() },
    androidRetiredSessionIdsRef: { current: [] },
    voiceLoopActiveRef: { current: false },
    rememberRetiredAndroidDialogSession: jest.fn(),
    setConnectivityHint: jest.fn(),
    clearTurnTrace: jest.fn(),
    recordAudit: jest.fn(),
    dispatchDialogOrchestrator: jest.fn(),
    resetRealtimeCallState: jest.fn(),
    updateRealtimeCallPhase: jest.fn(),
    updateRealtimeListeningState: jest.fn(),
    setIsVoiceActive: jest.fn(),
    updateConversationRuntimeStatus: jest.fn(async () => {}),
    logIgnoredAndroidDialogEvent: jest.fn(),
    onVoiceSessionStarted: jest.fn(),
    onVoiceSessionReady: jest.fn(),
    onVoiceSessionStopped: jest.fn(),
    onVoiceSessionError: jest.fn(),
    ...overrides,
  };
}

describe('handleAndroidLifecycleEvent engine_stop guard', () => {
  it('logs stop and still runs teardown when engine_stop arrives after active sdk session ref was cleared', () => {
    const event: DialogEngineEvent = {
      type: 'engine_stop',
      sessionId: 'sdk-session-1',
    };
    const deps = createLifecycleDeps({
      androidDialogSessionIdRef: { current: null },
    });

    const handled = handleAndroidLifecycleEvent(event, deps);

    expect(handled).toBe(true);
    expect(deps.rememberRetiredAndroidDialogSession).toHaveBeenCalledWith('sdk-session-1');
    expect(deps.onVoiceSessionStopped).toHaveBeenCalledWith(event);
    expect(deps.resetRealtimeCallState).toHaveBeenCalledTimes(1);
    expect(deps.logIgnoredAndroidDialogEvent).not.toHaveBeenCalled();
  });

  it('drops mismatched engine_stop when another sdk session is active', () => {
    const event: DialogEngineEvent = {
      type: 'engine_stop',
      sessionId: 'sdk-session-stale',
    };
    const deps = createLifecycleDeps({
      androidDialogSessionIdRef: { current: 'sdk-session-current' },
    });

    const handled = handleAndroidLifecycleEvent(event, deps);

    expect(handled).toBe(true);
    expect(deps.logIgnoredAndroidDialogEvent).toHaveBeenCalledWith('lifecycle_session_mismatch');
    expect(deps.onVoiceSessionStopped).not.toHaveBeenCalled();
    expect(deps.resetRealtimeCallState).not.toHaveBeenCalled();
  });

  it('ignores retired engine_stop when no sdk session is active and avoids duplicate teardown', () => {
    const event: DialogEngineEvent = {
      type: 'engine_stop',
      sessionId: 'sdk-session-retired',
    };
    const deps = createLifecycleDeps({
      androidDialogSessionIdRef: { current: null },
      androidRetiredSessionIdsRef: { current: ['sdk-session-retired'] },
    });

    const handled = handleAndroidLifecycleEvent(event, deps);

    expect(handled).toBe(true);
    expect(deps.onVoiceSessionStopped).toHaveBeenCalledWith(event);
    expect(deps.resetRealtimeCallState).not.toHaveBeenCalled();
    expect(deps.logIgnoredAndroidDialogEvent).toHaveBeenCalledWith('retired_session_engine_stop');
  });
});
