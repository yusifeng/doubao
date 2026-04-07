import 'react-native-gesture-handler';
import { useCallback, useEffect } from 'react';
import { Dimensions, InteractionManager } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
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
import { useConversationSwitchCoordinator } from '../src/features/voice-assistant/ui/useConversationSwitchCoordinator';

export { ErrorBoundary } from 'expo-router';

function RootDrawerNavigator() {
  const session = useVoiceAssistantRuntime();
  const router = useRouter();
  const pathname = usePathname();

  const drawerWidth = Math.min(360, Dimensions.get('window').width * 0.86);
  const {
    navigateToConversation,
    runDrawerSelectConversation,
    runDrawerCreateConversation,
  } = useConversationSwitchCoordinator({
    pathname,
    router,
    session,
  });

  const runAfterDrawerClose = useCallback((task: () => Promise<void> | void) => {
    InteractionManager.runAfterInteractions(() => {
      void task();
    });
  }, []);

  const handleOpenSettings = useCallback(async () => {
    router.push('/settings');
  }, [router]);

  const handleRenameConversation = useCallback(async (conversationId: string, title: string) => {
    if (!session.renameConversationTitle) {
      return;
    }
    await session.renameConversationTitle(conversationId, title);
  }, [session.renameConversationTitle]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
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

    navigateToConversation(result.nextConversationId);
  }, [
    navigateToConversation,
    session.activeConversationId,
    session.deleteConversation,
    session.ensureVoiceStopped,
    session.isVoiceActive,
    session.toggleVoice,
  ]);

  return (
    <Drawer
      drawerContent={(props) => (
        <VoiceAssistantSessionDrawerContent
          session={session}
          onClose={() => props.navigation.closeDrawer()}
          onSelectConversation={(conversationId) => {
            runDrawerSelectConversation(
              () => props.navigation.closeDrawer(),
              conversationId,
            );
          }}
          onCreateConversation={() => {
            runDrawerCreateConversation(
              () => props.navigation.closeDrawer(),
            );
          }}
          onRenameConversation={async (conversationId, title) => {
            await handleRenameConversation(conversationId, title);
          }}
          onDeleteConversation={async (conversationId) => {
            await handleDeleteConversation(conversationId);
          }}
          onOpenSettings={async () => {
            props.navigation.closeDrawer();
            runAfterDrawerClose(handleOpenSettings);
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
