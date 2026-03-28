import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantSettingsScreen } from '../VoiceAssistantSettingsScreen';

jest.mock('@gorhom/bottom-sheet', () => {
  const ReactLib = require('react');
  const { View: RNView } = require('react-native');

  const BottomSheetModal = ReactLib.forwardRef(({ children, testID }: any, ref: any) => {
    ReactLib.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
    }));
    return <RNView testID={testID}>{children}</RNView>;
  });

  return {
    BottomSheetModalProvider: ({ children }: any) => <RNView>{children}</RNView>,
    BottomSheetModal,
    BottomSheetView: ({ children, ...rest }: any) => <RNView {...rest}>{children}</RNView>,
    BottomSheetScrollView: ({ children, ...rest }: any) => <RNView {...rest}>{children}</RNView>,
    BottomSheetBackdrop: () => <RNView />,
  };
});

function createSession(): UseTextChatResult {
  return {
    status: 'idle',
    conversations: [],
    activeConversationId: 'conv-1',
    messages: [],
    liveUserTranscript: '',
    pendingAssistantReply: '',
    createConversation: jest.fn().mockResolvedValue('conv-2'),
    selectConversation: jest.fn().mockResolvedValue(true),
    sendText: jest.fn().mockResolvedValue(undefined),
    isVoiceActive: false,
    supportsVoiceInputMute: true,
    isVoiceInputMuted: false,
    toggleVoice: jest.fn().mockResolvedValue(undefined),
    toggleVoiceInputMuted: jest.fn().mockResolvedValue(undefined),
    interruptVoiceOutput: jest.fn().mockResolvedValue(undefined),
    voiceModeLabel: 'Android Dialog SDK 模式（官方S2S链路）',
    textReplySourceLabel: '文本回复来源：官方S2S（Dialog SDK）',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    runtimeConfig: {
      replyChainMode: 'official_s2s',
      llm: {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
        model: 'deepseek-chat',
        provider: 'openai-compatible',
      },
      s2s: {
        appId: 'app-id',
        accessToken: 'token',
        wsUrl: 'wss://example.com/realtime/dialogue',
      },
      androidDialog: {
        appKeyOverride: '',
      },
      voice: {
        speakerId: 'S_mXRP7Y5M1',
        speakerLabel: '江户川柯南（默认音色）',
        sourceType: 'default',
      },
    },
    saveRuntimeConfig: jest.fn().mockResolvedValue({ ok: true, message: '配置已保存' }),
    testLLMConfig: jest.fn().mockResolvedValue({ ok: true, message: 'LLM 连接成功' }),
    testS2SConnection: jest.fn().mockResolvedValue({ ok: true, message: 'S2S 连接成功' }),
  };
}

describe('VoiceAssistantSettingsScreen', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = undefined as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function renderScreen(ui: React.ReactElement) {
    return render(<SafeAreaProvider>{ui}</SafeAreaProvider>);
  }

  it('shows llm section only in custom_llm mode', async () => {
    const session = createSession();
    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    expect(screen.queryByTestId('settings-llm-section')).toBeNull();

    fireEvent.press(screen.getByText('自定义 LLM'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-llm-section')).toBeTruthy();
    });
  });

  it('supports opening drawer and saving config', async () => {
    const session = createSession();
    const onOpenDrawer = jest.fn();

    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={onOpenDrawer} />);

    fireEvent.press(screen.getByTestId('settings-open-drawer-button'));
    fireEvent.press(screen.getByTestId('settings-save-button'));

    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(session.saveRuntimeConfig).toHaveBeenCalledTimes(1);
    });
  });

  it('tests llm and s2s with draft values', async () => {
    const session = createSession();

    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.changeText(screen.getByTestId('settings-s2s-app-id-input'), 'updated-app');
    fireEvent.press(screen.getByTestId('settings-test-s2s-button'));

    await waitFor(() => {
      expect(session.testS2SConnection).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'updated-app' }),
      );
    });

    fireEvent.press(screen.getByText('自定义 LLM'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-llm-section')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('settings-provider-option-openai-compatible'));
    fireEvent.press(screen.getByTestId('settings-model-selector-toggle'));
    fireEvent.press(screen.getByTestId('settings-model-option-deepseek-chat'));
    fireEvent.press(screen.getByTestId('settings-test-llm-button'));

    await waitFor(() => {
      expect(session.testLLMConfig).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'deepseek-chat' }),
      );
    });
  });

  it('allows selecting voices from the option list', async () => {
    const session = createSession();

    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-voice-selector-toggle'));
    fireEvent.press(screen.getByTestId('settings-voice-option-saturn_zh_female_aojiaonvyou_tob'));
    fireEvent.press(screen.getByTestId('settings-save-button'));

    await waitFor(() => {
      expect(session.saveRuntimeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: expect.objectContaining({ speakerId: 'saturn_zh_female_aojiaonvyou_tob' }),
        }),
      );
    });
  });

  it('applies custom voice from bottom sheet input', async () => {
    const session = createSession();
    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-voice-selector-toggle'));
    fireEvent.press(screen.getByTestId('settings-voice-custom-edit-row'));
    fireEvent.changeText(screen.getByTestId('settings-voice-custom-input'), 'S_custom_voice_001');
    fireEvent.press(screen.getByTestId('settings-voice-custom-apply'));
    fireEvent.press(screen.getByTestId('settings-save-button'));

    await waitFor(() => {
      expect(session.saveRuntimeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: expect.objectContaining({
            speakerId: 'S_custom_voice_001',
            speakerLabel: '自定义音色',
            sourceType: 'remote',
          }),
        }),
      );
    });
  });

  it('shows custom voice tip dialog', () => {
    const session = createSession();
    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-voice-custom-tip'));
    expect(screen.getByTestId('settings-voice-tip-modal')).toBeTruthy();
    expect(screen.getByText('如何获取自定义音色')).toBeTruthy();

    fireEvent.press(screen.getByTestId('settings-voice-tip-close'));
  });

  it('loads model list through api endpoint', async () => {
    const session = createSession();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.press(screen.getByText('自定义 LLM'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-llm-section')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('settings-provider-option-openai-compatible'));

    fireEvent.press(screen.getByTestId('settings-fetch-models-button'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByTestId('settings-model-selector-toggle'));
    fireEvent.press(screen.getByTestId('settings-model-option-deepseek-chat'));
    fireEvent.press(screen.getByTestId('settings-save-button'));
    await waitFor(() => {
      expect(session.saveRuntimeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          llm: expect.objectContaining({ model: 'deepseek-chat' }),
        }),
      );
    });
  });

  it('applies custom model from bottom sheet input', async () => {
    const session = createSession();
    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.press(screen.getByText('自定义 LLM'));
    fireEvent.press(screen.getByTestId('settings-provider-option-openai-compatible'));
    fireEvent.press(screen.getByTestId('settings-model-selector-toggle'));
    fireEvent.press(screen.getByTestId('settings-model-custom-edit-row'));
    fireEvent.changeText(screen.getByTestId('settings-model-custom-input'), 'my-custom-model-x');
    fireEvent.press(screen.getByTestId('settings-model-custom-apply'));
    fireEvent.press(screen.getByTestId('settings-save-button'));

    await waitFor(() => {
      expect(session.saveRuntimeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          llm: expect.objectContaining({ model: 'my-custom-model-x' }),
        }),
      );
    });
  });

  it('shows provider bottom sheet and supports selection', async () => {
    const session = createSession();
    session.runtimeConfig.llm.provider = '';
    renderScreen(<VoiceAssistantSettingsScreen session={session} onOpenDrawer={jest.fn()} />);

    fireEvent.press(screen.getByText('自定义 LLM'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-llm-section')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('settings-provider-selector-toggle'));
    fireEvent.press(screen.getByTestId('settings-provider-option-openai-compatible'));
    fireEvent.press(screen.getByTestId('settings-save-button'));

    await waitFor(() => {
      expect(session.saveRuntimeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          llm: expect.objectContaining({ provider: 'openai-compatible' }),
        }),
      );
    });
  });
});
