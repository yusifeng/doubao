# Expo RN Agent Reference

## 命令基线

- 启动：`pnpm run start`
- Android：`pnpm run android`
- iOS：`pnpm run ios`
- Web：`pnpm run web`
- 测试：`pnpm run test`

## 调试边界

- `expo start --android` 需要可用设备或可启动模拟器。
- `expo run:android` 属于原生构建路径，要求本地原生工具链完整（如 JDK 17+）。

## 测试策略

- 优先组件测试（Jest + RNTL）。
- 断言优先面向用户可观察行为，而非实现细节。
