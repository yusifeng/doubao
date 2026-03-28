import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { VoiceAssistantSettingsScreen } from '../src/features/voice-assistant/ui/VoiceAssistantSettingsScreen';
import { useVoiceAssistantRuntime } from '../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function SettingsRoute() {
  const navigation = useNavigation();
  const session = useVoiceAssistantRuntime();

  return (
    <VoiceAssistantSettingsScreen
      session={session}
      onOpenDrawer={() => navigation.dispatch(DrawerActions.openDrawer())}
    />
  );
}
