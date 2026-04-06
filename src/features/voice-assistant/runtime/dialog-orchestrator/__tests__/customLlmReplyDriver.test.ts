import {
  finalizeCustomLlmReplyText,
  shouldDropPlatformReplyInCustomTurn,
  shouldPersistCustomTextWhenTtsUnavailable,
} from '../replyDrivers/customLlmReplyDriver';

describe('customLlm reply driver helpers', () => {
  it('always drops platform reply in custom_llm mode', () => {
    expect(
      shouldDropPlatformReplyInCustomTurn({
        replyChainMode: 'custom_llm',
        replyOwner: 'custom',
      }),
    ).toBe(true);
    expect(
      shouldDropPlatformReplyInCustomTurn({
        replyChainMode: 'custom_llm',
        replyOwner: 'platform',
      }),
    ).toBe(true);

    expect(
      shouldDropPlatformReplyInCustomTurn({
        replyChainMode: 'official_s2s',
        replyOwner: 'platform',
      }),
    ).toBe(false);
  });

  it('keeps custom text when client-triggered tts is unavailable', () => {
    expect(shouldPersistCustomTextWhenTtsUnavailable('Use client triggered tts failed: 400060')).toBe(true);
    expect(shouldPersistCustomTextWhenTtsUnavailable('Directive unsupported')).toBe(true);
    expect(shouldPersistCustomTextWhenTtsUnavailable('Use client triggered tts failed: 400061')).toBe(false);
  });

  it('finalizes custom text by joining chunks', () => {
    expect(finalizeCustomLlmReplyText(['没错，', '我就是', '江户川柯南。'])).toBe('没错，我就是江户川柯南。');
  });
});
