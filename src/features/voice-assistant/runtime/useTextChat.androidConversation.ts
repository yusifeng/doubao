import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';
import type { DialogConversationInputMode } from '../../../core/providers/dialog-engine/types';
import type { AndroidDialogMode } from './useTextChat.shared';
import { ensureAndroidClientTriggeredTts as ensureAndroidClientTriggeredTtsFlow } from './useTextChat.androidClientTts';

export function createAndroidConversationHandlers(deps: any) {
  const resolveDialogCharacterManifest = async (conversationId: string) => {
    const conversation = deps.conversations?.find((item: { id: string }) => item.id === conversationId) ?? null;
    const conversationSnapshot = conversation?.systemPromptSnapshot?.trim();
    if (conversationSnapshot) {
      return { characterManifest: conversationSnapshot, source: 'conversation_snapshot' as const };
    }

    const runtimePersonaPrompt = deps.runtimeConfig?.persona?.systemPrompt?.trim();
    if (runtimePersonaPrompt) {
      if (conversation) {
        // Backfill legacy conversations that were created before snapshot persistence.
        await deps.repo.updateConversationSystemPromptSnapshot(conversationId, runtimePersonaPrompt);
        if (typeof deps.setConversations === 'function') {
          deps.setConversations(await deps.repo.listConversations());
        }
      }
      return { characterManifest: runtimePersonaPrompt, source: 'runtime_persona' as const };
    }

    return { characterManifest: deps.KONAN_CHARACTER_MANIFEST, source: 'konan_fallback' as const };
  };

  const ensureAndroidDialogPrepared = async () => {
    if (!deps.useAndroidDialogRuntime) {
      return;
    }
    const needsPrepare =
      !deps.androidDialogPreparedRef.current ||
      deps.androidDialogPreparedWorkModeRef.current !== deps.androidDialogWorkMode;
    if (!needsPrepare) {
      return;
    }
    await deps.androidSessionController.prepare({ dialogWorkMode: deps.androidDialogWorkMode });
    deps.androidDialogPreparedRef.current = true;
    deps.androidDialogPreparedWorkModeRef.current = deps.androidDialogWorkMode;
  };

  const persistPendingAndroidAssistantDraft = async (options?: { conversationId?: string | null }) => {
    const targetConversationId =
      options?.conversationId ?? deps.androidDialogConversationIdRef.current ?? deps.activeConversationId;
    if (!targetConversationId) {
      return;
    }
    const draftText = sanitizeAssistantText((deps.androidAssistantDraftRef.current || deps.pendingAssistantReply).trim());
    if (!draftText) {
      return;
    }
    const currentMessages = await deps.repo.listMessages(targetConversationId);
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (lastMessage?.role === 'assistant' && isSameAssistantText(lastMessage.content, draftText)) {
      return;
    }
    await deps.repo.appendMessage(targetConversationId, {
      conversationId: targetConversationId,
      role: 'assistant',
      content: draftText,
      type: deps.androidDialogModeRef.current === 'voice' ? 'audio' : 'text',
    });
  };

  const ensureAndroidDialogConversation = async (mode: AndroidDialogMode, options?: { forceRestart?: boolean }) => {
    if (!deps.useAndroidDialogRuntime) {
      return;
    }
    const nextConversationId = deps.activeConversationId;
    if (!nextConversationId) {
      return;
    }
    const workModeChanged =
      deps.androidDialogPreparedWorkModeRef.current !== null &&
      deps.androidDialogPreparedWorkModeRef.current !== deps.androidDialogWorkMode;
    const shouldRestart =
      options?.forceRestart ||
      !deps.androidDialogModeRef.current ||
      deps.androidDialogModeRef.current !== mode ||
      workModeChanged;
    if (shouldRestart && deps.androidDialogModeRef.current) {
      await persistPendingAndroidAssistantDraft();
      deps.rememberRetiredAndroidDialogSession(deps.androidDialogSessionIdRef.current);
      deps.androidDialogSessionIdRef.current = null;
      deps.androidDialogConversationIdRef.current = null;
      await deps.androidSessionController.stopConversation();
      deps.androidDialogModeRef.current = null;
      deps.androidAssistantDraftRef.current = '';
      deps.setPendingAssistantReply('');
      deps.setLiveUserTranscript('');
      deps.clearTurnTrace();
    }
    if (!shouldRestart && deps.androidDialogModeRef.current === mode) {
      return;
    }
    await ensureAndroidDialogPrepared();
    const inputMode: DialogConversationInputMode = mode === 'voice' ? 'audio' : 'text';
    deps.androidDialogSessionReadyRef.current = false;
    deps.androidPlayerSpeakingRef.current = false;
    deps.androidDialogClientTtsEnabledRef.current = false;
    deps.androidDialogClientTtsSelectionEpochRef.current += 1;
    deps.androidDialogClientTtsSelectionPromiseRef.current = null;
    deps.androidDialogClientTtsSelectionReadyRef.current = false;
    const nextSessionEpoch = deps.dialogSessionEpochRef.current + 1;
    deps.dialogSessionEpochRef.current = nextSessionEpoch;
    deps.dispatchDialogOrchestrator({
      type: 'session_starting',
      sessionEpoch: nextSessionEpoch,
      conversationId: nextConversationId,
      interactionMode: mode,
      replyChain: deps.replyChainMode,
      workMode: deps.androidDialogWorkMode,
    });
    deps.dispatchDialogOrchestrator({ type: 'generation_bump_command' });
    const { characterManifest, source: characterManifestSource } =
      await resolveDialogCharacterManifest(nextConversationId);
    await deps.androidSessionController.startConversation({
      inputMode,
      model: deps.VOICE_ASSISTANT_DIALOG_MODEL,
      speaker: deps.runtimeConfig.voice.speakerId,
      characterManifest,
      botName: deps.VOICE_ASSISTANT_DIALOG_BOT_NAME,
    });
    deps.providers.observability.log(
      'info',
      'dialog.session prompt resolved',
      deps.buildDialogLogContext({
        conversationId: nextConversationId,
        characterManifestSource,
        characterManifestLength: characterManifest.length,
      }),
    );
    if (!deps.isTestEnv) {
      const waitStartDeadline = Date.now() + deps.ANDROID_DIALOG_START_WAIT_MS;
      while (!deps.androidDialogSessionIdRef.current && Date.now() < waitStartDeadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
      }
    }
    deps.androidDialogModeRef.current = mode;
    deps.androidDialogConversationIdRef.current = nextConversationId;
    deps.providers.observability.log('info', 'dialog.session starting', deps.buildDialogLogContext());
    deps.recordAudit('session.starting', { extra: { inputMode } });
  };

  const stopAndroidDialogConversation = async (options?: { persistPendingAssistantDraft?: boolean }) => {
    if (!deps.useAndroidDialogRuntime) {
      return;
    }
    if (options?.persistPendingAssistantDraft ?? true) {
      await persistPendingAndroidAssistantDraft();
    }
    deps.androidReplyGenerationRef.current += 1;
    deps.rememberRetiredAndroidDialogSession(deps.androidDialogSessionIdRef.current);
    deps.androidDialogSessionIdRef.current = null;
    deps.androidDialogConversationIdRef.current = null;
    deps.androidDialogSessionReadyRef.current = false;
    deps.androidPlayerSpeakingRef.current = false;
    deps.androidDialogClientTtsEnabledRef.current = false;
    deps.androidDialogClientTtsSelectionEpochRef.current += 1;
    deps.androidDialogClientTtsSelectionPromiseRef.current = null;
    deps.androidDialogClientTtsSelectionReadyRef.current = false;
    deps.dispatchDialogOrchestrator({ type: 'session_stopping' });
    deps.dispatchDialogOrchestrator({ type: 'generation_bump_command' });
    await deps.androidSessionController.stopConversation();
    deps.androidDialogModeRef.current = null;
    deps.androidAssistantDraftRef.current = '';
    deps.setPendingAssistantReply('');
    deps.setLiveUserTranscript('');
    deps.recordAudit('session.stopped');
    deps.clearTurnTrace();
    deps.dispatchDialogOrchestrator({ type: 'session_stopped' });
  };

  const ensureAndroidClientTriggeredTts = async ({
    generation,
    source,
    maxRetries = deps.ANDROID_DIALOG_CLIENT_TTS_MAX_RETRIES,
    throwOnFailure = true,
    waitForReady = true,
  }: {
    generation?: number;
    source: 'asr_start';
    maxRetries?: number;
    throwOnFailure?: boolean;
    waitForReady?: boolean;
  }): Promise<boolean> => {
    return ensureAndroidClientTriggeredTtsFlow({
      useAndroidDialogRuntime: deps.useAndroidDialogRuntime,
      replyChainMode: deps.replyChainMode,
      waitForReady,
      androidDialogSessionReadyRef: deps.androidDialogSessionReadyRef,
      androidDialogClientTtsEnabledRef: deps.androidDialogClientTtsEnabledRef,
      callUseClientTriggeredTts: () => deps.androidSessionController.useClientTriggeredTts(),
      log: deps.providers.observability.log,
      buildDialogLogContext: deps.buildDialogLogContext,
      generation,
      source,
      maxRetries,
      throwOnFailure,
      retryDelayMs: deps.ANDROID_DIALOG_CLIENT_TTS_RETRY_DELAY_MS,
      readyWaitMs: deps.ANDROID_DIALOG_READY_WAIT_MS,
    });
  };

  const beginAndroidClientTtsSelectionForTurn = () => {
    if (!deps.useAndroidDialogRuntime || deps.replyChainMode !== 'custom_llm') {
      return;
    }
    if (deps.androidDialogModeRef.current !== 'voice') {
      return;
    }
    const selectionEpoch = deps.androidDialogClientTtsSelectionEpochRef.current + 1;
    deps.androidDialogClientTtsSelectionEpochRef.current = selectionEpoch;
    deps.androidDialogClientTtsSelectionReadyRef.current = false;
    deps.androidDialogClientTtsEnabledRef.current = false;
    const selectionPromise = ensureAndroidClientTriggeredTts({
      source: 'asr_start',
      maxRetries: deps.ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES,
      throwOnFailure: false,
    })
      .then((enabled) => {
        if (selectionEpoch !== deps.androidDialogClientTtsSelectionEpochRef.current) {
          return false;
        }
        deps.androidDialogClientTtsSelectionReadyRef.current = enabled;
        return enabled;
      })
      .catch((error) => {
        if (selectionEpoch !== deps.androidDialogClientTtsSelectionEpochRef.current) {
          return false;
        }
        const message = error instanceof Error ? error.message : 'unknown error';
        deps.providers.observability.log('warn', 'custom llm turn tts selection failed before reply', deps.buildDialogLogContext({ message, selectionEpoch }));
        deps.androidDialogClientTtsSelectionReadyRef.current = false;
        return false;
      });
    deps.androidDialogClientTtsSelectionPromiseRef.current = selectionPromise;
  };

  const awaitAndroidClientTtsSelectionForTurn = async (): Promise<boolean> => {
    if (!deps.useAndroidDialogRuntime || deps.replyChainMode !== 'custom_llm') {
      return false;
    }
    if (deps.androidDialogClientTtsSelectionReadyRef.current) {
      return true;
    }
    const selectionEpoch = deps.androidDialogClientTtsSelectionEpochRef.current;
    const selectionPromise = deps.androidDialogClientTtsSelectionPromiseRef.current;
    if (!selectionPromise) {
      return false;
    }
    try {
      const selected = await deps.withTimeout(
        selectionPromise,
        deps.ANDROID_DIALOG_CLIENT_TTS_SELECTION_WAIT_MS,
        'custom llm client tts selection wait timeout',
      );
      if (selectionEpoch !== deps.androidDialogClientTtsSelectionEpochRef.current) {
        return false;
      }
      return Boolean(selected && deps.androidDialogClientTtsSelectionReadyRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log('warn', 'custom llm turn tts selection wait failed', deps.buildDialogLogContext({ message, selectionEpoch }));
      return false;
    }
  };

  return {
    ensureAndroidDialogPrepared,
    persistPendingAndroidAssistantDraft,
    ensureAndroidDialogConversation,
    stopAndroidDialogConversation,
    ensureAndroidClientTriggeredTts,
    beginAndroidClientTtsSelectionForTurn,
    awaitAndroidClientTtsSelectionForTurn,
  };
}
