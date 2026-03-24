import { Text, View } from 'react-native';

type HelloWorldProps = {
  name: string;
};

export function HelloWorld({ name }: HelloWorldProps) {
  return (
    <View
      className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5"
      testID="hello-world-card"
    >
      <Text className="text-xl font-bold text-white" maxFontSizeMultiplier={1.3}>
        Hello, {name}!
      </Text>
      <Text className="mt-2 text-slate-300" maxFontSizeMultiplier={1.3}>
        RN + NativeWind + Jest 已就绪
      </Text>
    </View>
  );
}
