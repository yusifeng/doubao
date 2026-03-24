# my-doubao2

基于官方 Expo Router 模板重建的语音助手仓库。

目标：

- 用官方 Expo 底座替换旧仓库里由 AI 生成脚手架带来的工具链偏差
- 保留现有语音助手主链路、角色设定、S2S 接口与 NativeWind 视觉方向
- 先稳定 JS/Expo 路径，再在下一阶段补迁 Android 原生音频模块

## 技术栈

- Expo SDK 55
- Expo Router
- TypeScript
- NativeWind
- Jest + React Native Testing Library

## 常用命令

```bash
pnpm install
pnpm run start
pnpm run android
pnpm run android:run
pnpm run test
pnpm exec tsc --noEmit
```

## 环境变量

复制 `.env.example` 并填入以下变量：

- `EXPO_PUBLIC_S2S_ACCESS_TOKEN`
- `EXPO_PUBLIC_S2S_APP_ID`
- `EXPO_PUBLIC_S2S_WS_URL`
- `EXPO_PUBLIC_VOICE_PIPELINE_MODE`

## 文档入口

- [AGENTS.md](./AGENTS.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/index.md](./docs/index.md)
- [docs/PLANS.md](./docs/PLANS.md)
