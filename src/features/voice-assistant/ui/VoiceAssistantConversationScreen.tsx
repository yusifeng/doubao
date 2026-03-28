import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  voiceAssistantConversationThemeClass,
  voiceAssistantThemeStyle,
} from '../../../core/theme/mappers';
import type { UseTextChatResult } from '../runtime/useTextChat';
import type { Message } from '../types/model';
import { VoiceAssistantMessageBubble } from './VoiceAssistantMessageBubble';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';
import { VoiceAssistantScreen } from './VoiceAssistantScreen';

type ConversationScreenMode = 'text' | 'voice';

type VoiceAssistantConversationScreenProps = {
  session: UseTextChatResult;
  mode: ConversationScreenMode;
  onChangeMode: (mode: ConversationScreenMode) => void;
  onOpenDrawer: () => void;
};

export function VoiceAssistantConversationScreen({
  session,
  mode,
  onChangeMode,
  onOpenDrawer,
}: VoiceAssistantConversationScreenProps) {
  const [draft, setDraft] = useState('');
  const [voiceDisplayMode, setVoiceDisplayMode] = useState<'avatar' | 'dialogue'>('avatar');
  const voiceToggleInFlightRef = useRef(false);
  const previousModeRef = useRef<ConversationScreenMode | null>(null);
  const shouldRecoverVoiceAfterStopRef = useRef(false);
  const pendingStopAfterInFlightRef = useRef(false);
  const pendingStartWhenConversationReadyRef = useRef(false);
  const modeRef = useRef(mode);
  const voiceActiveRef = useRef(session.isVoiceActive);

  const activeConversation = useMemo(
    () => session.conversations.find((conversation) => conversation.id === session.activeConversationId) ?? null,
    [session.activeConversationId, session.conversations],
  );
  const pendingAssistantMessage = useMemo<Message | null>(() => {
    const raw = session.pendingAssistantReply.trim();
    if (!raw && session.status !== 'thinking') {
      return null;
    }
    if (!session.activeConversationId) {
      return null;
    }
    return {
      id: 'pending-assistant-reply',
      conversationId: session.activeConversationId,
      role: 'assistant',
      content: raw || '思考中...',
      type: 'text',
      createdAt: Date.now(),
    };
  }, [session.activeConversationId, session.pendingAssistantReply, session.status]);

  const canSend = draft.trim().length > 0;

  useEffect(() => {
    if (mode !== 'voice') {
      setVoiceDisplayMode('avatar');
    }
  }, [mode]);

  useEffect(() => {
    modeRef.current = mode;
    voiceActiveRef.current = session.isVoiceActive;
  }, [mode, session.isVoiceActive]);

  const maybeRecoverVoiceAfterStop = useCallback(() => {
    if (
      !shouldRecoverVoiceAfterStopRef.current ||
      modeRef.current !== 'voice' ||
      voiceActiveRef.current ||
      voiceToggleInFlightRef.current
    ) {
      return;
    }
    shouldRecoverVoiceAfterStopRef.current = false;
    voiceToggleInFlightRef.current = true;
    void session.toggleVoice().catch(() => {
      // Best effort: retry is handled by subsequent mode transitions.
    }).finally(() => {
      voiceToggleInFlightRef.current = false;
    });
  }, [session.toggleVoice]);

  const maybeStopAfterInFlight = useCallback(() => {
    if (!pendingStopAfterInFlightRef.current || voiceToggleInFlightRef.current) {
      return;
    }
    if (modeRef.current === 'voice') {
      return;
    }
    if (!voiceActiveRef.current) {
      return;
    }
    pendingStopAfterInFlightRef.current = false;
    voiceToggleInFlightRef.current = true;
    void session.toggleVoice().catch(() => {
      // Best effort: if delayed shutdown fails, next mode transition will retry.
    }).finally(() => {
      voiceToggleInFlightRef.current = false;
    });
  }, [session.toggleVoice]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;

    if (mode !== 'voice') {
      shouldRecoverVoiceAfterStopRef.current = false;
      pendingStartWhenConversationReadyRef.current = false;
    } else {
      pendingStopAfterInFlightRef.current = false;
    }

    const enteringVoice = previousMode !== 'voice' && mode === 'voice';
    const leavingVoice = previousMode === 'voice' && mode !== 'voice';

    if (leavingVoice) {
      if (voiceToggleInFlightRef.current) {
        pendingStopAfterInFlightRef.current = true;
        return;
      }
      if (!session.isVoiceActive) {
        pendingStopAfterInFlightRef.current = false;
        return;
      }
      voiceToggleInFlightRef.current = true;
      void session.toggleVoice().catch(() => {
        // Best effort: if shutdown fails, runtime state will still be reconciled by hook internals.
      }).finally(() => {
        voiceToggleInFlightRef.current = false;
        maybeStopAfterInFlight();
        maybeRecoverVoiceAfterStop();
      });
      return;
    }

    if (!enteringVoice) {
      return;
    }

    if (voiceToggleInFlightRef.current) {
      shouldRecoverVoiceAfterStopRef.current = true;
      return;
    }

    if (session.isVoiceActive) {
      return;
    }
    if (!session.activeConversationId) {
      pendingStartWhenConversationReadyRef.current = true;
      return;
    }

    voiceToggleInFlightRef.current = true;
    pendingStartWhenConversationReadyRef.current = false;
    void session.toggleVoice().catch(() => {
      // Best effort: if startup fails, user can retry from the voice screen.
    }).finally(() => {
      voiceToggleInFlightRef.current = false;
      maybeStopAfterInFlight();
      maybeRecoverVoiceAfterStop();
    });
  }, [
    maybeRecoverVoiceAfterStop,
    maybeStopAfterInFlight,
    mode,
    session.activeConversationId,
    session.isVoiceActive,
    session.toggleVoice,
  ]);

  useEffect(() => {
    maybeStopAfterInFlight();
    maybeRecoverVoiceAfterStop();
  }, [maybeRecoverVoiceAfterStop, maybeStopAfterInFlight, mode, session.isVoiceActive]);

  useEffect(() => {
    if (
      mode !== 'voice' ||
      !pendingStartWhenConversationReadyRef.current ||
      !session.activeConversationId ||
      session.isVoiceActive ||
      voiceToggleInFlightRef.current
    ) {
      return;
    }
    pendingStartWhenConversationReadyRef.current = false;
    voiceToggleInFlightRef.current = true;
    void session.toggleVoice().catch(() => {
      // Best effort: if startup fails, user can retry from the voice screen.
    }).finally(() => {
      voiceToggleInFlightRef.current = false;
      maybeStopAfterInFlight();
      maybeRecoverVoiceAfterStop();
    });
  }, [
    maybeRecoverVoiceAfterStop,
    maybeStopAfterInFlight,
    mode,
    session.activeConversationId,
    session.isVoiceActive,
    session.toggleVoice,
  ]);

  async function onSend() {
    const clean = draft.trim();
    if (!clean) {
      return;
    }
    await session.sendText(clean);
    setDraft('');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className={voiceAssistantConversationThemeClass.safeArea}>
      <View className={voiceAssistantConversationThemeClass.screen}>
        <View className={voiceAssistantConversationThemeClass.header}>
          <View className={voiceAssistantConversationThemeClass.headerRow}>
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.headerButton}
              onPress={onOpenDrawer}
              testID="conversation-open-drawer-button"
            >
              <VoiceAssistantIcon name="menu" size={22} color="#111827" />
            </TouchableOpacity>
            <View className={voiceAssistantConversationThemeClass.headerCenter}>
              <Text className={voiceAssistantConversationThemeClass.headerTitle}>
                {activeConversation?.title ?? '默认会话'}
              </Text>
              <Text className={voiceAssistantConversationThemeClass.headerSubtext}>
                {session.textReplySourceLabel}
              </Text>
            </View>
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.headerButton}
              onPress={() => onChangeMode(mode === 'voice' ? 'text' : 'voice')}
              testID="conversation-mode-toggle-button"
            >
              <VoiceAssistantIcon name={mode === 'voice' ? 'text' : 'phone'} size={20} color="#111827" />
            </TouchableOpacity>
          </View>

        </View>

        <ScrollView
          className={voiceAssistantConversationThemeClass.messageArea}
          contentContainerStyle={voiceAssistantThemeStyle.conversationScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {session.messages.map((message) => (
            <VoiceAssistantMessageBubble key={message.id} message={message} />
          ))}
          {pendingAssistantMessage ? <VoiceAssistantMessageBubble message={pendingAssistantMessage} /> : null}
        </ScrollView>

        <View className={voiceAssistantConversationThemeClass.composerDock}>
          <View className={voiceAssistantConversationThemeClass.inputShell}>
            <TextInput
              className={voiceAssistantConversationThemeClass.inputField}
              onChangeText={setDraft}
              placeholder="输入消息"
              placeholderTextColor="#9CA3AF"
              testID="conversation-message-input"
              value={draft}
            />
          </View>

          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.iconButtonSoft}
            onPress={() => onChangeMode('voice')}
            testID="conversation-open-voice-button"
          >
            <VoiceAssistantIcon name="mic" size={22} color="#111827" />
          </TouchableOpacity>

          <TouchableOpacity
            className={`${voiceAssistantConversationThemeClass.primaryComposerAction} ${
              canSend ? '' : 'opacity-40'
            }`}
            disabled={!canSend}
            onPress={onSend}
            testID="conversation-send-button"
          >
            <Text className={voiceAssistantConversationThemeClass.primaryComposerActionText}>发送</Text>
          </TouchableOpacity>
        </View>

        {mode === 'voice' ? (
          <View className="absolute inset-0 z-20">
            <VoiceAssistantScreen
              session={session}
              onExitVoice={() => onChangeMode('text')}
              onOpenDrawer={onOpenDrawer}
              autoStartOnMount={false}
              displayMode={voiceDisplayMode}
              onToggleDisplayMode={() => {
                setVoiceDisplayMode((current) => (current === 'avatar' ? 'dialogue' : 'avatar'));
              }}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
