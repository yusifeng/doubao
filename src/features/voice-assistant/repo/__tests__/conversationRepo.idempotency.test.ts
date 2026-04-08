import { InMemoryConversationRepo } from '../conversationRepo';

describe('InMemoryConversationRepo idempotency', () => {
  it('returns the persisted message when idempotencyKey is duplicated', async () => {
    const repo = new InMemoryConversationRepo();
    const conversation = await repo.createConversation('测试会话');

    const first = await repo.appendMessage(conversation.id, {
      conversationId: conversation.id,
      role: 'assistant',
      type: 'text',
      content: '第一次写入',
      idempotencyKey: 'assistant:turn:1',
    });
    const second = await repo.appendMessage(conversation.id, {
      conversationId: conversation.id,
      role: 'assistant',
      type: 'text',
      content: '重复写入',
      idempotencyKey: 'assistant:turn:1',
    });

    expect(second.id).toBe(first.id);
    expect(second.content).toBe('第一次写入');
    expect((await repo.listMessages(conversation.id)).length).toBe(1);
  });
});
