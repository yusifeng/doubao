import { router } from 'expo-router';
import { VoiceAssistantScreen } from '../../src/features/voice-assistant/ui/VoiceAssistantScreen';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function VoiceRoute() {
  const session = useVoiceAssistantRuntime();
  const conversationId = session.activeConversationId ?? 'conv-1';

  return (
    <VoiceAssistantScreen
      session={session}
      onGoConversation={() => {
        router.push(`/conversation/${conversationId}`);
      }}
      onGoHome={() => {
        router.push('/');
      }}
    />
  );
}
