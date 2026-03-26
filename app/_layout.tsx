import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { verifyInstallation } from 'nativewind';
import 'react-native-reanimated';
import '../global.css';
import {
  useVoiceAssistantRuntime,
  VoiceAssistantRuntimeProvider,
} from '../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { VoiceAssistantSessionDrawerContent } from '../src/features/voice-assistant/ui/VoiceAssistantSessionDrawerContent';

export { ErrorBoundary } from 'expo-router';

function RootDrawerNavigator() {
  const session = useVoiceAssistantRuntime();
  const router = useRouter();

  const drawerWidth = Math.min(360, Dimensions.get('window').width * 0.86);

  async function handleSelectConversation(conversationId: string) {
    if (session.isVoiceActive) {
      await session.toggleVoice();
    }

    const changed = await session.selectConversation(conversationId);
    if (!changed) {
      router.replace({
        pathname: '/conversation/[conversationId]',
        params: { conversationId, mode: 'text' },
      });
      return;
    }

    router.replace({
      pathname: '/conversation/[conversationId]',
      params: { conversationId, mode: 'text' },
    });
  }

  async function handleCreateConversation() {
    if (session.isVoiceActive) {
      await session.toggleVoice();
    }

    const conversationId = await session.createConversation('新会话');
    router.replace({
      pathname: '/conversation/[conversationId]',
      params: { conversationId, mode: 'text' },
    });
  }

  async function handleOpenVoice() {
    let conversationId = session.activeConversationId;
    if (!conversationId) {
      conversationId = await session.createConversation('新会话');
    }

    router.replace({
      pathname: '/conversation/[conversationId]',
      params: { conversationId, mode: 'voice' },
    });
  }

  return (
    <Drawer
      drawerContent={(props) => (
        <VoiceAssistantSessionDrawerContent
          session={session}
          onClose={() => props.navigation.closeDrawer()}
          onSelectConversation={async (conversationId) => {
            await handleSelectConversation(conversationId);
            props.navigation.closeDrawer();
          }}
          onCreateConversation={async () => {
            await handleCreateConversation();
            props.navigation.closeDrawer();
          }}
          onOpenVoice={async () => {
            await handleOpenVoice();
            props.navigation.closeDrawer();
          }}
        />
      )}
      screenOptions={{
        headerShown: false,
        overlayColor: 'rgba(15, 23, 42, 0.18)',
        drawerType: 'slide',
        swipeEdgeWidth: 36,
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: '#FFFFFF',
        },
        sceneStyle: { backgroundColor: '#FFF4E8' },
      }}
    >
      <Drawer.Screen name="index" />
      <Drawer.Screen name="conversation/[conversationId]" />
      <Drawer.Screen name="voice/[conversationId]" />
    </Drawer>
  );
}

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <VoiceAssistantRuntimeProvider>
          <RootDrawerNavigator />
          <StatusBar style="dark" />
        </VoiceAssistantRuntimeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
