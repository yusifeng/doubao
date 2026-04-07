import { act, renderHook, waitFor } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { useConversationSwitchCoordinator } from '../useConversationSwitchCoordinator';

function createDeferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      resolve?.(value);
    },
  };
}

function createSessionMock(overrides?: Partial<UseTextChatResult>) {
  return {
    isVoiceActive: false,
    toggleVoice: jest.fn(async () => {}),
    ensureVoiceStopped: jest.fn(async () => {}),
    createConversation: jest.fn(async () => 'conv-new'),
    ...overrides,
  } as Pick<
    UseTextChatResult,
    'isVoiceActive' | 'toggleVoice' | 'ensureVoiceStopped' | 'createConversation'
  > &
    Partial<UseTextChatResult>;
}

describe('useConversationSwitchCoordinator', () => {
  let runAfterInteractionsSpy: jest.SpyInstance;

  beforeEach(() => {
    runAfterInteractionsSpy = jest
      .spyOn(InteractionManager, 'runAfterInteractions')
      .mockImplementation(((task: () => void) => {
        task();
        return { cancel: jest.fn() };
      }) as any);
  });

  afterEach(() => {
    runAfterInteractionsSpy.mockRestore();
  });

  it('closes drawer before executing switch intent on chat routes', async () => {
    const order: string[] = [];
    const session = createSessionMock();
    const router = {
      setParams: jest.fn(() => {
        order.push('setParams');
      }),
      replace: jest.fn(),
    };
    const closeDrawer = jest.fn(() => {
      order.push('close');
    });

    const { result } = renderHook(() =>
      useConversationSwitchCoordinator({
        pathname: '/conversation/conv-a',
        router,
        session,
      }),
    );

    act(() => {
      result.current.runDrawerSelectConversation(closeDrawer, 'conv-b');
    });

    await waitFor(() => {
      expect(router.setParams).toHaveBeenCalledWith({
        conversationId: 'conv-b',
        mode: 'text',
      });
    });
    expect(order).toEqual(['close', 'setParams']);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps drawer open until create intent finishes on settings route', async () => {
    const order: string[] = [];
    const session = createSessionMock({
      createConversation: jest.fn(async () => {
        order.push('create');
        return 'conv-new';
      }),
    });
    const router = {
      setParams: jest.fn(),
      replace: jest.fn(() => {
        order.push('replace');
      }),
    };
    const closeDrawer = jest.fn(() => {
      order.push('close');
    });

    const { result } = renderHook(() =>
      useConversationSwitchCoordinator({
        pathname: '/settings',
        router,
        session,
      }),
    );

    act(() => {
      result.current.runDrawerCreateConversation(closeDrawer);
    });

    await waitFor(() => {
      expect(closeDrawer).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual(['create', 'replace', 'close']);
  });

  it('coalesces pending intents and applies the latest request after in-flight one', async () => {
    const firstStopDeferred = createDeferred<void>();
    let stopCall = 0;
    const session = createSessionMock({
      isVoiceActive: true,
      ensureVoiceStopped: jest.fn(async () => {
        stopCall += 1;
        if (stopCall === 1) {
          await firstStopDeferred.promise;
        }
      }),
    });
    const router = {
      setParams: jest.fn(),
      replace: jest.fn(),
    };

    const { result } = renderHook(() =>
      useConversationSwitchCoordinator({
        pathname: '/settings',
        router,
        session,
      }),
    );

    let firstIntentPromise: Promise<void>;
    let skippedIntentPromise: Promise<void>;
    let latestIntentPromise: Promise<void>;
    act(() => {
      firstIntentPromise = result.current.requestSelectConversation('conv-b');
      skippedIntentPromise = result.current.requestSelectConversation('conv-c');
      latestIntentPromise = result.current.requestSelectConversation('conv-d');
    });

    await act(async () => {
      firstStopDeferred.resolve();
      await Promise.all([firstIntentPromise!, skippedIntentPromise!, latestIntentPromise!]);
    });

    expect(session.ensureVoiceStopped).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenNthCalledWith(1, {
      pathname: '/conversation/[conversationId]',
      params: { conversationId: 'conv-b', mode: 'text' },
    });
    expect(router.replace).toHaveBeenLastCalledWith({
      pathname: '/conversation/[conversationId]',
      params: { conversationId: 'conv-d', mode: 'text' },
    });
    expect(router.replace).toHaveBeenCalledTimes(2);
  });

  it('uses latest pathname when deferred drawer action executes', async () => {
    let queuedAfterInteractionTask: (() => void) | null = null;
    runAfterInteractionsSpy.mockImplementationOnce(((task: () => void) => {
      queuedAfterInteractionTask = task;
      return { cancel: jest.fn() };
    }) as any);

    const session = createSessionMock();
    const router = {
      setParams: jest.fn(),
      replace: jest.fn(),
    };
    const closeDrawer = jest.fn();

    const hookResult = renderHook(
      ({ pathname }: { pathname: string }) =>
        useConversationSwitchCoordinator({
          pathname,
          router,
          session,
        }),
      {
        initialProps: { pathname: '/conversation/conv-a' },
      },
    );
    const result = hookResult.result as {
      current: ReturnType<typeof useConversationSwitchCoordinator>;
    };
    const rerender = hookResult.rerender as (props: { pathname: string }) => void;

    act(() => {
      result.current.runDrawerSelectConversation(closeDrawer, 'conv-b');
    });

    rerender({ pathname: '/settings' });

    await act(async () => {
      queuedAfterInteractionTask?.();
      await Promise.resolve();
    });

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/conversation/[conversationId]',
      params: { conversationId: 'conv-b', mode: 'text' },
    });
    expect(router.setParams).not.toHaveBeenCalled();
  });

  it('navigates to conversation page when selecting current session from settings', async () => {
    const session = createSessionMock();
    const router = {
      setParams: jest.fn(),
      replace: jest.fn(),
    };
    const closeDrawer = jest.fn();

    const { result } = renderHook(() =>
      useConversationSwitchCoordinator({
        pathname: '/settings',
        router,
        session,
      }),
    );

    act(() => {
      result.current.runDrawerSelectConversation(closeDrawer, 'conv-a');
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/conversation/[conversationId]',
        params: { conversationId: 'conv-a', mode: 'text' },
      });
    });
  });
});
