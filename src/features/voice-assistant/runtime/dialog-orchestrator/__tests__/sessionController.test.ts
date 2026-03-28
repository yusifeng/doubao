import { SessionController } from '../sessionController';

describe('SessionController', () => {
  it('serializes control-plane calls while leaving stream as direct path', async () => {
    const callOrder: string[] = [];
    const controller = new SessionController({
      isSupported: () => true,
      prepare: async () => {
        callOrder.push('prepare:start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push('prepare:end');
      },
      startConversation: async () => {
        callOrder.push('start:start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push('start:end');
      },
      stopConversation: async () => {
        callOrder.push('stop');
      },
      pauseTalking: async () => {
        callOrder.push('pause');
      },
      resumeTalking: async () => {
        callOrder.push('resume');
      },
      interruptCurrentDialog: async () => {
        callOrder.push('interrupt');
      },
      sendTextQuery: async () => {
        callOrder.push('sendText');
      },
      useClientTriggeredTts: async () => {
        callOrder.push('useClientTriggeredTts');
      },
      useServerTriggeredTts: async () => {
        callOrder.push('useServerTriggeredTts');
      },
      streamClientTtsText: async () => {
        callOrder.push('stream');
      },
      setListener: () => undefined,
      destroy: async () => {
        callOrder.push('destroy');
      },
    });

    await Promise.all([
      controller.prepare({ dialogWorkMode: 'default' }),
      controller.startConversation({ inputMode: 'audio', model: 'm', speaker: 's' }),
    ]);
    await controller.streamClientTtsText({ start: true, content: '你好', end: false });

    expect(callOrder.slice(0, 4)).toEqual(['prepare:start', 'prepare:end', 'start:start', 'start:end']);
    expect(callOrder.includes('stream')).toBe(true);
  });
});
