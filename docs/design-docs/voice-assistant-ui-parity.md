# Voice Assistant UI Parity Notes

## Figma Baseline

- File key: `xslmiLsD9WDdEkb4W1iBJe`
- Session list drawer reference: node `2003:442`
- Conversation detail reference: node `2003:331`
- Voice mode reference: node `2003:606`

## Visual Direction

### Conversation shell

- 默认主界面是聊天会话，不再先展示独立 session 页。
- 顶部是当前会话标题、抽屉按钮、模式切换按钮。
- 主体消息区维持聊天页基线：用户蓝色气泡、助手浅灰/白色卡片层级。
- 底部 composer 只保留真实操作：文本输入、发送、切到语音。

### Session drawer

- Session list 不再独立成页，而是从会话页左侧拉出抽屉。
- 抽屉交互由 `@react-navigation/drawer` / Expo Router Drawer 承载，依赖导航层提供原生级滑出和遮罩动画。
- 列表行继续使用真实本地会话数据，不允许 mock showcase 条目。
- 抽屉只保留真实能力：搜索过滤、新建会话、切换会话、低优先级连接测试。
- 底部假 tab bar 从产品页面中移除。

### Voice mode

- 语音模式是会话页的沉浸覆盖态，不再是单独产品心智。
- 延续 `2003:606` 的粉紫蓝氛围背景、大头像、状态点与 transcript 胶囊。
- 切到语音模式后自动开始收听，不再要求用户二次点击“开始通话”。
- 语音模式内部再区分两种展示形态：
  - `avatar`：头像主视觉 + 状态文案
  - `dialogue`：对话文本展示 + 状态文案
- 两种展示形态统一使用三条状态文案，不再暴露 runtime 原始提示：
  - `正在听...`
  - `你已静音`
  - `说话或者点击打断`
- 右上角按钮不再直接退出语音，而是在语音模式内部切换 `avatar/dialogue` 展示。
- `avatar` 形态下不展示文字消息，只保留短状态文案：
  - `正在听...`
  - `你已静音`
  - `说话或者点击打断`
- 底部控制条对齐豆包的四键语义：
  - 第一个按钮：暂停/恢复接收用户语音
  - 当 assistant 正在播报时，第一键视觉和行为都切换到 `打断`
  - 第二、第三个按钮：占位按钮，当前不承诺业务能力
  - 第四个按钮：退出语音模式并回到同一会话的文字模式
- 语音主界面移除测试按钮、长解释文案与长消息卡片，只保留沉浸语音态必要信息。

## Implementation Rules

- NativeWind remains the primary styling path.
- Static class strings only; no dynamic Tailwind token interpolation.
- `StyleSheet` is limited to shadows, depth, and a few size-sensitive visual touches.
- Shared visual semantics live in `src/core/theme/mappers.ts` and `src/core/theme/tokens.ts`.
- Shared chat rendering lives in `src/features/voice-assistant/ui/VoiceAssistantMessageBubble.tsx`.

## Current Acceptance Checklist

- [x] `/` redirects directly into the active conversation instead of rendering a standalone session page.
- [x] Conversation route now owns both text mode and voice mode.
- [x] Session list is embedded as a left drawer backed by real local conversations.
- [x] Voice mode remains a full-screen immersive scene but is treated as the same conversation surface.
- [x] NativeWind is still the dominant styling mechanism.
