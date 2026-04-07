import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import type { UseTextChatResult } from '../runtime/useTextChat';

type ConversationRouter = {
  replace: (options: {
    pathname: '/conversation/[conversationId]';
    params: { conversationId: string; mode: 'text' };
  }) => void;
  setParams: (params: { conversationId: string; mode: 'text' }) => void;
};

type ConversationSwitchSession = Pick<
  UseTextChatResult,
  | 'activeConversationId'
  | 'isVoiceActive'
  | 'toggleVoice'
  | 'ensureVoiceStopped'
  | 'selectConversation'
  | 'createConversation'
>;

type ConversationIntent =
  | { type: 'select'; conversationId: string }
  | { type: 'create'; title: string };

type PendingIntentEntry = {
  intent: ConversationIntent;
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

type UseConversationSwitchCoordinatorArgs = {
  pathname: string;
  router: ConversationRouter;
  session: ConversationSwitchSession;
};

export function useConversationSwitchCoordinator({
  pathname,
  router,
  session,
}: UseConversationSwitchCoordinatorArgs) {
  const pathnameRef = useRef(pathname);
  const activeConversationIdRef = useRef<string | null>(session.activeConversationId);
  const isVoiceActiveRef = useRef(session.isVoiceActive);
  const pendingIntentRef = useRef<PendingIntentEntry | null>(null);
  const drainingIntentQueueRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    activeConversationIdRef.current = session.activeConversationId;
  }, [session.activeConversationId]);

  useEffect(() => {
    isVoiceActiveRef.current = session.isVoiceActive;
  }, [session.isVoiceActive]);

  const navigateToConversation = useCallback((conversationId: string) => {
    const currentPathname = pathnameRef.current;
    if (currentPathname.startsWith('/conversation/')) {
      router.setParams({ conversationId, mode: 'text' });
      return;
    }

    router.replace({
      pathname: '/conversation/[conversationId]',
      params: { conversationId, mode: 'text' },
    });
  }, [router]);

  const stopVoiceIfNeeded = useCallback(async () => {
    if (!isVoiceActiveRef.current) {
      return;
    }
    if (session.ensureVoiceStopped) {
      await session.ensureVoiceStopped();
      return;
    }
    await session.toggleVoice();
  }, [session.ensureVoiceStopped, session.toggleVoice]);

  const executeIntent = useCallback(async (intent: ConversationIntent) => {
    if (intent.type === 'select') {
      if (intent.conversationId === activeConversationIdRef.current) {
        await stopVoiceIfNeeded();
        navigateToConversation(intent.conversationId);
        return;
      }

      await stopVoiceIfNeeded();

      const changed = await session.selectConversation(intent.conversationId);
      if (changed) {
        navigateToConversation(intent.conversationId);
        return;
      }

      const fallbackConversationId = activeConversationIdRef.current;
      if (fallbackConversationId) {
        navigateToConversation(fallbackConversationId);
      }
      return;
    }

    await stopVoiceIfNeeded();
    const conversationId = await session.createConversation(intent.title);
    navigateToConversation(conversationId);
  }, [
    navigateToConversation,
    session.createConversation,
    session.selectConversation,
    stopVoiceIfNeeded,
  ]);

  const drainIntentQueue = useCallback(async () => {
    if (drainingIntentQueueRef.current) {
      return;
    }
    drainingIntentQueueRef.current = true;
    try {
      while (pendingIntentRef.current) {
        const currentEntry = pendingIntentRef.current;
        pendingIntentRef.current = null;
        try {
          await executeIntent(currentEntry.intent);
          currentEntry.resolve();
        } catch (error) {
          currentEntry.reject(error);
        }
      }
    } finally {
      drainingIntentQueueRef.current = false;
    }
  }, [executeIntent]);

  const enqueueIntent = useCallback((intent: ConversationIntent) => new Promise<void>((resolve, reject) => {
    // Keep only the latest pending intent to reduce rapid-tap race surfaces.
    if (pendingIntentRef.current) {
      pendingIntentRef.current.resolve();
    }
    pendingIntentRef.current = {
      intent,
      resolve,
      reject,
    };
    void drainIntentQueue();
  }), [drainIntentQueue]);

  const requestSelectConversation = useCallback(
    (conversationId: string) => enqueueIntent({ type: 'select', conversationId }),
    [enqueueIntent],
  );

  const requestCreateConversation = useCallback(
    (title = '新会话') => enqueueIntent({ type: 'create', title }),
    [enqueueIntent],
  );

  const runAfterDrawerClose = useCallback((task: () => Promise<void>) => {
    InteractionManager.runAfterInteractions(() => {
      void task();
    });
  }, []);

  const runDrawerConversationAction = useCallback(
    (closeDrawer: () => void, task: () => Promise<void>) => {
      // On settings pages, run the intent first so transition stays behind drawer.
      if (pathname.startsWith('/settings')) {
        void task()
          .catch(() => {
            // Best effort: close drawer even if intent fails.
          })
          .finally(() => {
            closeDrawer();
          });
        return;
      }

      closeDrawer();
      runAfterDrawerClose(task);
    },
    [pathname, runAfterDrawerClose],
  );

  const runDrawerSelectConversation = useCallback(
    (closeDrawer: () => void, conversationId: string) => {
      runDrawerConversationAction(closeDrawer, () => requestSelectConversation(conversationId));
    },
    [requestSelectConversation, runDrawerConversationAction],
  );

  const runDrawerCreateConversation = useCallback(
    (closeDrawer: () => void, title = '新会话') => {
      runDrawerConversationAction(closeDrawer, () => requestCreateConversation(title));
    },
    [requestCreateConversation, runDrawerConversationAction],
  );

  return {
    navigateToConversation,
    requestSelectConversation,
    requestCreateConversation,
    runDrawerSelectConversation,
    runDrawerCreateConversation,
  };
}
