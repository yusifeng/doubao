import { useMemo, useState } from 'react';
import type { ConversationStatus } from '../types/model';
import { getInitialStatus } from '../service/useCases';

export function useSessionMachine() {
  const [status, setStatus] = useState<ConversationStatus>(getInitialStatus());

  const actions = useMemo(
    () => ({
      toIdle: () => setStatus('idle'),
      toListening: () => setStatus('listening'),
      toThinking: () => setStatus('thinking'),
      toSpeaking: () => setStatus('speaking'),
      toError: () => setStatus('error'),
    }),
    [],
  );

  return { status, ...actions };
}
