import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { useTextChat } from './useTextChat';

const VoiceAssistantRuntimeContext = createContext<ReturnType<typeof useTextChat> | null>(null);

type VoiceAssistantRuntimeProviderProps = {
  children: ReactNode;
};

export function VoiceAssistantRuntimeProvider({
  children,
}: VoiceAssistantRuntimeProviderProps) {
  const session = useTextChat();

  return (
    <VoiceAssistantRuntimeContext.Provider value={session}>
      {children}
    </VoiceAssistantRuntimeContext.Provider>
  );
}

export function useVoiceAssistantRuntime() {
  const session = useContext(VoiceAssistantRuntimeContext);
  if (!session) {
    throw new Error('useVoiceAssistantRuntime must be used inside VoiceAssistantRuntimeProvider');
  }
  return session;
}
