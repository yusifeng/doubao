export function createVoiceToggleHandlers(deps: {
  activeConversationId: string | null;
  isVoiceActive: boolean;
  isTestEnv: boolean;
  supportsVoiceInputMute: boolean;
  isVoiceInputMuted: boolean;
  effectiveVoicePipelineMode: string;
  realtimeCallPhase: string;
  realtimeListeningState: string;
  useAndroidDialogRuntime: boolean;
  AUDIO_HINT_DEDUPE_WINDOW_MS: number;
  providers: any;
  androidSessionController: any;
  runHandsFreeVoiceLoop: () => Promise<void>;
  stopHandsFreeVoiceLoop: () => Promise<void>;
  startRealtimeDemoCall: () => Promise<void>;
  stopRealtimeDemoCall: () => Promise<void>;
  runTextRound: (input: { content: string; userMessageType: 'audio' | 'text'; assistantMessageType: 'audio' | 'text' }) => Promise<void>;
  appendAssistantAudioMessage: (text: string, options?: { dedupeWindowMs?: number }) => Promise<void>;
  toAudioErrorMessage: (message: string, fallback: string) => string;
  updateConversationRuntimeStatus: (status: any, options?: { refreshConversations?: boolean }) => Promise<void>;
  syncConversationState: () => Promise<void>;
  withCallLifecycleLock: (task: () => Promise<void>, options?: { waitIfLocked?: boolean }) => Promise<void>;
  ensureAndroidDialogConversation: (mode: 'voice' | 'text', options?: { forceRestart?: boolean }) => Promise<void>;
  stopAndroidDialogConversation: () => Promise<void>;
  resetRealtimeCallState: () => void;
  updateRealtimeCallPhase: (phase: any) => void;
  updateRealtimeListeningState: (state: any) => void;
  setIsVoiceActive: (v: boolean) => void;
  setVoiceInputMutedRuntime: (v: boolean) => void;
  setLiveUserTranscript: (v: string) => void;
  setPendingAssistantReply: (v: string) => void;
  setConnectivityHint: (v: string) => void;
  performAndroidDialogInterrupt: (source: 'manual' | 'barge_in') => Promise<void>;
  dispatchDialogOrchestrator: (action: any) => void;
  voiceLoopActiveRef: { current: boolean };
  voiceLoopRunningRef: { current: boolean };
  androidDialogModeRef: { current: 'voice' | 'text' | null };
  realtimeCallPhaseRef: { current: string };
  androidPlayerSpeakingRef: { current: boolean };
  isVoiceInputMutedRef: { current: boolean };
}) {
  const interruptVoiceOutput = async () => {
    await deps.performAndroidDialogInterrupt('manual');
  };

  const toggleVoiceInputMuted = async () => {
    if (!deps.supportsVoiceInputMute || !deps.isVoiceActive) {
      return;
    }
    const previousMuted = deps.isVoiceInputMutedRef.current;
    const nextMuted = !previousMuted;
    deps.setVoiceInputMutedRuntime(nextMuted);

    const isStillInActiveVoiceCall = () =>
      deps.voiceLoopActiveRef.current &&
      deps.androidDialogModeRef.current === 'voice' &&
      deps.realtimeCallPhaseRef.current !== 'stopping' &&
      deps.realtimeCallPhaseRef.current !== 'idle';
    const shouldRollbackMuteState = () =>
      deps.realtimeCallPhaseRef.current !== 'stopping' && deps.realtimeCallPhaseRef.current !== 'idle';

    try {
      if (nextMuted) {
        await deps.androidSessionController.pauseTalking();
        if (!isStillInActiveVoiceCall()) {
          return;
        }
        deps.setLiveUserTranscript('');
        deps.setPendingAssistantReply('');
        deps.updateRealtimeListeningState('ready');
      } else {
        await deps.androidSessionController.resumeTalking();
        if (!isStillInActiveVoiceCall()) {
          return;
        }
        if (deps.androidPlayerSpeakingRef.current || deps.realtimeCallPhaseRef.current === 'speaking') {
          deps.updateRealtimeCallPhase('speaking');
          deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'speaking' });
          await deps.updateConversationRuntimeStatus('speaking', { refreshConversations: true });
        } else {
          deps.updateRealtimeListeningState('ready');
          deps.updateRealtimeCallPhase('listening');
          deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'listening' });
          await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
        }
      }
      deps.providers.observability.log('info', 'android voice input mute toggled', { muted: nextMuted });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log('warn', 'failed to toggle android voice input mute', { message, nextMuted });
      if (shouldRollbackMuteState()) {
        deps.setVoiceInputMutedRuntime(previousMuted);
      }
    }
  };

  const toggleVoice = async () => {
    if (!deps.activeConversationId) {
      return;
    }
    if (deps.useAndroidDialogRuntime) {
      await deps.withCallLifecycleLock(async () => {
        if (!deps.isVoiceActive) {
          try {
            deps.updateRealtimeCallPhase('starting');
            deps.setIsVoiceActive(true);
            deps.setVoiceInputMutedRuntime(false);
            deps.voiceLoopActiveRef.current = true;
            deps.setLiveUserTranscript('');
            deps.setPendingAssistantReply('');
            await deps.ensureAndroidDialogConversation('voice', { forceRestart: true });
            deps.updateRealtimeListeningState('ready');
            deps.updateRealtimeCallPhase('listening');
            await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
            deps.setConnectivityHint('Android Dialog SDK 通话已接通');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            deps.providers.observability.log('warn', 'failed to start android dialog voice call', { message });
            deps.resetRealtimeCallState();
            deps.setConnectivityHint(`Android Dialog SDK 通话启动失败：${message}`);
            await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
            await deps.syncConversationState();
          }
          return;
        }
        deps.updateRealtimeCallPhase('stopping');
        deps.voiceLoopActiveRef.current = false;
        await deps.stopAndroidDialogConversation();
        deps.resetRealtimeCallState();
        deps.setConnectivityHint('Android Dialog SDK 通话已挂断');
        await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
        await deps.syncConversationState();
      });
      return;
    }

    if (deps.effectiveVoicePipelineMode === 'realtime_audio') {
      await deps.withCallLifecycleLock(async () => {
        if (!deps.isVoiceActive) {
          await deps.startRealtimeDemoCall();
          return;
        }
        await deps.stopRealtimeDemoCall();
      });
      return;
    }

    if (!deps.isTestEnv && deps.effectiveVoicePipelineMode === 'asr_text') {
      if (!deps.isVoiceActive) {
        if (deps.voiceLoopActiveRef.current || deps.voiceLoopRunningRef.current) {
          deps.setIsVoiceActive(true);
          return;
        }
        deps.voiceLoopActiveRef.current = true;
        deps.setIsVoiceActive(true);
        void deps.runHandsFreeVoiceLoop();
        return;
      }
      await deps.stopHandsFreeVoiceLoop();
      return;
    }

    if (!deps.isVoiceActive) {
      try {
        await deps.providers.audio.startRecognition('zh-CN');
        await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
        deps.providers.observability.log('info', 'voice asr session started', { mode: deps.effectiveVoicePipelineMode });
        deps.setIsVoiceActive(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        deps.providers.observability.log('warn', 'failed to start voice recognition', { message });
        await deps.appendAssistantAudioMessage('语音识别启动失败，请检查麦克风权限后重试。', {
          dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS,
        });
        await deps.updateConversationRuntimeStatus('idle');
        await deps.syncConversationState();
      }
      return;
    }

    deps.setIsVoiceActive(false);
    try {
      const recognizedText = await deps.providers.audio.stopRecognition();
      if (!recognizedText) {
        await deps.appendAssistantAudioMessage('没有识别到有效语音，请再试一次并连续说 2-3 秒（尽量靠近麦克风）。', {
          dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS,
        });
        return;
      }
      deps.providers.observability.log('info', 'voice transcript ready', {
        mode: deps.effectiveVoicePipelineMode,
        transcriptLength: recognizedText.length,
      });
      await deps.runTextRound({
        content: recognizedText,
        userMessageType: 'audio',
        assistantMessageType: 'audio',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log('warn', 'failed to process voice round', { message });
      await deps.appendAssistantAudioMessage(
        deps.toAudioErrorMessage(message, '语音识别失败，请稍后重试。'),
        { dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS },
      );
    } finally {
      await deps.providers.audio.abortRecognition();
      await deps.updateConversationRuntimeStatus('idle');
      await deps.syncConversationState();
    }
  };

  const ensureVoiceStopped = async () => {
    if (!deps.activeConversationId) {
      return;
    }

    if (deps.useAndroidDialogRuntime) {
      await deps.withCallLifecycleLock(async () => {
        const isVoiceCallOngoing =
          deps.voiceLoopActiveRef.current ||
          (deps.realtimeCallPhaseRef.current !== 'idle' &&
            deps.realtimeCallPhaseRef.current !== 'stopping');
        if (!isVoiceCallOngoing) {
          return;
        }
        deps.updateRealtimeCallPhase('stopping');
        deps.voiceLoopActiveRef.current = false;
        await deps.stopAndroidDialogConversation();
        deps.resetRealtimeCallState();
        deps.setConnectivityHint('Android Dialog SDK 通话已挂断');
        await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
        await deps.syncConversationState();
      });
      return;
    }

    if (deps.effectiveVoicePipelineMode === 'realtime_audio') {
      await deps.withCallLifecycleLock(async () => {
        const isRealtimeCallOngoing =
          (deps.realtimeCallPhaseRef.current !== 'idle' &&
            deps.realtimeCallPhaseRef.current !== 'stopping') ||
          deps.isVoiceActive;
        if (!isRealtimeCallOngoing) {
          return;
        }
        await deps.stopRealtimeDemoCall();
      });
      return;
    }

    if (!deps.isTestEnv && deps.effectiveVoicePipelineMode === 'asr_text') {
      if (!deps.isVoiceActive && !deps.voiceLoopActiveRef.current && !deps.voiceLoopRunningRef.current) {
        return;
      }
      await deps.stopHandsFreeVoiceLoop();
      return;
    }

    if (!deps.isVoiceActive) {
      return;
    }
    deps.setIsVoiceActive(false);
    await deps.providers.audio.abortRecognition();
    await deps.updateConversationRuntimeStatus('idle');
    await deps.syncConversationState();
  };

  const voiceToggleLabel = (() => {
    if (deps.useAndroidDialogRuntime) {
      switch (deps.realtimeCallPhase) {
        case 'starting':
          return '正在接通';
        case 'stopping':
          return '正在挂断';
        case 'listening':
        case 'speaking':
          return '挂断通话';
        case 'idle':
        default:
          return '开始通话';
      }
    }
    if (deps.effectiveVoicePipelineMode !== 'realtime_audio') {
      return deps.isVoiceActive ? '结束语音' : '开始语音';
    }
    switch (deps.realtimeCallPhase) {
      case 'starting':
        return '正在接通';
      case 'stopping':
        return '正在挂断';
      case 'listening':
      case 'speaking':
        return '挂断通话';
      case 'idle':
      default:
        return '开始通话';
    }
  })();

  const voiceRuntimeHint = (() => {
    if (deps.useAndroidDialogRuntime) {
      if (deps.isVoiceActive && deps.isVoiceInputMuted) {
        return '你已静音';
      }
      switch (deps.realtimeCallPhase) {
        case 'starting':
          return '正在接通';
        case 'listening':
          switch (deps.realtimeListeningState) {
            case 'hearing':
              return '已听到你在说话';
            case 'awaiting_reply':
              return '已发送，等待回复';
            case 'ready':
            default:
              return '正在听你说';
          }
        case 'speaking':
          return '助手播报中，稍后继续听';
        case 'stopping':
          return '正在挂断';
        case 'idle':
        default:
          return '实时通话未开启';
      }
    }
    if (deps.effectiveVoicePipelineMode !== 'realtime_audio') {
      return deps.isVoiceActive ? '本机识别已开启' : '本机识别未开启';
    }
    switch (deps.realtimeCallPhase) {
      case 'starting':
        return '实时上行准备中';
      case 'listening':
        switch (deps.realtimeListeningState) {
          case 'hearing':
            return '已听到你在说话';
          case 'awaiting_reply':
            return '已发送，等待回复';
          case 'ready':
          default:
            return '正在听你说';
        }
      case 'speaking':
        return '助手播报中，稍后继续听';
      case 'stopping':
        return '实时通话关闭中';
      case 'idle':
      default:
        return '实时通话未开启';
    }
  })();

  return {
    interruptVoiceOutput,
    toggleVoiceInputMuted,
    toggleVoice,
    ensureVoiceStopped,
    voiceToggleLabel,
    voiceRuntimeHint,
  };
}
