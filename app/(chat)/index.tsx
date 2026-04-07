import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function HomeRoute() {
  const session = useVoiceAssistantRuntime();

  if (!session.activeConversationId) {
    return <View className="flex-1 bg-[#FBFCFE]" testID="home-route-loading" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/conversation/[conversationId]',
        params: { conversationId: session.activeConversationId, mode: 'text' },
      }}
    />
  );
}
