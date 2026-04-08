import { createRuntimeStateHandlers } from '../useTextChat.runtimeState';

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

function createConversation(id: string, title: string) {
  return {
    id,
    title,
    lastMessage: '',
    updatedAt: Date.now(),
    status: 'idle' as const,
  };
}

describe('createRuntimeStateHandlers conversation selection epoch guard', () => {
  it('keeps the latest selectConversation result when older request resolves later', async () => {
    const conversations = [
      createConversation('conv-a', '会话A'),
      createConversation('conv-b', '会话B'),
    ];
    const messagesByConversation = {
      'conv-a': [{ id: 'msg-a', conversationId: 'conv-a', role: 'assistant', content: 'A', type: 'text', createdAt: 1 }],
      'conv-b': [{ id: 'msg-b', conversationId: 'conv-b', role: 'assistant', content: 'B', type: 'text', createdAt: 1 }],
    };

    const listMessagesA = createDeferred<typeof messagesByConversation['conv-a']>();
    const listMessagesB = createDeferred<typeof messagesByConversation['conv-b']>();
    const repo = {
      listConversations: jest.fn(async () => conversations),
      listMessages: jest.fn(async (conversationId: string) => {
        if (conversationId === 'conv-a') {
          return listMessagesA.promise;
        }
        return listMessagesB.promise;
      }),
      updateConversationStatus: jest.fn(async () => {}),
      createConversation: jest.fn(),
      renameConversationTitle: jest.fn(),
      deleteConversation: jest.fn(),
      appendMessage: jest.fn(),
      updateConversationSystemPromptSnapshot: jest.fn(),
    };

    let activeConversationId: string | null = 'conv-root';
    const deps: any = {
      activeConversationId,
      getActiveConversationId: jest.fn(() => activeConversationId),
      repo,
      setRuntimeStatus: jest.fn(),
      setActiveConversationId: jest.fn((nextId: string | null) => {
        activeConversationId = nextId;
        deps.activeConversationId = nextId;
      }),
      setMessages: jest.fn(),
      setConversations: jest.fn(),
      setLiveUserTranscript: jest.fn(),
      setPendingAssistantReply: jest.fn(),
      conversationSelectionEpochRef: { current: 0 },
      getRuntimeConfig: jest.fn(() => ({ persona: { systemPrompt: 'prompt' } })),
      getRuntimeConfigHydrated: jest.fn(() => true),
      getEffectiveRuntimeConfig: jest.fn(),
      isRuntimeConfigEqual: jest.fn(),
      setRuntimeConfig: jest.fn(),
      setRuntimeConfigHydrated: jest.fn(),
    };

    const handlers = createRuntimeStateHandlers(deps);

    const selectA = handlers.selectConversation('conv-a');
    const selectB = handlers.selectConversation('conv-b');

    listMessagesB.resolve(messagesByConversation['conv-b']);
    await expect(selectB).resolves.toBe(true);
    listMessagesA.resolve(messagesByConversation['conv-a']);
    await expect(selectA).resolves.toBe(false);

    expect(activeConversationId).toBe('conv-b');
    expect(deps.setMessages).toHaveBeenCalledTimes(1);
    expect(deps.setMessages).toHaveBeenLastCalledWith(messagesByConversation['conv-b']);
    expect(repo.updateConversationStatus).toHaveBeenCalledTimes(1);
    expect(repo.updateConversationStatus).toHaveBeenCalledWith('conv-b', 'idle');
  });

  it('invalidates in-flight selectConversation when createConversation starts', async () => {
    const createdConversation = createConversation('conv-new', '新会话');
    let conversations = [createConversation('conv-a', '会话A')];
    const messagesByConversation: Record<string, any[]> = {
      'conv-a': [{ id: 'msg-a', conversationId: 'conv-a', role: 'assistant', content: 'A', type: 'text', createdAt: 1 }],
      'conv-new': [],
    };

    const listMessagesA = createDeferred<any[]>();
    const repo = {
      listConversations: jest.fn(async () => conversations),
      listMessages: jest.fn(async (conversationId: string) => {
        if (conversationId === 'conv-a') {
          return listMessagesA.promise;
        }
        return messagesByConversation[conversationId] ?? [];
      }),
      createConversation: jest.fn(async () => {
        conversations = [createdConversation, ...conversations];
        return createdConversation;
      }),
      updateConversationStatus: jest.fn(async () => {}),
      renameConversationTitle: jest.fn(),
      deleteConversation: jest.fn(),
      appendMessage: jest.fn(),
      updateConversationSystemPromptSnapshot: jest.fn(),
    };

    let activeConversationId: string | null = 'conv-root';
    const deps: any = {
      activeConversationId,
      getActiveConversationId: jest.fn(() => activeConversationId),
      repo,
      setRuntimeStatus: jest.fn(),
      setActiveConversationId: jest.fn((nextId: string | null) => {
        activeConversationId = nextId;
        deps.activeConversationId = nextId;
      }),
      setMessages: jest.fn(),
      setConversations: jest.fn(),
      setLiveUserTranscript: jest.fn(),
      setPendingAssistantReply: jest.fn(),
      conversationSelectionEpochRef: { current: 0 },
      getRuntimeConfig: jest.fn(() => ({ persona: { systemPrompt: 'prompt' } })),
      getRuntimeConfigHydrated: jest.fn(() => true),
      getEffectiveRuntimeConfig: jest.fn(),
      isRuntimeConfigEqual: jest.fn(),
      setRuntimeConfig: jest.fn(),
      setRuntimeConfigHydrated: jest.fn(),
    };

    const handlers = createRuntimeStateHandlers(deps);

    const selectA = handlers.selectConversation('conv-a');
    const createResult = await handlers.createConversation('新会话');
    expect(createResult).toBe('conv-new');

    listMessagesA.resolve(messagesByConversation['conv-a']);
    await expect(selectA).resolves.toBe(false);

    expect(activeConversationId).toBe('conv-new');
    expect(repo.updateConversationStatus).toHaveBeenCalledWith('conv-new', 'idle');
    expect(repo.updateConversationStatus).not.toHaveBeenCalledWith('conv-a', 'idle');
  });
});
