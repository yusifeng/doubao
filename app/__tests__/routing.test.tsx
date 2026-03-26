import { render } from '@testing-library/react-native';

const mockUseVoiceAssistantRuntime = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const serializedHref = typeof href === 'string' ? href : JSON.stringify(href);
    return <>{serializedHref}</>;
  },
  router: {
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider', () => ({
  useVoiceAssistantRuntime: () => mockUseVoiceAssistantRuntime(),
}));

describe('voice assistant routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('redirects home route to the active conversation in text mode', () => {
    mockUseVoiceAssistantRuntime.mockReturnValue({ activeConversationId: 'conv-1' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HomeRoute = require('../index').default;

    const view = render(<HomeRoute />);
    const output = JSON.stringify(view.toJSON());

    expect(output).toContain('\\"conversationId\\":\\"conv-1\\"');
    expect(output).toContain('\\"mode\\":\\"text\\"');
  });

  it('redirects legacy voice route to conversation voice mode', () => {
    mockUseVoiceAssistantRuntime.mockReturnValue({ activeConversationId: 'conv-1' });
    mockUseLocalSearchParams.mockReturnValue({ conversationId: 'conv-9' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VoiceRoute = require('../voice/[conversationId]').default;

    const view = render(<VoiceRoute />);
    const output = JSON.stringify(view.toJSON());

    expect(output).toContain('\\"conversationId\\":\\"conv-9\\"');
    expect(output).toContain('\\"mode\\":\\"voice\\"');
  });
});
