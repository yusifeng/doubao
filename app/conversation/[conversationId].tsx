import { router } from 'expo-router';
import { VoiceAssistantConversationScreen } from '../../src/features/voice-assistant/ui/VoiceAssistantConversationScreen';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function ConversationRoute() {
  const session = useVoiceAssistantRuntime();
  const conversationId = session.activeConversationId ?? 'conv-1';

  return (
    <VoiceAssistantConversationScreen
      session={session}
      onOpenVoice={() => {
        router.push(`/voice/${conversationId}`);
      }}
    />
  );
}
