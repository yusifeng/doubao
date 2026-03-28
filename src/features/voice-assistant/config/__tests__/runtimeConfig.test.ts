import {
  isCompleteLLMConfig,
  isCompleteS2SConfig,
  mergeRuntimeConfig,
  readRuntimeConfigFromEnv,
} from '../runtimeConfig';

describe('runtimeConfig', () => {
  test('mergeRuntimeConfig should not override base values with undefined', () => {
    const base = readRuntimeConfigFromEnv();
    const merged = mergeRuntimeConfig(base, {
      llm: {
        baseUrl: undefined,
        apiKey: undefined,
      },
      s2s: {
        appId: undefined,
        accessToken: undefined,
        wsUrl: undefined,
      },
      persona: {
        systemPrompt: undefined,
        source: undefined,
      },
      androidDialog: {
        appKeyOverride: undefined,
      },
      voice: {
        speakerId: undefined,
      },
    });

    expect(merged.llm.baseUrl).toBe(base.llm.baseUrl);
    expect(merged.llm.apiKey).toBe(base.llm.apiKey);
    expect(merged.s2s.appId).toBe(base.s2s.appId);
    expect(merged.s2s.accessToken).toBe(base.s2s.accessToken);
    expect(merged.s2s.wsUrl).toBe(base.s2s.wsUrl);
    expect(merged.persona.systemPrompt).toBe(base.persona.systemPrompt);
    expect(merged.persona.source).toBe(base.persona.source);
    expect(merged.androidDialog.appKeyOverride).toBe(base.androidDialog.appKeyOverride);
    expect(merged.voice.speakerId).toBe(base.voice.speakerId);
  });

  test('isComplete checks should be null-safe for legacy bad data', () => {
    expect(
      isCompleteS2SConfig({
        appId: undefined as unknown as string,
        accessToken: undefined as unknown as string,
        wsUrl: undefined as unknown as string,
      }),
    ).toBe(false);
    expect(
      isCompleteLLMConfig({
        baseUrl: undefined as unknown as string,
        apiKey: undefined as unknown as string,
        model: undefined as unknown as string,
        provider: 'openai-compatible',
      }),
    ).toBe(false);
  });
});
