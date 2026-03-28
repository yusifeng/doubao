import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

export type AppToastType = 'info' | 'success' | 'error';

type ToastState = {
  visible: boolean;
  message: string;
  type: AppToastType;
};

type AppToastContextValue = {
  showToast: (message: string, type?: AppToastType, ttlMs?: number) => void;
};

const AppToastContext = createContext<AppToastContextValue>({
  showToast: () => undefined,
});

function AppToastOverlay({ state }: { state: ToastState }) {
  if (!state.visible || !state.message) {
    return null;
  }

  const colorClass =
    state.type === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : state.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-white text-slate-700';

  return (
    <View pointerEvents="none" className="absolute left-4 right-4 top-4 z-[999] items-center">
      <View className={`w-full max-w-[420px] rounded-xl border px-4 py-3 shadow-sm ${colorClass}`}>
        <Text className="text-center text-[13px] font-medium">{state.message}</Text>
      </View>
    </View>
  );
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: AppToastType = 'info', ttlMs = 2200) => {
    setState({
      visible: true,
      message,
      type,
    });
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setState((current) => ({ ...current, visible: false }));
    }, ttlMs);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const value = useMemo<AppToastContextValue>(
    () => ({
      showToast,
    }),
    [showToast],
  );

  return (
    <AppToastContext.Provider value={value}>
      {children}
      <AppToastOverlay state={state} />
    </AppToastContext.Provider>
  );
}

export function useAppToast(): AppToastContextValue {
  return useContext(AppToastContext);
}
