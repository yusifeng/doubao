# Plan: my-doubao2 Migration

## 目标

在 `my-doubao2` 上用官方 Expo Router 底座重建语音助手项目，并迁移旧仓库中已经验证过的 JS 业务层、NativeWind 页面与 docs-first 规范。

## 当前阶段

- 已切换到官方 Expo Router 模板（SDK 55）
- 已接入 NativeWind 官方链路
- 已迁移 voice-assistant JS 主链路与角色同步脚本
- 已确认主产品结构不再是“三页并列”，而是**单一会话页 + 会话抽屉 + 文字/语音双模式**
- 已将首页收口为当前会话重定向入口，不再保留独立 session 首页
- 已将 `/voice/[conversationId]` 收口为兼容入口，并重定向到会话页的 `mode=voice`
- 已把会话页重构为单页双模式壳，抽屉中使用真实本地会话数据
- 已把共享视觉语义收口到 `src/core/theme/mappers.ts`，减少散落硬编码
- 已抽出共享 `VoiceAssistantMessageBubble`，统一旁白括号化与消息气泡展示
- 已确认 `src/app` 会被 Expo Router 误判为路由根目录，因此迁移实现统一落到 `src/core`
- 已迁入 Android 原生 `RNRealtimePcmPlayer` 与 Android Dialog SDK 主链路
- 已验证文本消息回合可收发，语音权限弹窗、开始通话、挂断通话链路可工作
- 已把三张 Figma 设计稿接为新的 UI 基线：会话列表抽屉 `2003:442`、会话详情 `2003:331`、语音模式 `2003:606`

## 本阶段验收

- `pnpm exec tsc --noEmit` 通过
- `pnpm run test --runInBand` 通过
- `expo start --dev-client --clear` 下 NativeWind 样式正常落屏
- Expo Router 当前只保留“会话入口 + 会话页 + 兼容语音入口”结构，无白屏与路由错误
- 会话抽屉展示真实本地会话，可新建、可切换
- 文字模式与语音模式共享同一会话上下文与消息流
- Android debug 包已包含当前原生语音能力

## 下一阶段

- 在真机上继续验证多轮语音切换下的稳定性
- 收口会话抽屉的搜索体验与空状态文案
- 继续对齐会话主页面与语音模式的最终视觉细节
- 已实现设置页（模型 / 音色 / 运行参数）并接入运行时配置持久化
- 会话持久化升级到 SQLite（进行中，旧 AsyncStorage 历史数据不迁移）
