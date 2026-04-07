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
import { AppToastProvider } from '../src/shared/ui/AppToastProvider';

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

  async function handleOpenSettings() {
    router.push('/settings');
  }

  async function handleRenameConversation(conversationId: string, title: string) {
    if (!session.renameConversationTitle) {
      return;
    }
    await session.renameConversationTitle(conversationId, title);
  }

  async function handleDeleteConversation(conversationId: string) {
    if (!session.deleteConversation) {
      return;
    }

    const deletingActiveConversation = session.activeConversationId === conversationId;
    if (deletingActiveConversation && session.isVoiceActive) {
      if (session.ensureVoiceStopped) {
        await session.ensureVoiceStopped();
      } else {
        await session.toggleVoice();
      }
    }

    const result = await session.deleteConversation(conversationId);
    if (!result.ok || !result.nextConversationId || !deletingActiveConversation) {
      return;
    }

    router.replace({
      pathname: '/conversation/[conversationId]',
      params: { conversationId: result.nextConversationId, mode: 'text' },
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
          onRenameConversation={async (conversationId, title) => {
            await handleRenameConversation(conversationId, title);
          }}
          onDeleteConversation={async (conversationId) => {
            await handleDeleteConversation(conversationId);
          }}
          onOpenSettings={async () => {
            await handleOpenSettings();
            props.navigation.closeDrawer();
          }}
        />
      )}
      screenOptions={{
        headerShown: false,
        overlayColor: 'rgba(0, 0, 0, 0.2)',
        drawerType: 'front',
        swipeEdgeWidth: 36,
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: '#FFFFFF',
        },
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Drawer.Screen name="(chat)" />
      <Drawer.Screen name="settings" />
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
        <AppToastProvider>
          <VoiceAssistantRuntimeProvider>
            <RootDrawerNavigator />
            <StatusBar style="dark" />
          </VoiceAssistantRuntimeProvider>
        </AppToastProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
