# Plan: my-doubao2 Migration

## 目标

在 `my-doubao2` 上用官方 Expo Router 底座重建语音助手项目，并迁移旧仓库中已经验证过的 JS 业务层、NativeWind 页面与 docs-first 规范。

## 当前阶段

- 已切换到官方 Expo Router 模板（SDK 55）
- 已接入 NativeWind 官方链路
- 已迁移 voice-assistant JS 主链路与角色同步脚本
- 已建立首页 / 会话页 / 语音页三页结构
- 已补充会话页 / 语音页的显式页面内导航，不再只依赖系统返回键
- 已把首页 / 会话页 / 语音页的共享视觉语义收口到 `src/core/theme/mappers.ts`，减少散落硬编码
- 已抽出共享 `VoiceAssistantMessageBubble`，统一旁白括号化与消息气泡展示
- 已确认 `src/app` 会被 Expo Router 误判为路由根目录，因此迁移实现统一落到 `src/core`
- 已在 Android 模拟器上验证首页 / 会话页 / 语音页落屏
- 已验证文本消息回合可收发，语音权限弹窗、开始通话、挂断通话链路可工作
- 已迁入 Android 原生 `RNRealtimePcmPlayer`，并在 `MainApplication` 中完成手动注册
- 已通过 `:app:assembleDebug` 与模拟器安装验证原生 PCM 模块已编入新包
- 已把三张 Figma 设计稿接为新的 UI 基线：会话列表 `2003:442`、会话详情 `2003:331`、语音场景 `2003:606`
- 已把首页、会话页、语音页改为按 Figma 节点重排的 NativeWind 页面结构，不再沿用旧橙色大卡片壳
- 已移除首页 mock session 条目，首页列表只展示真实本地会话数据
- 已移除聊天输入框上方的假功能 chips，改为真实的文字 / 语音模式切换语义
- 已确认 realtime_audio 目前尚未把用户语音 transcript 接入消息流，后续需要单独补协议/转写映射

## 本阶段验收

- `pnpm exec tsc --noEmit` 通过
- `pnpm run test --runInBand` 通过
- `expo start --dev-client --clear` 下 NativeWind 样式正常落屏
- Expo Router 三页路由无白屏与路由错误
- 语音助手主链路在 JS/Expo 层可继续演进
- `app/` 为唯一路由入口，`src/core/` 不再与 Expo Router 根目录冲突
- Android debug 包已包含自定义 `RNRealtimePcmPlayer` 原生模块
- Android 模拟器下已验证：
  - 首页展示 Figma 对话列表形态；
  - 会话页展示 Figma 风格消息层级与底部 composer；
  - 语音页展示 Figma 风格全屏语音场景，并保留运行态提示与原生播放链。

## 下一阶段

- 在真机上验证原生 PCM 播放的实际音质、断续与噪音表现
- 继续收口首页列表数据与真实会话数据之间的映射策略
- 为 realtime_audio 补用户侧 transcript 展示，避免语音页只能靠模型回复判断输入是否发送成功
- 评估把 `expo-av` 迁到更新的 `expo-audio` / `expo-video` 路径
- 补充 Figma 对齐后的新截图，更新 design-docs 与 pitfalls 中的运行时差异说明
