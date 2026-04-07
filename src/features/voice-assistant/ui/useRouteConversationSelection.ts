import { useEffect, useRef } from 'react';

type UseRouteConversationSelectionArgs = {
  requestedConversationId: string | null;
  activeConversationId: string | null;
  selectConversation: (conversationId: string) => Promise<boolean>;
  onFallbackConversation: (conversationId: string) => void;
  enabled?: boolean;
};

export function useRouteConversationSelection({
  requestedConversationId,
  activeConversationId,
  selectConversation,
  onFallbackConversation,
  enabled = true,
}: UseRouteConversationSelectionArgs) {
  const selectingConversationIdRef = useRef<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!requestedConversationId || !activeConversationId) {
      return;
    }
    if (requestedConversationId === activeConversationId) {
      selectingConversationIdRef.current = null;
      return;
    }
    if (selectingConversationIdRef.current === requestedConversationId) {
      return;
    }

    selectingConversationIdRef.current = requestedConversationId;
    let cancelled = false;

    void selectConversation(requestedConversationId)
      .then((changed) => {
        if (cancelled || changed) {
          return;
        }
        const fallbackConversationId = activeConversationIdRef.current;
        if (!fallbackConversationId) {
          return;
        }
        onFallbackConversation(fallbackConversationId);
      })
      .finally(() => {
        if (!cancelled && selectingConversationIdRef.current === requestedConversationId) {
          selectingConversationIdRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      if (selectingConversationIdRef.current === requestedConversationId) {
        selectingConversationIdRef.current = null;
      }
    };
  }, [
    activeConversationId,
    enabled,
    onFallbackConversation,
    requestedConversationId,
    selectConversation,
  ]);
}
