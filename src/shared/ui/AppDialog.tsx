import { useEffect, useRef, type ReactNode } from "react";
import {
  Modal as NativeModal,
  Pressable,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

type AppDialogAction = {
  label: string;
  onPress: () => void;
  testID?: string;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
};

type AppDialogProps = {
  visible: boolean;
  title?: string;
  onBackdropPress?: () => void;
  onModalHide?: () => void;
  testID?: string;
  children?: ReactNode;
  actions?: AppDialogAction[];
};

function resolveActionColor(
  variant: AppDialogAction["variant"],
  disabled?: boolean,
) {
  if (disabled) {
    return "text-[#94A3B8]";
  }
  if (variant === "primary") {
    return "text-[#2563EB]";
  }
  if (variant === "danger") {
    return "text-[#DC2626]";
  }
  return "text-[#6B7280]";
}

export function AppDialog({
  visible,
  title,
  onBackdropPress,
  onModalHide,
  testID,
  children,
  actions,
}: AppDialogProps) {
  const { width: windowWidth } = useWindowDimensions();
  const previousVisibleRef = useRef(visible);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onModalHideRef = useRef(onModalHide);
  const dialogWidth = Math.min(300, windowWidth - 48);

  useEffect(() => {
    onModalHideRef.current = onModalHide;
  }, [onModalHide]);

  useEffect(() => {
    if (visible) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      previousVisibleRef.current = true;
      return;
    }

    if (previousVisibleRef.current) {
      if (process.env.NODE_ENV === "test") {
        onModalHideRef.current?.();
      } else {
        hideTimerRef.current = setTimeout(() => {
          onModalHideRef.current?.();
          hideTimerRef.current = null;
        }, 180);
      }
    }

    previousVisibleRef.current = false;
  }, [visible]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  const dialogCard = (
    <View
      className="overflow-hidden rounded-2xl bg-white"
      style={{ width: dialogWidth }}
    >
      {title ? (
        <View className="border-b border-black/5 px-4 py-3">
          <Text className="text-[16px] font-semibold text-[#111827]">
            {title}
          </Text>
        </View>
      ) : null}
      <View className="px-4 py-3">{children}</View>
      {actions?.length ? (
        <View className="flex-row items-center justify-end gap-5 border-t border-black/5 px-4 py-3">
          {actions.map((action) => (
            <TouchableOpacity
              key={action.testID ?? action.label}
              onPress={action.onPress}
              disabled={action.disabled}
              testID={action.testID}
            >
              <Text
                className={`text-[16px] font-medium ${resolveActionColor(action.variant, action.disabled)}`}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <NativeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onBackdropPress}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/35 px-6"
        onPress={onBackdropPress}
        testID={testID}
      >
        <Pressable className="w-full items-center" onPress={() => {}}>
          {dialogCard}
        </Pressable>
      </Pressable>
    </NativeModal>
  );
}
