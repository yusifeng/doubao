import { Platform } from 'react-native';
import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';
import { VOICE_FAULT_SIGNATURES, withFaultSignature } from '../service/faultSignature';
import { maskSecret } from '../config/env';
import { createVoiceAssistantProviders } from './providers';
import { OpenAICompatibleReplyProvider } from '../../../core/providers/reply/openaiCompatible';
import { KONAN_CHARACTER_MANIFEST } from '../../../character/konanManifest';
import {
  VOICE_ASSISTANT_DIALOG_BOT_NAME,
  VOICE_ASSISTANT_DIALOG_MODEL,
} from '../config/constants';
import type { Message } from '../types/model';
import type {
  RuntimeConfig,
  RuntimeConfigDraft,
  RuntimeLLMConfig,
  RuntimeS2SConfig,
} from '../config/runtimeConfig';
import { isCompleteLLMConfig, isCompleteS2SConfig } from '../config/runtimeConfig';
import {
  buildRuntimeConfigForSave,
  saveRuntimeConfig as persistRuntimeConfig,
  validateRuntimeConfigForSave,
} from '../repo/runtimeConfigRepo';
import { resolveConversationSystemPrompt, withTimeout } from './useTextChat.shared';
import type { GenerateReplyInput, TextRoundInput } from './useTextChat.contracts';

export function createTextPipelineHandlers(deps: {
  conversations: any[];
  repo: any;
  providers: any;
  runtimeConfig: RuntimeConfig;
  llmConfig: RuntimeLLMConfig;
  useCustomReplyProvider: boolean;
  useCustomVoiceS2STts: boolean;
  useAndroidDialogTextRuntime: boolean;
  activeConversationId: string | null;
  isVoiceActive: boolean;
  ensureS2SSession: () => Promise<void>;
  ensureTurnTrace: (seed?: { traceId?: string; questionId?: string; replyId?: string }) => {
    traceId: string;
    questionId?: string;
    replyId?: string;
  };
  clearTurnTrace: () => void;
  createTurnTraceId: (seed: { turnId: number; sessionEpoch: number }) => string;
  setPendingAssistantReply: (value: string) => void;
  setLiveUserTranscript: (value: string) => void;
  setConnectivityHint: (value: string) => void;
  setConversations: (value: any[]) => void;
  updateConversationRuntimeStatus: (status: any, options?: { refreshConversations?: boolean }) => Promise<void>;
  syncConversationState: () => Promise<void>;
  resetRealtimeCallState: () => void;
  withCallLifecycleLock: (task: () => Promise<void>, options?: { waitIfLocked?: boolean }) => Promise<void>;
  ensureAndroidDialogConversation: (mode: 'voice' | 'text', options?: { forceRestart?: boolean }) => Promise<void>;
  stopAndroidDialogConversation: () => Promise<void>;
  androidSessionController: any;
  orchestratorStateRef: { current: any };
  androidDialogSessionIdRef: { current: string | null };
  recordAudit: (stage: any, options?: any) => void;
  toAudioErrorMessage: (message: string, fallback: string) => string;
}) {
  const generateAssistantReplyFromProvider = async ({
    userText,
    mode,
    conversationId,
    fallbackToS2S,
  }: GenerateReplyInput): Promise<string> => {
    const conversation = deps.conversations.find((item) => item.id === conversationId) ?? null;
    if (conversation && !conversation.systemPromptSnapshot?.trim()) {
      await deps.repo.updateConversationSystemPromptSnapshot(conversationId, KONAN_CHARACTER_MANIFEST);
      deps.setConversations(await deps.repo.listConversations());
    }
    const currentMessages = await deps.repo.listMessages(conversationId);
    const effectiveSystemPrompt = resolveConversationSystemPrompt(conversation);
    const trace = deps.ensureTurnTrace();

    if (deps.runtimeConfig.replyChainMode === 'official_s2s' && !deps.useCustomReplyProvider) {
      await deps.ensureS2SSession();
      if (deps.runtimeConfig.replyStreamMode === 'force_non_stream') {
        const serverReply = await deps.providers.s2s.sendTextQuery(userText);
        return sanitizeAssistantText(serverReply?.trim() ?? '');
      }
      let partialAssistantText = '';
      try {
        const serverReply = await deps.providers.s2s.sendTextQuery(userText, {
          onPartialText: (partialText: string) => {
            const normalized = partialText.trim();
            if (!normalized) {
              return;
            }
            partialAssistantText = normalized;
            deps.setPendingAssistantReply(normalized);
            void deps.updateConversationRuntimeStatus('speaking');
          },
        });
        return sanitizeAssistantText(serverReply?.trim() || partialAssistantText);
      } finally {
        deps.setPendingAssistantReply('');
      }
    }

    let assistantText = '';
    let emittedChunk = false;

    try {
      for await (const chunk of deps.providers.reply.generateReplyStream({
        userText,
        mode,
        conversation,
        messages: currentMessages,
        systemPrompt: effectiveSystemPrompt,
        trace: {
          traceId: trace.traceId,
          questionId: trace.questionId,
          replyId: trace.replyId,
          sessionId: deps.orchestratorStateRef.current.session.sdkSessionId ?? deps.androidDialogSessionIdRef.current,
          dialogId: deps.orchestratorStateRef.current.session.dialogId,
          turnId: deps.orchestratorStateRef.current.turn.turnId,
        },
      })) {
        if (!chunk) {
          continue;
        }
        emittedChunk = true;
        assistantText += chunk;
        deps.setPendingAssistantReply(assistantText);
        await deps.updateConversationRuntimeStatus('speaking');
      }
    } finally {
      deps.setPendingAssistantReply('');
    }

    if (emittedChunk) {
      return sanitizeAssistantText(assistantText.trim());
    }
    if (!fallbackToS2S) {
      return '';
    }
    await deps.ensureS2SSession();
    const serverReply = await deps.providers.s2s.sendTextQuery(userText);
    return sanitizeAssistantText(serverReply?.trim() ?? '');
  };

  const runTextRound = async ({
    content,
    userMessageType,
    assistantMessageType,
  }: TextRoundInput) => {
    if (!deps.activeConversationId) {
      return;
    }
    const clean = content.trim();
    if (!clean) {
      return;
    }

    await deps.updateConversationRuntimeStatus('thinking');
    await deps.repo.appendMessage(deps.activeConversationId, {
      conversationId: deps.activeConversationId,
      role: 'user',
      content: clean,
      type: userMessageType,
    });
    await deps.syncConversationState();
    deps.setPendingAssistantReply('');

    try {
      const assistantText = await generateAssistantReplyFromProvider({
        userText: clean,
        mode: userMessageType === 'audio' ? 'voice' : 'text',
        conversationId: deps.activeConversationId,
        fallbackToS2S: !deps.useCustomReplyProvider,
      });
      if (!assistantText) {
        throw new Error('empty assistant response for current reply chain');
      }

      if (deps.useCustomReplyProvider) {
        deps.setConnectivityHint(
          `回复来源：自定义LLM（${deps.llmConfig.provider || 'openai-compatible'} / ${deps.llmConfig.model || 'unknown'}）`,
        );
      }
      await deps.repo.appendMessage(deps.activeConversationId, {
        conversationId: deps.activeConversationId,
        role: 'assistant',
        content: assistantText,
        type: assistantMessageType,
      });
      await deps.updateConversationRuntimeStatus('speaking');
      if (assistantMessageType === 'audio') {
        if (deps.useCustomVoiceS2STts) {
          let playedByS2SVoice = false;
          try {
            await deps.androidSessionController.prepare({ dialogWorkMode: 'delegate_chat_tts_text' });
            await deps.androidSessionController.startConversation({
              inputMode: 'text',
              model: VOICE_ASSISTANT_DIALOG_MODEL,
              speaker: deps.runtimeConfig.voice.speakerId,
              characterManifest: KONAN_CHARACTER_MANIFEST,
              botName: VOICE_ASSISTANT_DIALOG_BOT_NAME,
            });
            await deps.androidSessionController.useClientTriggeredTts();
            await deps.androidSessionController.streamClientTtsText({
              start: true,
              content: assistantText,
              end: true,
            });
            playedByS2SVoice = true;
            deps.setConnectivityHint('语音播报来源：S2S Voice（custom_llm 文本）');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            deps.providers.observability.log('warn', 'failed to speak assistant text via s2s voice', { message });
          } finally {
            try {
              await deps.androidSessionController.stopConversation();
            } catch {}
          }
          if (!playedByS2SVoice) {
            deps.setConnectivityHint('文本已生成，S2S语音播报不可用。');
          }
        } else {
          await deps.providers.audio.speak(assistantText);
        }
      }
    } finally {
      deps.setPendingAssistantReply('');
    }
  };

  const sendText = async (text: string) => {
    const content = text.trim();
    if (!content || !deps.activeConversationId) {
      return;
    }
    if (deps.runtimeConfig.replyChainMode === 'custom_llm' && !deps.useCustomReplyProvider) {
      const message = 'custom_llm 配置不完整（Base URL / API Key / Model），已阻止发送且不做链路兜底。';
      deps.setConnectivityHint(
        withFaultSignature(VOICE_FAULT_SIGNATURES.F8_REPLY_CHAIN_CONFIG_INCOMPLETE, message),
      );
      await deps.updateConversationRuntimeStatus('error');
      await deps.repo.appendMessage(deps.activeConversationId, {
        conversationId: deps.activeConversationId,
        role: 'assistant',
        content: '当前 custom_llm 配置不完整，请补全 Base URL / API Key / Model 后重试。',
        type: 'text',
      });
      await deps.syncConversationState();
      return;
    }
    if (deps.runtimeConfig.replyChainMode === 'official_s2s' && !isCompleteS2SConfig(deps.runtimeConfig.s2s)) {
      const message = 'official_s2s 配置不完整（缺少 App ID / Access Token），已阻止发送且不做链路兜底。';
      deps.setConnectivityHint(
        withFaultSignature(VOICE_FAULT_SIGNATURES.F8_REPLY_CHAIN_CONFIG_INCOMPLETE, message),
      );
      await deps.updateConversationRuntimeStatus('error');
      await deps.repo.appendMessage(deps.activeConversationId, {
        conversationId: deps.activeConversationId,
        role: 'assistant',
        content: '当前 official_s2s 配置不完整，请补全 App ID / Access Token 后重试。',
        type: 'text',
      });
      await deps.syncConversationState();
      return;
    }
    let shouldFinalizeImmediately = true;
    deps.clearTurnTrace();
    deps.ensureTurnTrace({
      traceId: deps.createTurnTraceId({
        turnId: deps.orchestratorStateRef.current.turn.turnId + 1,
        sessionEpoch: deps.orchestratorStateRef.current.session.sessionEpoch,
      }),
    });
    deps.recordAudit('turn.started', {
      extra: { sourceEventType: 'send_text', textLength: content.length },
    });
    deps.recordAudit('turn.user_final', {
      extra: { sourceEventType: 'send_text', textLength: content.length },
    });

    deps.providers.observability.log('info', 'send text query', { content });
    try {
      if (deps.useAndroidDialogTextRuntime) {
        await deps.withCallLifecycleLock(async () => {
          deps.setLiveUserTranscript('');
          deps.setPendingAssistantReply('');
          await deps.repo.appendMessage(deps.activeConversationId!, {
            conversationId: deps.activeConversationId!,
            role: 'user',
            content,
            type: 'text',
          });
          await deps.syncConversationState();
          await deps.ensureAndroidDialogConversation('text', { forceRestart: true });
          await deps.updateConversationRuntimeStatus('thinking', { refreshConversations: true });
          await deps.androidSessionController.sendTextQuery(content);
        }, { waitIfLocked: true });
        shouldFinalizeImmediately = false;
        return;
      }
      await runTextRound({
        content,
        userMessageType: 'text',
        assistantMessageType: 'text',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log('warn', 'failed to process text round', { message });
      deps.setConnectivityHint(
        withFaultSignature(
          VOICE_FAULT_SIGNATURES.F7_TEXT_ROUND_FAILED,
          `本轮文本对话失败，请检查网络后重试。(${message})`,
        ),
      );
      if (deps.useAndroidDialogTextRuntime) {
        await deps.stopAndroidDialogConversation();
        deps.resetRealtimeCallState();
      }
      await deps.updateConversationRuntimeStatus('error');
      await deps.repo.appendMessage(deps.activeConversationId!, {
        conversationId: deps.activeConversationId!,
        role: 'assistant',
        content: '本轮文本对话失败，请检查网络后重试。',
        type: 'text',
      });
      await deps.syncConversationState();
    } finally {
      if (shouldFinalizeImmediately) {
        await deps.updateConversationRuntimeStatus('idle');
        await deps.syncConversationState();
      }
    }
  };

  const saveRuntimeConfig = async (draft: RuntimeConfigDraft) => {
    const validationErrors = validateRuntimeConfigForSave(deps.runtimeConfig, draft);
    if (validationErrors.length > 0) {
      const message = validationErrors[0] ?? '配置校验失败';
      deps.setConnectivityHint(message);
      return { ok: false, message };
    }
    const nextConfig = buildRuntimeConfigForSave(deps.runtimeConfig, draft);
    await persistRuntimeConfig(nextConfig);
    const message = deps.isVoiceActive
      ? '配置已保存。当前语音通话请先挂断后重连生效。'
      : '配置已保存，后续请求将使用新配置。';
    deps.setConnectivityHint(message);
    return { ok: true, message, nextConfig };
  };

  const testLLMConfig = async (input?: Partial<RuntimeLLMConfig>) => {
    const llmConfigToTest: RuntimeLLMConfig = {
      ...deps.runtimeConfig.llm,
      ...input,
      provider: (input?.provider ?? deps.runtimeConfig.llm.provider ?? 'openai-compatible').trim() || 'openai-compatible',
    };
    if (!isCompleteLLMConfig(llmConfigToTest)) {
      const message = '请先补全 Base URL / API Key / Model。';
      deps.setConnectivityHint(message);
      return { ok: false, message };
    }
    try {
      const provider = new OpenAICompatibleReplyProvider({
        ...llmConfigToTest,
        streamMode: deps.runtimeConfig.replyStreamMode,
      });
      await withTimeout(
        (async () => {
          let generated = '';
          for await (const chunk of provider.generateReplyStream({
            userText: 'ping',
            mode: 'text',
            conversation: null,
            messages: [],
            systemPrompt: deps.runtimeConfig.persona.systemPrompt,
          })) {
            generated += chunk;
            if (generated.trim().length > 0) {
              break;
            }
          }
        })(),
        12000,
        '请求超时（12s）',
      );
      const message = `LLM 连接成功（${llmConfigToTest.provider || 'openai-compatible'} / ${llmConfigToTest.model}）`;
      deps.setConnectivityHint(message);
      return { ok: true, message };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      const message = `LLM 连接失败：${reason}`;
      deps.setConnectivityHint(message);
      return { ok: false, message };
    }
  };

  const testS2SConnection = async (input?: Partial<RuntimeS2SConfig>) => {
    const s2sConfigToTest: RuntimeS2SConfig = {
      ...deps.runtimeConfig.s2s,
      ...input,
    };
    if (!isCompleteS2SConfig(s2sConfigToTest)) {
      const message = '缺少 App ID / Access Token';
      deps.setConnectivityHint(message);
      return { ok: false, message };
    }
    const configToTest = buildRuntimeConfigForSave(deps.runtimeConfig, { s2s: s2sConfigToTest });
    const tempProviders = createVoiceAssistantProviders(configToTest);
    const tempAndroidDialogSupported = Platform.OS === 'android' && tempProviders.dialogEngine.isSupported();
    try {
      if (tempAndroidDialogSupported && configToTest.replyChainMode === 'official_s2s') {
        await tempProviders.dialogEngine.prepare({ dialogWorkMode: 'default' });
        await tempProviders.dialogEngine.startConversation({
          inputMode: 'text',
          model: VOICE_ASSISTANT_DIALOG_MODEL,
          speaker: configToTest.voice.speakerId,
          characterManifest: KONAN_CHARACTER_MANIFEST,
          botName: VOICE_ASSISTANT_DIALOG_BOT_NAME,
        });
        await tempProviders.dialogEngine.stopConversation();
        const message = `Android Dialog SDK 可用，app=${s2sConfigToTest.appId} token=${maskSecret(s2sConfigToTest.accessToken)}`;
        deps.setConnectivityHint(message);
        return { ok: true, message };
      }
      await tempProviders.s2s.connect();
      await tempProviders.s2s.startSession();
      await tempProviders.s2s.disconnect();
      const message = `S2S 连接成功，app=${s2sConfigToTest.appId} token=${maskSecret(s2sConfigToTest.accessToken)}`;
      deps.setConnectivityHint(message);
      return { ok: true, message };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      const message = `S2S 连接失败：${reason}`;
      deps.setConnectivityHint(message);
      return { ok: false, message };
    } finally {
      if (tempProviders.s2s !== deps.providers.s2s) {
        await tempProviders.s2s.disconnect().catch(() => undefined);
      }
      await tempProviders.dialogEngine.destroy().catch(() => undefined);
    }
  };

  return {
    generateAssistantReplyFromProvider,
    runTextRound,
    sendText,
    saveRuntimeConfig,
    testLLMConfig,
    testS2SConnection,
  };
}
