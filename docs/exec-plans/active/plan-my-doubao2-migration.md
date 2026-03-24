# Plan: my-doubao2 Migration

## 目标

在 `my-doubao2` 上用官方 Expo Router 底座重建语音助手项目，并迁移旧仓库中已经验证过的 JS 业务层、NativeWind 页面与 docs-first 规范。

## 当前阶段

- 已切换到官方 Expo Router 模板（SDK 55）
- 已接入 NativeWind 官方链路
- 已迁移 voice-assistant JS 主链路与角色同步脚本
- 已建立首页 / 会话页 / 语音页三页结构
- 已确认 `src/app` 会被 Expo Router 误判为路由根目录，因此迁移实现统一落到 `src/core`
- 已在 Android 模拟器上验证首页 / 会话页 / 语音页落屏
- 已验证文本消息回合可收发，语音权限弹窗、开始通话、挂断通话链路可工作
- Android 原生 `RNRealtimePcmPlayer` 暂未迁入，保留到下一阶段

## 本阶段验收

- `pnpm exec tsc --noEmit` 通过
- `pnpm run test --runInBand` 通过
- `expo start --dev-client --clear` 下 NativeWind 样式正常落屏
- Expo Router 三页路由无白屏与路由错误
- 语音助手主链路在 JS/Expo 层可继续演进
- `app/` 为唯一路由入口，`src/core/` 不再与 Expo Router 根目录冲突
- Android 模拟器下已验证：
  - 首页展示 Hero、状态卡片、操作按钮；
  - 会话页可发送文本并收到 S2S 回复；
  - 语音页可触发麦克风权限、进入“正在听你说”、再挂断回到空闲态。

## 下一阶段

- 收口视觉同款细节
- 再评估是否迁入 `RNRealtimePcmPlayer`
- 评估把 `expo-av` 迁到更新的 `expo-audio` / `expo-video` 路径
