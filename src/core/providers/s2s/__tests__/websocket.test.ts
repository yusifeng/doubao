import { WebSocketS2SProvider } from '../websocket';

function createProvider() {
  return new WebSocketS2SProvider({
    wsUrl: 'wss://example.com',
    appId: 'app',
    accessToken: 'token',
  });
}

describe('WebSocketS2SProvider text merge', () => {
  it('does not duplicate when chunk is the same sentence', () => {
    const provider = createProvider() as any;
    const sentence = '我是江户川柯南，帝丹小学一年级的学生，不过，你要是有什么麻烦的案件，也可以找我帮忙。';
    const merged = provider.mergeStreamingText(sentence, sentence);
    expect(merged).toBe(sentence);
  });

  it('merges by overlap instead of naive append', () => {
    const provider = createProvider() as any;
    const current = '你好，我是柯南';
    const incoming = '柯南。有什么要我帮忙的吗？';
    const merged = provider.mergeStreamingText(current, incoming);
    expect(merged).toBe('你好，我是柯南。有什么要我帮忙的吗？');
  });

  it('dedupes repeated tail sentence blocks', () => {
    const provider = createProvider() as any;
    const current =
      '（指尖无意识地摩挲着袖口纽扣，镜片反射出一道短暂的光）嗯，保持联系就好。对了，最近米花町三丁目那边施工，晚上尽量别单独走那条路。';
    const incoming = '嗯，保持联系就好。对了，最近米花町三丁目那边施工，晚上尽量别单独走那条路。';
    const merged = provider.mergeStreamingText(current, incoming);
    expect(merged).toBe(current);
  });

  it('uses finalized snapshot text instead of duplicating streamed chunks', () => {
    const provider = createProvider() as any;
    let merged = '';
    merged = provider.mergeStreamingText(merged, '我是江户川柯南，帝丹小学一年级的学生，');
    merged = provider.mergeStreamingText(merged, '不过，你要是有什么麻烦的案件，也可以找我帮忙。');
    const finalSnapshot = '我是江户川柯南，帝丹小学一年级的学生，不过，你要是有什么麻烦的案件，也可以找我帮忙。';
    const normalizedFinal = provider.normalizeFinalAssistantText(finalSnapshot);
    expect(normalizedFinal).toBe(finalSnapshot);
    expect(merged).toBe(finalSnapshot);
  });

  it('rejects sendTextQuery when session has not started', async () => {
    const provider = createProvider() as any;
    provider.socket = { send: jest.fn() };
    provider.connected = true;
    provider.phase = 'connected';
    await expect(provider.sendTextQuery('你好')).rejects.toThrow('S2S session is not started');
  });

  it('emits partial text updates while waiting for final assistant text', async () => {
    const provider = createProvider() as any;
    provider.socket = { send: jest.fn() };
    provider.connected = true;
    provider.phase = 'session_started';
    provider.frameQueue = [
      { event: 352, text: '这是', audio: null, error: null },
      { event: 352, text: '流式回复', audio: null, error: null },
      { event: 359, text: '', audio: null, error: null },
    ];

    const partials: string[] = [];
    const result = await provider.waitForAssistantText(200, (text: string) => {
      partials.push(text);
    });

    expect(partials).toEqual(['这是', '这是流式回复']);
    expect(result).toBe('这是流式回复');
  });

  it('clears pending turn text while preserving last completed dedupe marker by default', () => {
    const provider = createProvider() as any;
    provider.turnState.pendingAssistantText = '测试中';
    provider.turnState.pendingAssistantHasText = true;
    provider.turnState.lastCompletedAssistantTextNormalized = 'abc';
    provider.turnState.lastCompletedAssistantTextAt = 123;
    provider.turnState.recentCompletedAssistantTexts = [{ normalized: 'abc', at: 123 }];

    provider.resetTurnState();

    expect(provider.turnState.pendingAssistantText).toBe('');
    expect(provider.turnState.pendingAssistantHasText).toBe(false);
    expect(provider.turnState.lastCompletedAssistantTextNormalized).toBe('abc');
    expect(provider.turnState.lastCompletedAssistantTextAt).toBe(123);
    expect(provider.turnState.recentCompletedAssistantTexts).toEqual([{ normalized: 'abc', at: 123 }]);
  });

  it('dedupes retransmitted finalized chunks across recent turns', () => {
    const provider = createProvider() as any;
    const first = '你好，我是江户川柯南。';
    const second = '你好，我是江户川柯南';

    expect(provider.isLikelyDuplicatedCompletedText(first)).toBe(false);
    expect(provider.isLikelyDuplicatedCompletedText(second)).toBe(true);
  });

  it('prefers the cloned SC speaker before saturn fallbacks', async () => {
    const provider = createProvider() as any;
    provider.socket = { send: jest.fn() };
    provider.connected = true;
    provider.sendStartSession = jest.fn(async () => undefined);

    await provider.startSession();

    expect(provider.sendStartSession).toHaveBeenCalledTimes(1);
    expect(provider.sendStartSession.mock.calls[0][0].tts.speaker).toBe('S_mXRP7Y5M1');
  });
});
