import { useEffect } from 'react';
import type { ConversationRepo } from '../repo/conversationRepo';
import type { RuntimeConfig } from '../config/runtimeConfig';
import { getEffectiveRuntimeConfig } from '../repo/runtimeConfigRepo';
import { isCompleteLLMConfig } from '../config/runtimeConfig';
import { isRuntimeConfigEqual } from '../config/runtimeConfig';
import { VOICE_FAULT_SIGNATURES, withFaultSignature } from '../service/faultSignature';

export function useRuntimeConfigHydrationEffect(params: {
  setRuntimeConfig: (value: any) => void;
  setRuntimeConfigHydrated: (value: boolean) => void;
  getRuntimeConfig: () => RuntimeConfig;
}) {
  useEffect(() => {
    let mounted = true;
    void (async () => {
      let nextRuntimeConfig: RuntimeConfig;
      try {
        nextRuntimeConfig = await getEffectiveRuntimeConfig();
      } catch {
        nextRuntimeConfig = params.getRuntimeConfig();
      }
      if (mounted) {
        params.setRuntimeConfig((current: RuntimeConfig) =>
          isRuntimeConfigEqual(current, nextRuntimeConfig) ? current : nextRuntimeConfig,
        );
        params.setRuntimeConfigHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
}

export function useBootstrapConversationEffect(params: {
  runtimeConfigHydrated: boolean;
  hasBootstrappedConversationRef: { current: boolean };
  repo: ConversationRepo;
  setConversations: (value: any) => void;
  setMessages: (value: any) => void;
  setActiveConversationId: (value: string | null) => void;
  getRuntimeConfig: () => RuntimeConfig;
}) {
  useEffect(() => {
    if (!params.runtimeConfigHydrated || params.hasBootstrappedConversationRef.current) {
      return;
    }
    params.hasBootstrappedConversationRef.current = true;
    let mounted = true;
    async function bootstrap() {
      const existingConversations = await params.repo.listConversations();
      if (existingConversations.length > 0) {
        if (!mounted) {
          return;
        }
        const first = existingConversations[0];
        if (!first) {
          return;
        }
        params.setConversations(existingConversations);
        params.setActiveConversationId(first.id);
        params.setMessages(await params.repo.listMessages(first.id));
        return;
      }
      const created = await params.repo.createConversation('默认会话', {
        systemPromptSnapshot: params.getRuntimeConfig().persona.systemPrompt,
      });
      const refreshedConversations = await params.repo.listConversations();
      if (!mounted) {
        return;
      }
      params.setConversations(refreshedConversations);
      params.setActiveConversationId(created.id);
      params.setMessages(await params.repo.listMessages(created.id));
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [params.runtimeConfigHydrated, params.repo]);
}

export function useCustomReplyConfigHintEffect(params: {
  replyChainMode: 'official_s2s' | 'custom_llm';
  llmConfig: RuntimeConfig['llm'];
  setConnectivityHint: (value: string) => void;
}) {
  useEffect(() => {
    if (params.replyChainMode !== 'custom_llm' || isCompleteLLMConfig(params.llmConfig)) {
      return;
    }
    params.setConnectivityHint(
      withFaultSignature(
        VOICE_FAULT_SIGNATURES.F8_REPLY_CHAIN_CONFIG_INCOMPLETE,
        '当前为 custom_llm 模式，但缺少 Base URL / API Key / Model 配置；已禁用兜底发送。',
      ),
    );
  }, [params.llmConfig, params.replyChainMode]);
}

export function useAndroidDialogListenerEffect(params: {
  useAndroidDialogRuntime: boolean;
  dialogEngine: { setListener: (listener: ((event: any) => void) | null) => void };
  androidDialogEventHandlerRef: { current: (event: any) => void };
}) {
  useEffect(() => {
    if (!params.useAndroidDialogRuntime) {
      return;
    }
    params.dialogEngine.setListener((event) => {
      params.androidDialogEventHandlerRef.current(event);
    });
    return () => {
      params.dialogEngine.setListener(null);
    };
  }, [params.dialogEngine, params.useAndroidDialogRuntime]);
}
