import { DrawerActions } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useVoiceAssistantRuntime } from '../../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { VoiceAssistantScreen } from '../../../src/features/voice-assistant/ui/VoiceAssistantScreen';

export default function VoiceRoute() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const session = useVoiceAssistantRuntime();
  const navigation = useNavigation();
  const [displayMode, setDisplayMode] = useState<'avatar' | 'dialogue'>('avatar');
  const requestedConversationId =
    typeof params.conversationId === 'string' ? params.conversationId : null;
  const conversationId = requestedConversationId ?? session.activeConversationId ?? null;
  const hasRequestedConversation = useMemo(
    () =>
      requestedConversationId
        ? session.conversations.some((conversation) => conversation.id === requestedConversationId)
        : false,
    [requestedConversationId, session.conversations],
  );
  const voiceActiveRef = useRef(session.isVoiceActive);
  const toggleVoiceRef = useRef(session.toggleVoice);
  const ensureVoiceStoppedRef = useRef(session.ensureVoiceStopped);
  const skipUnmountVoiceStopRef = useRef(false);

  useEffect(() => {
    voiceActiveRef.current = session.isVoiceActive;
  }, [session.isVoiceActive]);

  useEffect(() => {
    toggleVoiceRef.current = session.toggleVoice;
  }, [session.toggleVoice]);

  useEffect(() => {
    ensureVoiceStoppedRef.current = session.ensureVoiceStopped;
  }, [session.ensureVoiceStopped]);

  useEffect(() => {
    if (!session.activeConversationId || !conversationId) {
      return;
    }

    if (requestedConversationId && !hasRequestedConversation) {
      router.replace({
        pathname: '/conversation/[conversationId]',
        params: { conversationId: session.activeConversationId },
      });
      return;
    }

    if (conversationId !== session.activeConversationId) {
      void session.selectConversation(conversationId);
    }
  }, [
    conversationId,
    hasRequestedConversation,
    requestedConversationId,
    session,
    session.activeConversationId,
  ]);

  useEffect(() => {
    return () => {
      if (skipUnmountVoiceStopRef.current) {
        return;
      }
      if (ensureVoiceStoppedRef.current) {
        void ensureVoiceStoppedRef.current().catch(() => {
          // Best effort: runtime status will be reconciled when user re-enters.
        });
        return;
      }
      if (!voiceActiveRef.current) {
        return;
      }
      void toggleVoiceRef.current().catch(() => {
        // Best effort: voice runtime state will be reconciled when user re-enters.
      });
    };
  }, []);

  if (!conversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="voice-route-loading" />;
  }

  if (requestedConversationId && !hasRequestedConversation) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="voice-route-redirecting-invalid-conversation" />;
  }

  if (session.activeConversationId !== conversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="voice-route-selecting-conversation" />;
  }

  return (
    <>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <VoiceAssistantScreen
        session={session}
        embedded={false}
        autoStartOnMount
        displayMode={displayMode}
        onToggleDisplayMode={() => {
          setDisplayMode((current) => (current === 'avatar' ? 'dialogue' : 'avatar'));
        }}
        onOpenDrawer={() => navigation.dispatch(DrawerActions.openDrawer())}
        onExitVoice={() => {
          skipUnmountVoiceStopRef.current = true;
          voiceActiveRef.current = false;
          const ensureStopped = session.ensureVoiceStopped;
          const fallbackStop = () => {
            if (!session.isVoiceActive) {
              return Promise.resolve();
            }
            return session.toggleVoice();
          };
          void (ensureStopped ? ensureStopped() : fallbackStop())
            .catch(() => {
              // Best effort: navigation should still continue even if shutdown fails.
            })
            .finally(() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              router.replace({
                pathname: '/conversation/[conversationId]',
                params: { conversationId },
              });
            });
        }}
      />
    </>
  );
}
