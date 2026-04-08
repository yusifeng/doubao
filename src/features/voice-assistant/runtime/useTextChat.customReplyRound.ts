import { buildAssistantReply } from '../service/useCases';
import { sanitizeAssistantText } from '../service/assistantText';
import { VOICE_FAULT_SIGNATURES, withFaultSignature } from '../service/faultSignature';

type LlmConfig = {
  provider?: string;
  model?: string;
};

type TraceContext = {
  traceId: string;
  questionId?: string;
  replyId?: string;
};

export async function runCustomLlmReplyRound(params: {
  generation: number;
  getCurrentGeneration: () => number;
  userText: string;
  mode: 'text' | 'voice';
  conversation: unknown;
  currentMessages: unknown[];
  effectiveSystemPrompt: string;
  trace: TraceContext;
  sdkSessionId: string | null;
  dialogId: string | null;
  turnId: number;
  llmConfig: LlmConfig;
  replyChainMode: 'official_s2s' | 'custom_llm';
  assistantMessageType: 'audio' | 'text';
  initialCanStreamViaClientTts: boolean;
  generateReplyStream: (input: {
    userText: string;
    mode: 'text' | 'voice';
    conversation: unknown;
    messages: unknown[];
    systemPrompt: string;
    trace: {
      traceId: string;
      questionId?: string;
      replyId?: string;
      sessionId: string | null;
      dialogId: string | null;
      turnId: number;
    };
  }) => AsyncIterable<string>;
  streamClientTtsText: (payload: { start: boolean; content: string; end: boolean }) => Promise<void>;
  interruptCurrentDialog: () => Promise<void>;
  setPendingAssistantReply: (value: string) => void;
  setConnectivityHint: (value: string) => void;
  disableClientTtsFlag: () => void;
  markClientTtsStreamStarted: () => void;
  dispatchDraftReplyDelta: (chunk: string) => void;
  dispatchDraftReplyFinalized: () => void;
  dispatchTurnInterrupted: () => void;
  persistAssistantText: (raw: string) => Promise<void>;
  syncConversationState: () => Promise<void>;
  appendFailureAssistantMessage: () => Promise<void>;
  log: (level: 'info' | 'warn', message: string, context?: Record<string, unknown>) => void;
  buildDialogLogContext: (extra?: Record<string, unknown>) => Record<string, unknown>;
  recordAudit: (
    stage: string,
    options?: {
      level?: 'info' | 'warn' | 'error';
      message?: string;
      extra?: Record<string, unknown>;
    },
  ) => void;
}): Promise<{ assistantText: string; assistantPersisted: boolean; abortedByGeneration: boolean }> {
  const {
    generation,
    getCurrentGeneration,
    userText,
    mode,
    conversation,
    currentMessages,
    effectiveSystemPrompt,
    trace,
    sdkSessionId,
    dialogId,
    turnId,
    llmConfig,
    replyChainMode,
    assistantMessageType,
    initialCanStreamViaClientTts,
    generateReplyStream,
    streamClientTtsText,
    interruptCurrentDialog,
    setPendingAssistantReply,
    setConnectivityHint,
    disableClientTtsFlag,
    markClientTtsStreamStarted,
    dispatchDraftReplyDelta,
    dispatchDraftReplyFinalized,
    dispatchTurnInterrupted,
    persistAssistantText,
    syncConversationState,
    appendFailureAssistantMessage,
    log,
    buildDialogLogContext,
    recordAudit,
  } = params;

  let assistantText = '';
  let started = false;
  let assistantPersisted = false;
  let canStreamViaClientTts = initialCanStreamViaClientTts;

  if (replyChainMode === 'custom_llm' && !canStreamViaClientTts) {
    log(
      'warn',
      'custom llm voice round aborted: client tts not selected for current turn',
      buildDialogLogContext({ generation }),
    );
    throw new Error('custom llm client tts not selected');
  }

  try {
    for await (const chunk of generateReplyStream({
      userText,
      mode,
      conversation,
      messages: currentMessages,
      systemPrompt: effectiveSystemPrompt,
      trace: {
        traceId: trace.traceId,
        questionId: trace.questionId,
        replyId: trace.replyId,
        sessionId: sdkSessionId,
        dialogId,
        turnId,
      },
    })) {
      if (generation !== getCurrentGeneration()) {
        if (assistantText.trim()) {
          await persistAssistantText(assistantText);
          assistantPersisted = true;
        }
        setPendingAssistantReply('');
        await syncConversationState();
        return { assistantText, assistantPersisted, abortedByGeneration: true };
      }
      if (!chunk) {
        continue;
      }
      assistantText += chunk;
      setPendingAssistantReply(assistantText);
      dispatchDraftReplyDelta(chunk);
      if (!started) {
        log('info', 'custom llm voice round started', {
          provider: llmConfig.provider || 'openai-compatible',
          model: llmConfig.model || 'unknown',
          streamToS2SVoice: canStreamViaClientTts,
        });
        recordAudit('reply.custom.first_chunk', {
          extra: {
            chunkLength: chunk.length,
            streamToS2SVoice: canStreamViaClientTts,
          },
        });
        if (canStreamViaClientTts) {
          setConnectivityHint(
            `语音回复来源：自定义LLM（${llmConfig.provider || 'openai-compatible'} / ${llmConfig.model || 'unknown'}）`,
          );
        }
      }
      if (canStreamViaClientTts) {
        try {
          const isFirstClientTtsChunk = !started;
          await streamClientTtsText({
            start: isFirstClientTtsChunk,
            content: chunk,
            end: false,
          });
          if (isFirstClientTtsChunk) {
            markClientTtsStreamStarted();
          }
          started = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          log(
            'warn',
            'stream client tts failed; continue with custom text only',
            buildDialogLogContext({
              message,
              generation,
            }),
          );
          canStreamViaClientTts = false;
          disableClientTtsFlag();
          setConnectivityHint(
            withFaultSignature(
              VOICE_FAULT_SIGNATURES.F11_CUSTOM_REPLY_ROUND_FAILED,
              '自定义LLM文本已生成，S2S语音播报中断。',
            ),
          );
          try {
            await interruptCurrentDialog();
          } catch {
            // Best effort: platform voice may already be stopped.
          }
        }
      }
    }

    if (generation !== getCurrentGeneration()) {
      if (assistantText.trim()) {
        await persistAssistantText(assistantText);
        assistantPersisted = true;
      }
      setPendingAssistantReply('');
      await syncConversationState();
      return { assistantText, assistantPersisted, abortedByGeneration: true };
    }

    if (canStreamViaClientTts) {
      await streamClientTtsText({
        start: !started,
        content: '',
        end: true,
      });
    }

    const finalAssistantText = sanitizeAssistantText(
      assistantText.trim() || (replyChainMode === 'custom_llm' ? '' : buildAssistantReply(userText)),
    );
    if (!finalAssistantText) {
      throw new Error('custom llm returned empty response');
    }
    recordAudit('reply.custom.final', {
      extra: {
        textLength: finalAssistantText.length,
        streamedByS2S: canStreamViaClientTts,
      },
    });
    setPendingAssistantReply('');
    await persistAssistantText(finalAssistantText);
    assistantPersisted = true;
    dispatchDraftReplyFinalized();
    if (assistantMessageType === 'audio' && !canStreamViaClientTts) {
      log('warn', 'custom llm s2s voice unavailable; skip local tts fallback', {
        generation,
      });
      setConnectivityHint(
        withFaultSignature(
          VOICE_FAULT_SIGNATURES.F2_CLIENT_TTS_NOT_READY,
          '自定义LLM文本已生成，S2S语音播报未就绪。',
        ),
      );
    }
    return { assistantText, assistantPersisted, abortedByGeneration: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    log('warn', 'custom llm voice round failed after partial stream', {
      message,
      streamedLength: assistantText.length,
    });
    recordAudit('reply.custom.failed', {
      level: 'warn',
      message,
      extra: {
        streamedLength: assistantText.length,
      },
    });
    const partialText = sanitizeAssistantText(assistantText.trim());
    if (partialText) {
      await persistAssistantText(partialText);
      assistantPersisted = true;
    }
    if (replyChainMode === 'custom_llm' && !partialText && !assistantPersisted) {
      disableClientTtsFlag();
      try {
        await interruptCurrentDialog();
      } catch (interruptError) {
        const interruptErrorMessage =
          interruptError instanceof Error ? interruptError.message : 'unknown error';
        log(
          'warn',
          'failed to interrupt platform voice after custom failure',
          buildDialogLogContext({ message: interruptErrorMessage }),
        );
      }
      setConnectivityHint(
        withFaultSignature(
          VOICE_FAULT_SIGNATURES.F11_CUSTOM_REPLY_ROUND_FAILED,
          '自定义LLM语音回复失败，请重试。',
        ),
      );
      await appendFailureAssistantMessage();
      assistantPersisted = true;
    }
    setPendingAssistantReply('');
    dispatchTurnInterrupted();
    return { assistantText, assistantPersisted, abortedByGeneration: false };
  }
}
