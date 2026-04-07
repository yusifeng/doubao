import { render, waitFor } from '@testing-library/react-native';

const mockUseVoiceAssistantRuntime = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
const mockNavigationDispatch = jest.fn();
const mockNavigationCanGoBack = jest.fn();
const mockNavigationGoBack = jest.fn();
let capturedVoiceScreenProps: Record<string, unknown> | null = null;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const serializedHref = typeof href === 'string' ? href : JSON.stringify(href);
    return <>{serializedHref}</>;
  },
  router: {
    replace: mockRouterReplace,
    push: mockRouterPush,
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useNavigation: () => ({
    dispatch: mockNavigationDispatch,
    canGoBack: mockNavigationCanGoBack,
    goBack: mockNavigationGoBack,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  DrawerActions: {
    openDrawer: () => ({ type: 'OPEN_DRAWER' }),
  },
}));

jest.mock('../../src/features/voice-assistant/ui/VoiceAssistantScreen', () => ({
  VoiceAssistantScreen: ({
    autoStartOnMount,
    embedded,
    ...rest
  }: {
    autoStartOnMount?: boolean;
    embedded?: boolean;
  }) => {
    capturedVoiceScreenProps = rest;
    return <>{`voice-screen:${autoStartOnMount ? 'auto' : 'manual'}:${embedded === false ? 'immersive' : 'embedded'}`}</>;
  },
}));

jest.mock('../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider', () => ({
  useVoiceAssistantRuntime: () => mockUseVoiceAssistantRuntime(),
}));

describe('voice assistant routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigationCanGoBack.mockReturnValue(false);
    capturedVoiceScreenProps = null;
  });

  it('redirects home route to the active conversation in text mode', () => {
    mockUseVoiceAssistantRuntime.mockReturnValue({ activeConversationId: 'conv-1' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HomeRoute = require('../(chat)/index').default;

    const view = render(<HomeRoute />);
    const output = JSON.stringify(view.toJSON());

    expect(output).toContain('\\"conversationId\\":\\"conv-1\\"');
    expect(output).toContain('\\"mode\\":\\"text\\"');
  });

  it('renders voice route as an immersive screen route instead of redirecting', () => {
    mockUseVoiceAssistantRuntime.mockReturnValue({
      activeConversationId: 'conv-9',
      conversations: [{ id: 'conv-9' }],
      isVoiceActive: false,
      selectConversation: jest.fn().mockResolvedValue(true),
      toggleVoice: jest.fn().mockResolvedValue(undefined),
    });
    mockUseLocalSearchParams.mockReturnValue({ conversationId: 'conv-9' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VoiceRoute = require('../(chat)/voice/[conversationId]').default;

    const view = render(<VoiceRoute />);
    const output = JSON.stringify(view.toJSON());

    expect(output).toContain('voice-screen:auto:immersive');
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('redirects legacy conversation voice mode query to the dedicated voice route', async () => {
    mockUseVoiceAssistantRuntime.mockReturnValue({
      activeConversationId: 'conv-1',
      conversations: [{ id: 'conv-1' }],
      isVoiceActive: false,
      selectConversation: jest.fn().mockResolvedValue(true),
    });
    mockUseLocalSearchParams.mockReturnValue({ conversationId: 'conv-1', mode: 'voice' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ConversationRoute = require('../(chat)/conversation/[conversationId]').default;

    render(<ConversationRoute />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith({
        pathname: '/voice/[conversationId]',
        params: { conversationId: 'conv-1' },
      });
    });
  });

  it('uses goBack when exiting voice route after push navigation', async () => {
    mockNavigationCanGoBack.mockReturnValue(true);
    mockUseVoiceAssistantRuntime.mockReturnValue({
      activeConversationId: 'conv-2',
      conversations: [{ id: 'conv-2' }],
      isVoiceActive: false,
      selectConversation: jest.fn().mockResolvedValue(true),
      toggleVoice: jest.fn().mockResolvedValue(undefined),
    });
    mockUseLocalSearchParams.mockReturnValue({ conversationId: 'conv-2' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VoiceRoute = require('../(chat)/voice/[conversationId]').default;

    render(<VoiceRoute />);

    expect(capturedVoiceScreenProps).toBeTruthy();
    const onExitVoice = capturedVoiceScreenProps?.onExitVoice as (() => void) | undefined;
    expect(onExitVoice).toBeTruthy();
    onExitVoice?.();

    await waitFor(() => {
      expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
