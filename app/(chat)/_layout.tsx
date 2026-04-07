import { Stack } from 'expo-router';

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen
        name="conversation/[conversationId]"
        options={{ animation: 'none' }}
      />
      <Stack.Screen
        name="voice/[conversationId]"
        options={{
          animation: 'slide_from_right',
          animationDuration: 100,
          contentStyle: { backgroundColor: 'transparent' },
          statusBarStyle: 'dark',
          statusBarTranslucent: true,
          statusBarBackgroundColor: 'transparent',
          navigationBarColor: '#E7F2FF',
        }}
      />
    </Stack>
  );
}
