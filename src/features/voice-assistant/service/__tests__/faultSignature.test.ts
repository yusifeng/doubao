import { VOICE_FAULT_SIGNATURES, withFaultSignature } from '../faultSignature';

describe('faultSignature helpers', () => {
  it('prefixes messages with signature code', () => {
    expect(
      withFaultSignature(
        VOICE_FAULT_SIGNATURES.F7_TEXT_ROUND_FAILED,
        '本轮文本对话失败，请检查网络后重试。',
      ),
    ).toBe('[F7_TEXT_ROUND_FAILED] 本轮文本对话失败，请检查网络后重试。');
  });

  it('returns signature prefix when message is empty', () => {
    expect(withFaultSignature(VOICE_FAULT_SIGNATURES.F3_PLATFORM_LEAK_IN_CUSTOM, '   ')).toBe(
      '[F3_PLATFORM_LEAK_IN_CUSTOM]',
    );
  });

  it('avoids duplicate prefixes for same signature', () => {
    expect(
      withFaultSignature(
        VOICE_FAULT_SIGNATURES.F2_CLIENT_TTS_NOT_READY,
        '[F2_CLIENT_TTS_NOT_READY] 本轮自定义语音接管失败，已回到监听状态。',
      ),
    ).toBe('[F2_CLIENT_TTS_NOT_READY] 本轮自定义语音接管失败，已回到监听状态。');
  });
});
