import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function VoiceRoute() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const session = useVoiceAssistantRuntime();
  const conversationId = typeof params.conversationId === 'string' ? params.conversationId : session.activeConversationId;

  if (!conversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="voice-route-loading" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/conversation/[conversationId]',
        params: { conversationId, mode: 'voice' },
      }}
    />
  );
}
