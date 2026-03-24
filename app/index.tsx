import { router } from 'expo-router';
import { VoiceAssistantHomeScreen } from '../src/features/voice-assistant/ui/VoiceAssistantHomeScreen';
import { useVoiceAssistantRuntime } from '../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function HomeRoute() {
  const session = useVoiceAssistantRuntime();
  const conversationId = session.activeConversationId ?? 'conv-1';

  return (
    <VoiceAssistantHomeScreen
      session={session}
      onOpenConversation={() => {
        router.push(`/conversation/${conversationId}`);
      }}
      onOpenVoice={() => {
        router.push(`/voice/${conversationId}`);
      }}
    />
  );
}
