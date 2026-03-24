import { VoiceAssistantScreen } from '../../src/features/voice-assistant/ui/VoiceAssistantScreen';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function VoiceRoute() {
  const session = useVoiceAssistantRuntime();
  return <VoiceAssistantScreen session={session} />;
}
