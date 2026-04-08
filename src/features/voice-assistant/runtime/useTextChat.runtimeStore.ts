import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { RuntimeConfig } from '../config/runtimeConfig';
import type { Conversation, ConversationStatus, Message } from '../types/model';
import type { RealtimeCallPhase, RealtimeListeningState } from './useTextChat.shared';

type StateSetter<T> = T | ((current: T) => T);

type VoiceAssistantRuntimeState = {
  runtimeStatus: ConversationStatus;
  runtimeConfig: RuntimeConfig;
  runtimeConfigHydrated: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isVoiceActive: boolean;
  isVoiceInputMuted: boolean;
  realtimeCallPhase: RealtimeCallPhase;
  realtimeListeningState: RealtimeListeningState;
  liveUserTranscript: string;
  pendingAssistantReply: string;
  connectivityHint: string;
  voiceDebugLastEvent: string;
  s2sSessionReady: boolean;
};

export type VoiceAssistantRuntimeStore = VoiceAssistantRuntimeState & {
  setRuntimeStatus: (next: StateSetter<ConversationStatus>) => void;
  setRuntimeConfig: (next: StateSetter<RuntimeConfig>) => void;
  setRuntimeConfigHydrated: (next: StateSetter<boolean>) => void;
  setConversations: (next: StateSetter<Conversation[]>) => void;
  setActiveConversationId: (next: StateSetter<string | null>) => void;
  setMessages: (next: StateSetter<Message[]>) => void;
  setIsVoiceActive: (next: StateSetter<boolean>) => void;
  setIsVoiceInputMuted: (next: StateSetter<boolean>) => void;
  setRealtimeCallPhase: (next: StateSetter<RealtimeCallPhase>) => void;
  setRealtimeListeningState: (next: StateSetter<RealtimeListeningState>) => void;
  setLiveUserTranscript: (next: StateSetter<string>) => void;
  setPendingAssistantReply: (next: StateSetter<string>) => void;
  setConnectivityHint: (next: StateSetter<string>) => void;
  setVoiceDebugLastEvent: (next: StateSetter<string>) => void;
  setS2SSessionReady: (next: StateSetter<boolean>) => void;
};

export type VoiceAssistantRuntimeStoreApi = StoreApi<VoiceAssistantRuntimeStore>;

function resolveSetter<T>(current: T, next: StateSetter<T>): T {
  if (typeof next === 'function') {
    return (next as (value: T) => T)(current);
  }
  return next;
}

export function createVoiceAssistantRuntimeStore(
  initialRuntimeConfig: RuntimeConfig,
): VoiceAssistantRuntimeStoreApi {
  return createStore<VoiceAssistantRuntimeStore>((set) => ({
    runtimeStatus: 'idle',
    runtimeConfig: initialRuntimeConfig,
    runtimeConfigHydrated: false,
    conversations: [],
    activeConversationId: null,
    messages: [],
    isVoiceActive: false,
    isVoiceInputMuted: false,
    realtimeCallPhase: 'idle',
    realtimeListeningState: 'ready',
    liveUserTranscript: '',
    pendingAssistantReply: '',
    connectivityHint: '尚未测试连接',
    voiceDebugLastEvent: 'none',
    s2sSessionReady: false,
    setRuntimeStatus: (next) =>
      set((current) => ({
        runtimeStatus: resolveSetter(current.runtimeStatus, next),
      })),
    setRuntimeConfig: (next) =>
      set((current) => ({
        runtimeConfig: resolveSetter(current.runtimeConfig, next),
      })),
    setRuntimeConfigHydrated: (next) =>
      set((current) => ({
        runtimeConfigHydrated: resolveSetter(current.runtimeConfigHydrated, next),
      })),
    setConversations: (next) =>
      set((current) => ({
        conversations: resolveSetter(current.conversations, next),
      })),
    setActiveConversationId: (next) =>
      set((current) => ({
        activeConversationId: resolveSetter(current.activeConversationId, next),
      })),
    setMessages: (next) =>
      set((current) => ({
        messages: resolveSetter(current.messages, next),
      })),
    setIsVoiceActive: (next) =>
      set((current) => ({
        isVoiceActive: resolveSetter(current.isVoiceActive, next),
      })),
    setIsVoiceInputMuted: (next) =>
      set((current) => ({
        isVoiceInputMuted: resolveSetter(current.isVoiceInputMuted, next),
      })),
    setRealtimeCallPhase: (next) =>
      set((current) => ({
        realtimeCallPhase: resolveSetter(current.realtimeCallPhase, next),
      })),
    setRealtimeListeningState: (next) =>
      set((current) => ({
        realtimeListeningState: resolveSetter(current.realtimeListeningState, next),
      })),
    setLiveUserTranscript: (next) =>
      set((current) => ({
        liveUserTranscript: resolveSetter(current.liveUserTranscript, next),
      })),
    setPendingAssistantReply: (next) =>
      set((current) => ({
        pendingAssistantReply: resolveSetter(current.pendingAssistantReply, next),
      })),
    setConnectivityHint: (next) =>
      set((current) => ({
        connectivityHint: resolveSetter(current.connectivityHint, next),
      })),
    setVoiceDebugLastEvent: (next) =>
      set((current) => ({
        voiceDebugLastEvent: resolveSetter(current.voiceDebugLastEvent, next),
      })),
    setS2SSessionReady: (next) =>
      set((current) => ({
        s2sSessionReady: resolveSetter(current.s2sSessionReady, next),
      })),
  }));
}
