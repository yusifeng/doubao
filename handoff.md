# Handoff

本文档用于将当前工作从 `/Users/david/Documents/github/my-doubao2` 平滑交接到新的真实开发目录。

## 1. 当前产品状态

当前项目已经不再是“session 页 + 聊天页 + 语音页”三套独立产品心智，而是收口到：

- 唯一主页面：会话页
- 两种主模式：文字模式 / 语音模式
- 会话列表：Drawer 抽屉，不再作为独立首页
- Android 语音底层：Dialog SDK
- Android 当前回复来源：平台服务端自动回复
- 未来可扩展：`ReplyProvider` 可替换成自有 LLM

### 当前已成立能力

1. 文字聊天与语音聊天共享同一条会话上下文
2. 语音页内部支持两种展示形态：
   - `avatar`
   - `dialogue`
3. 右上角 `字` 只在语音模式内切换展示，不再直接退出语音
4. 底部 `X` 是真正退出语音模式的入口
5. Android 已切到官方 Dialog SDK 路线
6. 真机调试链路已打通，Dev Client 可跑
7. 手动点击打断已经实现第一版：
   - 停止当前 assistant 语音
   - 停止当前 assistant 文本继续增长
   - 保留已显示的部分文字
   - 状态切回 `正在听...`

### 当前尚未完成 / 仍需明确实现的能力

1. 语音插话打断（用户说话自动打断 assistant）
2. 真正的“会话内静音”能力
   - 不是 stop call
   - 不是退出语音
   - 而是保持会话仍在，只暂停收麦
3. 语音页视觉仍未完全对齐豆包
4. 设置页未开始
   - 模型切换
   - 音色切换
   - 参数设置
5. 自有 LLM 尚未接入，当前 Android 仍使用平台自动回复

## 2. 接下来最值得优先做的事

### P0：语音页交互与视觉收口

这是最近几轮用户最关注的方向，优先级最高。

#### 需要继续做的 UI/交互点

1. 语音页继续减重，往豆包对齐
   - 顶部 header 更轻
   - 底部四按钮的间距、底色、层级继续收口
   - `avatar` 态只显示头像和状态，不显示文字展示
   - `dialogue` 态展示对话文本，风格继续向豆包对齐

2. 语音页的状态文案统一成产品语义
   当前建议目标：
   - `正在听...`
   - `你已静音`
   - `说话或者点击打断`

3. 第一个按钮的行为继续完善
   当前已支持：
   - assistant 正在说时，点击执行手动打断
   尚未支持完整语义：
   - 会话内静音 / 恢复收音

### P1：插话打断

当前已经完成“点击打断”的第一版。下一步应该研究：

- 用户在 assistant 播报中直接开口
- 是否能通过 SDK 事件 + 当前运行态
- 把这件事落成“自动打断当前输出，但不丢上下文”

产品目标已经明确：

1. 当前 assistant 语音立即停止
2. 当前 assistant 文本停止继续增长
3. 已输出文本保留
4. 页面切回 `正在听...`
5. 会话上下文不丢

### P2：真正的会话内静音

当前第一个按钮还不是完整的豆包语义。
后面应该补成：

- 语音模式不断开
- 会话不结束
- 仅暂停接收用户麦克风输入
- 再次点击可恢复

### P3：自有 LLM 接入

当前架构已经保留了 `ReplyProvider` 这个扩展点。
后面如果要切自己的模型，优先建议：

- 保持 Android SDK 负责 ASR / TTS / AEC / 播放
- 自有 LLM 只负责生成回复文本
- 再决定是否切到 delegate / client-triggered TTS 路线

## 3. 当前最重要的文件

### 路由与页面入口

1. `/Users/david/Documents/github/my-doubao2/app/index.tsx`
- 首页入口
- 当前会自动进入最近会话，而不是独立 session 页

2. `/Users/david/Documents/github/my-doubao2/app/conversation/[conversationId].tsx`
- 当前唯一主会话页面入口

3. `/Users/david/Documents/github/my-doubao2/app/voice/[conversationId].tsx`
- 兼容入口
- 进入后会转到 conversation 页的 `mode=voice`

4. `/Users/david/Documents/github/my-doubao2/app/_layout.tsx`
- 当前使用 Drawer 作为根布局

### 语音助手 UI

5. `/Users/david/Documents/github/my-doubao2/src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx`
- 会话页主壳
- 文字模式 / 语音模式的切换与容器逻辑

6. `/Users/david/Documents/github/my-doubao2/src/features/voice-assistant/ui/VoiceAssistantScreen.tsx`
- 语音模式 UI 主文件
- `avatar` / `dialogue` 展示切换
- 四个底部按钮语义
- 当前最值得继续收的视觉文件

7. `/Users/david/Documents/github/my-doubao2/src/features/voice-assistant/ui/VoiceAssistantSessionDrawerContent.tsx`
- 抽屉里的真实会话列表、新建会话、本地过滤

### 会话运行时与状态机

8. `/Users/david/Documents/github/my-doubao2/src/features/voice-assistant/runtime/useTextChat.ts`
- 当前最核心的运行时文件
- 统一维护：
  - 消息流
  - 文字模式
  - 语音模式
  - Android Dialog SDK 事件消费
  - 手动点击打断逻辑
- 后续如果要实现“插话打断”或“会话内静音”，这里是主战场

9. `/Users/david/Documents/github/my-doubao2/src/features/voice-assistant/runtime/providers.ts`
- 平台分发入口
- Android 走 Dialog SDK
- 非 Android 走旧 provider 组合

### Android Dialog SDK 相关

10. `/Users/david/Documents/github/my-doubao2/src/core/providers/dialog-engine/types.ts`
- Dialog engine 的 JS 契约定义

11. `/Users/david/Documents/github/my-doubao2/src/core/providers/dialog-engine/android.ts`
- Android Dialog SDK JS provider

12. `/Users/david/Documents/github/my-doubao2/src/core/providers/dialog-engine/mock.ts`
- 测试 mock

13. `/Users/david/Documents/github/my-doubao2/android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
- 原生 bridge 核心文件
- 包含：
  - prepare/start/stop
  - sendTextQuery
  - 手动点击打断对应的 `interruptCurrentDialog`

14. `/Users/david/Documents/github/my-doubao2/android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEnginePackage.kt`
- 原生模块注册

15. `/Users/david/Documents/github/my-doubao2/android/app/src/main/java/com/anonymous/mydoubao2/MainApplication.kt`
- package 注入点

### 主题与样式

16. `/Users/david/Documents/github/my-doubao2/src/core/theme/mappers.ts`
- 当前页面语义类名映射的核心文件
- 语音页继续精修时必须一起看

17. `/Users/david/Documents/github/my-doubao2/src/core/theme/tokens.ts`
- token 语义源

### 文档

18. `/Users/david/Documents/github/my-doubao2/ARCHITECTURE.md`
- 当前分层与 provider 边界

19. `/Users/david/Documents/github/my-doubao2/docs/PLANS.md`
- 计划总索引

20. `/Users/david/Documents/github/my-doubao2/docs/exec-plans/active/plan-conversation-single-surface.md`
- 当前“单页双模式”这条主线计划

21. `/Users/david/Documents/github/my-doubao2/docs/exec-plans/active/plan-android-dialog-sdk-cutover.md`
- Android Dialog SDK 硬切计划

22. `/Users/david/Documents/github/my-doubao2/docs/product-specs/voice-assistant-s2s-v1.md`
- 产品语义与验收标准

23. `/Users/david/Documents/github/my-doubao2/docs/design-docs/voice-assistant-s2s-v1-design.md`
- Android SDK / 对话设计的技术背景

24. `/Users/david/Documents/github/my-doubao2/docs/design-docs/voice-assistant-ui-parity.md`
- 当前 UI 对齐记录

25. `/Users/david/Documents/github/my-doubao2/docs/commit-history.md`
- 每次提交前必须更新

## 4. 当前工作区状态

截至写本文档时，当前工作区有一轮**尚未提交**的改动，主要围绕：

1. Android 手动点击打断
2. 语音页底部第一按钮在 speaking 态下切换为 interrupt 行为
3. 单页双模式计划与产品规格同步

建议在切到真实目录之前，先决定：

- 是把这轮改动在 `my-doubao2` 提交归档
- 还是直接以此为参考，把真实目录作为新的实现主仓库

## 5. 当前测试情况

最近一次已确认通过：

```bash
pnpm exec tsc --noEmit
pnpm run test --runInBand
```

结果：
- `12 suites / 59 tests` 全绿

另外 Android 这轮中断功能相关的原生编译已经通过：

```bash
cd /Users/david/Documents/github/my-doubao2/android
./gradlew :app:assembleDebug
./gradlew :app:installDebug
```

## 6. 真机调试最小命令集

当前 Android 真机调试最小链路：

```bash
cd /Users/david/Documents/github/my-doubao2
pnpm exec expo start --dev-client --clear --port 8081
adb -s <device-id> reverse tcp:8081 tcp:8081
adb -s <device-id> shell am start -a android.intent.action.VIEW -d 'mydoubao2://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
```

注意：
- 当前 scheme 是 `mydoubao2`
- 不是 `my-doubao2`

## 7. 当前最值得注意的产品/工程事实

1. 现在 Android 默认回复来源仍然是平台自动回复
2. `ReplyProvider` 只是为未来自有 LLM 预留的扩展点
3. 目前“点击打断”已支持；“插话打断”未支持
4. 目前“会话内静音”未支持
5. 语音页当前最需要继续收的是 UI，而不是底层重构

## 8. 建议的迁移策略

如果接下来要切到真实目录继续开发，建议顺序如下：

1. 先把本仓库当前状态作为参考基线
2. 重点迁移：
   - `useTextChat.ts`
   - `VoiceAssistantConversationScreen.tsx`
   - `VoiceAssistantScreen.tsx`
   - `DialogEngineProvider` 相关原生桥接
   - `mappers.ts` / `tokens.ts`
3. 优先保留产品模型：
   - 单页双模式
   - Drawer 会话列表
   - Android Dialog SDK 主链
4. 在新真实目录里优先完成：
   - 语音页视觉收口
   - 插话打断
   - 会话内静音
5. 最后再考虑：
   - 设置页
   - 自有 LLM
   - 音色/模型配置
