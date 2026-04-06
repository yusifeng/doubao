import { classifyClientTriggeredTtsError, parseDirectiveRet } from './dialog-orchestrator/replyDrivers/ttsArmingPolicy';

type BoolRef = { current: boolean };

export async function ensureAndroidClientTriggeredTts(params: {
  useAndroidDialogRuntime: boolean;
  replyChainMode: 'official_s2s' | 'custom_llm';
  waitForReady: boolean;
  androidDialogSessionReadyRef: BoolRef;
  androidDialogClientTtsEnabledRef: BoolRef;
  callUseClientTriggeredTts: () => Promise<void>;
  log: (level: 'info' | 'warn', message: string, context: Record<string, unknown>) => void;
  buildDialogLogContext: (extra?: Record<string, unknown>) => Record<string, unknown>;
  generation?: number;
  source: 'asr_start';
  maxRetries: number;
  throwOnFailure: boolean;
  retryDelayMs: number;
  readyWaitMs: number;
}): Promise<boolean> {
  const {
    useAndroidDialogRuntime,
    replyChainMode,
    waitForReady,
    androidDialogSessionReadyRef,
    androidDialogClientTtsEnabledRef,
    callUseClientTriggeredTts,
    log,
    buildDialogLogContext,
    generation,
    source,
    maxRetries,
    throwOnFailure,
    retryDelayMs,
    readyWaitMs,
  } = params;
  if (!useAndroidDialogRuntime || replyChainMode !== 'custom_llm') {
    return false;
  }

  if (waitForReady) {
    const waitReadyDeadline = Date.now() + readyWaitMs;
    while (!androidDialogSessionReadyRef.current && Date.now() < waitReadyDeadline) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30);
      });
    }
  }

  if (!androidDialogSessionReadyRef.current) {
    androidDialogClientTtsEnabledRef.current = false;
    log(
      'warn',
      'custom llm voice setup failed: dialog session not ready',
      buildDialogLogContext({
        generation,
        source,
        directiveName: 'useClientTriggeredTts',
      }),
    );
    if (throwOnFailure) {
      throw new Error('custom llm voice chain not ready');
    }
    return false;
  }

  if (androidDialogClientTtsEnabledRef.current) {
    return true;
  }

  let lastMessage = 'unknown error';
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await callUseClientTriggeredTts();
      androidDialogClientTtsEnabledRef.current = true;
      log(
        'info',
        'custom llm client tts enabled',
        buildDialogLogContext({
          generation,
          source,
          attempt,
          directiveName: 'useClientTriggeredTts',
          directiveRet: 0,
        }),
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      lastMessage = message;
      const directiveRet = parseDirectiveRet(message);
      const policy = classifyClientTriggeredTtsError(message);
      const alreadyClientMode = policy === 'already_enabled';
      if (alreadyClientMode) {
        // Some SDK builds return 400061 when the trigger mode is already client-side.
        androidDialogClientTtsEnabledRef.current = true;
        log(
          'info',
          'custom llm client tts already enabled',
          buildDialogLogContext({
            generation,
            source,
            attempt,
            directiveName: 'useClientTriggeredTts',
            directiveRet: directiveRet ?? 400061,
          }),
        );
        return true;
      }
      androidDialogClientTtsEnabledRef.current = false;
      const lower = message.toLowerCase();
      const shouldRetry =
        policy === 'not_ready' ||
        lower.includes('without init') ||
        lower.includes('not ready');
      log(
        'warn',
        'custom llm voice setup failed: cannot enable client tts',
        buildDialogLogContext({
          message,
          generation,
          source,
          attempt,
          shouldRetry,
          directiveName: 'useClientTriggeredTts',
          directiveRet,
        }),
      );
      if (!shouldRetry || attempt >= maxRetries) {
        break;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelayMs);
      });
    }
  }
  if (throwOnFailure) {
    throw new Error(`enable client tts failed: ${lastMessage}`);
  }
  return false;
}
