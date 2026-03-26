# Plan: Android Dialog SDK Cutover

## 目标

在 `my-doubao2` 中将 Android 平台的文字对话与实时语音对话，从当前 `WebSocketS2SProvider + ExpoRealtimeAudioProvider` 主链，切换为火山官方 Dialog Android SDK。

本次切换范围明确为：

- Android：直接硬切
- 语音输入：SDK 负责录音 / AEC / ASR
- 语音输出：SDK 负责 TTS / 播放
- 回复内容：当前 Android 默认使用服务端自动回复；业务侧 `ReplyProvider` 保留为后续切自有 LLM 的扩展点
- iOS / Web：继续保留现有 JS/WebSocket 路线

## 当前实施拆分

### Phase A：架构与原生桥接

- 新增 `DialogEngineProvider` 契约与 Android 实现
- 新增 `ReplyProvider` 契约与默认实现
- Android 原生层接入 `speechengine_tob`
- 在 `MainApplication` 中注册新的 RN package
- 增加 AEC 模型资源文件并由原生桥负责拷贝/定位
- Android 默认工作模式对齐官方 `DialogActivity`：`SYNC_STOP_ENGINE -> START_ENGINE`，并使用 `DIALOG_WORK_MODE_DEFAULT`
- 保留 `UseServerTriggerTts / UseClientTriggerTts` 原生桥，仅作为后续 delegate / 自有 LLM 模式扩展口

### Phase B：Runtime 接管 Android 主链

- `runtime/providers.ts` 按平台分发：
  - Android：`DialogEngineProvider`
  - 其他平台：现有 `S2SProvider + AudioProvider`
- `useTextChat` 的 Android 分支改为事件驱动：
  - `asr_partial` -> 语音页实时转写
  - `asr_final` -> 用户最终消息入库
  - 平台自动回复直接沿用 SDK 默认 Dialog 自动播报链路
  - `ReplyProvider` 保留给后续自有 LLM + `UseClientTriggerTts + ChatTTSText`

### Phase C：UI/状态与测试收口

- 语音页状态提示由 SDK 事件驱动，不再主要依赖本地音频能量推测
- 聊天页文字模式在 Android 上也走 SDK 引擎生命周期
- 更新 Jest 测试覆盖 provider 选择、事件映射、最终消息入库
- 更新 design-doc / pitfalls / commit-history

## 验收

- `pnpm exec tsc --noEmit`
- `pnpm run test --runInBand`
- `expo run:android` 可编译安装
- 真机日志可见：
  - `ENGINE_START`
  - `DIALOG_ASR_INFO`
  - `DIALOG_ASR_RESPONSE`
  - `DIALOG_ASR_ENDED`
  - `DIALOG_CHAT_RESPONSE`
  - `DIALOG_CHAT_ENDED`
  - `ENGINE_STOP`
- 语音页可见：
  - 实时转写
  - 最终用户文本
  - 平台自动回复生成的 assistant 文本与 SDK 默认播报

## 当前风险

- `S_mXRP7Y5M1` 的资源归属必须由火山后台保证正确；客户端不做自动回退。
- 当前仓库还没有真实外部 LLM Provider；`ReplyProvider` 暂保留为未来扩展口，不作为当前 Android 默认主链。
- Android SDK 额外依赖 `appKey`；当前支持通过 `EXPO_PUBLIC_S2S_APP_KEY` 显式传入，未提供时使用现有 dialog 资源默认 key。
