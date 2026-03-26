import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { VoiceAssistantConversationScreen } from '../../src/features/voice-assistant/ui/VoiceAssistantConversationScreen';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ conversationId?: string; mode?: string }>();
  const session = useVoiceAssistantRuntime();
  const navigation = useNavigation();
  const requestedConversationId = typeof params.conversationId === 'string' ? params.conversationId : null;
  const mode = params.mode === 'voice' ? 'voice' : 'text';

  const hasRequestedConversation = useMemo(
    () =>
      requestedConversationId
        ? session.conversations.some((conversation) => conversation.id === requestedConversationId)
        : false,
    [requestedConversationId, session.conversations],
  );

  useEffect(() => {
    if (!requestedConversationId || !session.activeConversationId) {
      return;
    }

    if (!hasRequestedConversation) {
      router.replace({
        pathname: '/conversation/[conversationId]',
        params: { conversationId: session.activeConversationId, mode },
      });
      return;
    }

    if (requestedConversationId !== session.activeConversationId) {
      void session.selectConversation(requestedConversationId);
    }
  }, [hasRequestedConversation, mode, requestedConversationId, session]);

  if (!session.activeConversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="conversation-route-loading" />;
  }

  return (
    <VoiceAssistantConversationScreen
      session={session}
      mode={mode}
      onOpenDrawer={() => navigation.dispatch(DrawerActions.openDrawer())}
      onChangeMode={(nextMode) => {
        router.replace({
          pathname: '/conversation/[conversationId]',
          params: { conversationId: session.activeConversationId ?? requestedConversationId ?? 'conv-1', mode: nextMode },
        });
      }}
    />
  );
}
