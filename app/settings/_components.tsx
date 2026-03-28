import { DrawerActions } from '@react-navigation/native';
import { useNavigation, useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceAssistantIcon } from '../../src/features/voice-assistant/ui/VoiceAssistantIcon';

export function SettingsScaffold({
  title,
  subtitle,
  children,
  showBack = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  const navigation = useNavigation();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-[#FBFCFE]">
      <View className="flex-row items-center border-b border-black/5 bg-white px-4 pb-3 pt-2">
        <TouchableOpacity
          className="h-10 w-10 items-center justify-center rounded-full"
          onPress={() => {
            if (showBack) {
              router.replace('/settings');
              return;
            }
            navigation.dispatch(DrawerActions.openDrawer());
          }}
          testID={showBack ? 'settings-back-button' : 'settings-open-drawer-button'}
        >
          <VoiceAssistantIcon name={showBack ? 'back' : 'menu'} size={22} color="#111827" />
        </TouchableOpacity>
        <View className="flex-1 items-center px-2">
          <Text className="text-[17px] font-semibold text-slate-900">{title}</Text>
          {subtitle ? <Text className="mt-0.5 text-[11px] text-slate-400">{subtitle}</Text> : null}
        </View>
        <View className="h-10 w-10" />
      </View>
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SettingsEntryRow({
  title,
  summary,
  onPress,
  testID,
}: {
  title: string;
  summary: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-4"
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-1 pr-3">
        <Text className="text-[14px] font-semibold text-slate-900">{title}</Text>
        <Text className="mt-1 text-[12px] text-slate-500" numberOfLines={1}>
          {summary}
        </Text>
      </View>
      <Text className="text-[16px] text-slate-300">{'>'}</Text>
    </TouchableOpacity>
  );
}

export function SettingsPrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      className={`mt-4 items-center rounded-2xl px-4 py-3 ${disabled ? 'bg-slate-400' : 'bg-slate-900'}`}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Text className="text-[14px] font-semibold text-white">{label}</Text>
    </TouchableOpacity>
  );
}
