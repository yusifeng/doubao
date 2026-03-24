import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { verifyInstallation } from 'nativewind';
import 'react-native-reanimated';
import '../global.css';
import { VoiceAssistantRuntimeProvider } from '../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) {
      try {
        verifyInstallation();
      } catch (error) {
        console.warn('[nativewind] verifyInstallation failed', error);
      }
    }
  }, []);

  return (
    <SafeAreaProvider>
      <VoiceAssistantRuntimeProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FFF4E8' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="conversation/[conversationId]" />
          <Stack.Screen name="voice/[conversationId]" />
        </Stack>
        <StatusBar style="dark" />
      </VoiceAssistantRuntimeProvider>
    </SafeAreaProvider>
  );
}
