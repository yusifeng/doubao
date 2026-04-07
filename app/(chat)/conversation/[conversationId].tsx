import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { DrawerActions, useIsFocused } from '@react-navigation/native';
import { VoiceAssistantConversationScreen } from '../../../src/features/voice-assistant/ui/VoiceAssistantConversationScreen';
import { useVoiceAssistantRuntime } from '../../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { useRouteConversationSelection } from '../../../src/features/voice-assistant/ui/useRouteConversationSelection';

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ conversationId?: string; mode?: string }>();
  const session = useVoiceAssistantRuntime();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const requestedConversationId = typeof params.conversationId === 'string' ? params.conversationId : null;
  const legacyMode = params.mode === 'voice' ? 'voice' : 'text';

  const handleFallbackConversation = useCallback((conversationId: string) => {
    router.setParams({ conversationId, mode: 'text' });
  }, []);

  useRouteConversationSelection({
    requestedConversationId: legacyMode === 'voice' ? null : requestedConversationId,
    activeConversationId: session.activeConversationId,
    selectConversation: session.selectConversation,
    onFallbackConversation: handleFallbackConversation,
    enabled: isFocused,
  });

  useEffect(() => {
    if (!isFocused || !requestedConversationId || !session.activeConversationId || legacyMode !== 'voice') {
      return;
    }
    router.replace({
      pathname: '/voice/[conversationId]',
      params: { conversationId: requestedConversationId },
    });
  }, [isFocused, legacyMode, requestedConversationId, session.activeConversationId]);

  if (!session.activeConversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="conversation-route-loading" />;
  }

  if (legacyMode === 'voice' && requestedConversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="conversation-route-redirecting-voice" />;
  }

  return (
    <VoiceAssistantConversationScreen
      session={session}
      mode="text"
      onOpenDrawer={() => navigation.dispatch(DrawerActions.openDrawer())}
      onChangeMode={(nextMode) => {
        if (nextMode === 'voice') {
          router.push({
            pathname: '/voice/[conversationId]',
            params: { conversationId: session.activeConversationId ?? requestedConversationId ?? 'conv-1' },
          });
          return;
        }

        router.setParams({
          conversationId: session.activeConversationId ?? requestedConversationId ?? 'conv-1',
          mode: 'text',
        });
      }}
    />
  );
}
