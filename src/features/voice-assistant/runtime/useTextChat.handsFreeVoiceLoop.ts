import type { TextRoundInput } from './useTextChat.contracts';

export function createHandsFreeVoiceLoopHandlers(deps: {
  activeConversationId: string | null;
  providers: any;
  effectiveVoicePipelineMode: string;
  VOICE_RUNTIME_CONFIG: any;
  AUDIO_HINT_DEDUPE_WINDOW_MS: number;
  voiceLoopActiveRef: { current: boolean };
  voiceLoopRunningRef: { current: boolean };
  micIssueLastHintAtRef: { current: number };
  setIsVoiceActive: (v: boolean) => void;
  appendAssistantAudioMessage: (text: string, options?: { dedupeWindowMs?: number }) => Promise<void>;
  runTextRound: (input: TextRoundInput) => Promise<void>;
  updateConversationRuntimeStatus: (status: any, options?: { refreshConversations?: boolean }) => Promise<void>;
  syncConversationState: () => Promise<void>;
}) {
  const stopHandsFreeVoiceLoop = async () => {
    if (!deps.activeConversationId) {
      return;
    }
    deps.voiceLoopActiveRef.current = false;
    await deps.providers.audio.stopPlayback();
    await deps.providers.audio.abortRecognition();
    deps.setIsVoiceActive(false);
    await deps.updateConversationRuntimeStatus('idle');
    await deps.syncConversationState();
  };

  const runHandsFreeVoiceLoop = async () => {
    if (!deps.activeConversationId) {
      return;
    }
    if (deps.voiceLoopRunningRef.current) {
      return;
    }
    deps.voiceLoopRunningRef.current = true;
    deps.providers.observability.log('info', 'handsfree voice loop started', { mode: deps.effectiveVoicePipelineMode });
    let consecutiveEmptyRounds = 0;
    let consecutiveErrorRounds = 0;
    try {
      while (deps.voiceLoopActiveRef.current) {
        try {
          await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });

          await deps.providers.audio.startRecognition('zh-CN');
          const recognizedText = await deps.providers.audio.waitForRecognitionResult(
            deps.VOICE_RUNTIME_CONFIG.recognitionPollTimeoutMs,
          );
          if (!deps.voiceLoopActiveRef.current) {
            break;
          }
          const normalizedText = recognizedText?.trim() ?? '';
          if (!normalizedText) {
            consecutiveEmptyRounds += 1;
            consecutiveErrorRounds = 0;
            deps.providers.observability.log('info', 'voice round returned empty transcript', {
              mode: deps.effectiveVoicePipelineMode,
              consecutiveEmptyRounds,
            });
            if (consecutiveEmptyRounds >= deps.VOICE_RUNTIME_CONFIG.emptyRoundHintThreshold) {
              const now = Date.now();
              if (now - deps.micIssueLastHintAtRef.current >= deps.VOICE_RUNTIME_CONFIG.micInputHintCooldownMs) {
                deps.micIssueLastHintAtRef.current = now;
                await deps.appendAssistantAudioMessage(
                  '我还没听到可识别的语音，通话会保持开启并继续监听。若在模拟器测试，请确认 Extended controls > Microphone 已开启 Host audio input，或优先使用真机。',
                  { dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS },
                );
              }
            }
            await new Promise<void>((resolve) => {
              setTimeout(resolve, deps.VOICE_RUNTIME_CONFIG.emptyRoundRetryDelayMs);
            });
            continue;
          }
          consecutiveEmptyRounds = 0;
          consecutiveErrorRounds = 0;
          deps.providers.observability.log('info', 'voice transcript ready', {
            mode: deps.effectiveVoicePipelineMode,
            transcriptLength: normalizedText.length,
          });
          await deps.providers.audio.abortRecognition();
          await deps.runTextRound({
            content: normalizedText,
            userMessageType: 'audio',
            assistantMessageType: 'audio',
          });
        } catch (error) {
          if (!deps.voiceLoopActiveRef.current) {
            break;
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          consecutiveErrorRounds += 1;
          deps.providers.observability.log('warn', 'failed to process voice round', { message });
          const isMicInputIssue = message.includes('未检测到麦克风输入');
          if (isMicInputIssue) {
            const now = Date.now();
            if (now - deps.micIssueLastHintAtRef.current >= deps.VOICE_RUNTIME_CONFIG.micInputHintCooldownMs) {
              deps.micIssueLastHintAtRef.current = now;
              await deps.appendAssistantAudioMessage(
                '当前一轮没有采到有效语音，我会保持通话并继续监听。若你在模拟器上测试，请确认 Extended controls > Microphone 已开启 Host audio input。',
                { dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS },
              );
            }
            await deps.providers.audio.abortRecognition();
            await new Promise<void>((resolve) => {
              setTimeout(resolve, deps.VOICE_RUNTIME_CONFIG.micRetryDelayMs);
            });
          } else {
            await deps.appendAssistantAudioMessage('语音识别失败，请稍后重试。', {
              dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS,
            });
            await new Promise<void>((resolve) => {
              setTimeout(resolve, deps.VOICE_RUNTIME_CONFIG.voiceRoundErrorBackoffMs);
            });
          }
          if (consecutiveErrorRounds >= deps.VOICE_RUNTIME_CONFIG.voiceRoundErrorStopThreshold) {
            deps.voiceLoopActiveRef.current = false;
            await deps.appendAssistantAudioMessage('语音通话已暂停，请点击麦克风重新开始。', {
              dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS,
            });
          }
        } finally {
          await deps.syncConversationState();
        }
      }
    } finally {
      deps.voiceLoopRunningRef.current = false;
      await stopHandsFreeVoiceLoop();
      deps.providers.observability.log('info', 'handsfree voice loop stopped', { mode: deps.effectiveVoicePipelineMode });
    }
  };

  return {
    stopHandsFreeVoiceLoop,
    runHandsFreeVoiceLoop,
  };
}
