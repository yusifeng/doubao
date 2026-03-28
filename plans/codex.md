# 语音/聊天链路稳定性优化方案（基于当前仓库）

本文基于以下文件综合判断：

- `docs/exec-plans/active/plan-voice-chat-flow-stabilization-v2.md`
- `docs/references/dialog-sdk-event-contract.md`
- `docs/design-docs/voice-assistant-s2s-v1-design.md`
- `docs/references/expo-android-debug-runbook.md`
- `src/features/voice-assistant/runtime/useTextChat.ts`
- `src/features/voice-assistant/runtime/providers.ts`
- `src/core/providers/dialog-engine/types.ts`
- `src/core/providers/dialog-engine/android.ts`
- `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
- `src/features/voice-assistant/runtime/__tests__/useTextChat.android.test.tsx`
- `src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`
- `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx`
- `src/features/voice-assistant/ui/__tests__/VoiceAssistantConversationScreen.test.tsx`
- `docs/exec-plans/active/plan-conversation-single-surface.md`

结论先行：当前链路已经具备“能跑、能补丁式修复”的基础，但稳定性风险主要来自三个层面：

1. `useTextChat.ts` 同时承担了会话生命周期、回合生命周期、回复生成、TTS 触发、UI phase 同步。
2. `official_s2s` 与 `custom_llm` 的分叉没有被抽象成显式驱动器，而是散落在同一套 hook 分支里。
3. Android Dialog SDK 的事件语义和指令时机已形成经验性修补，但还没有变成可验证、可维护的认知模型。

目标不应该是继续在现有 hook 上叠补丁，而应该是把“主干流程”抽成单一 orchestrator，把“分叉”收敛为少数显式策略点。

## A. 现状流程图（主干 + 分叉）

### A1. 当前主干共识

当前仓库里其实已经出现了一个隐含主干：

- UI 入口：`src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx`
- Runtime 入口：`src/features/voice-assistant/runtime/useTextChat.ts`
- Native Provider 入口：`src/core/providers/dialog-engine/android.ts`
- Native Bridge 入口：`android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`

但这条主干并没有被显式建模成“Session -> Turn -> Reply -> Draft -> Persist”五段式，而是散在：

- `toggleVoice()` / `sendText()` / `interruptVoiceOutput()` / `toggleVoiceInputMuted()`
- `ensureAndroidDialogConversation()` / `stopAndroidDialogConversation()`
- `handleAndroidDialogEvent()` / `runAndroidReplyFlow()`
- 若干 `Ref`：`androidDialogSessionIdRef`、`androidReplyGenerationRef`、`androidAssistantDraftRef`、`androidDialogClientTtsEnabledRef` 等

因此当前现状更像“一个大 hook + 若干补偿逻辑”，而不是一个稳定的会话编排器。

### A2. `official_s2s + voice`

主路径：

1. `VoiceAssistantConversationScreen(mode='voice')` 进入语音页，副作用触发 `session.toggleVoice()`。
2. `useTextChat.toggleVoice()` 进入 Android Dialog 分支。
3. `ensureAndroidDialogConversation('voice', { forceRestart: true })`
4. `providers.dialogEngine.prepare({ dialogWorkMode: 'default' })`
5. `providers.dialogEngine.startConversation({ inputMode: 'audio' })`
6. Native 事件进入 JS：`engine_start -> session_ready -> asr_start -> asr_partial* -> asr_final -> chat_partial* -> chat_final`
7. `asr_final` 时把用户消息写入 repo；`chat_final` 时把助手消息写入 repo。
8. 语音会话保持打开，状态从 `listening -> thinking -> speaking -> listening` 循环。

关键状态：

- 会话态：`androidDialogModeRef='voice'`、`androidDialogSessionIdRef`、`androidDialogSessionReadyRef`
- 回合态：`liveUserTranscript`、`androidAssistantDraftRef`、`pendingAssistantReply`
- UI 态：`realtimeCallPhase='listening'|'speaking'`、`realtimeListeningState='ready'|'hearing'|'awaiting_reply'`
- 持久化态：repo 中的 `Message(type='audio')`

关键事件：

- `engine_start`：会话启动，锁定当前 session id
- `session_ready`：允许当前会话进入“可稳定处理 turn”的状态
- `asr_start/asr_partial/asr_final`：用户回合输入
- `chat_partial/chat_final`：平台回复输出
- `engine_stop/error`：全局收口

SDK 语义标记：

- `engine_start -> session_ready`：已证据
  证据：`RNDialogEngineModule.kt::onSpeechMessage`、`useTextChat.android.test.tsx:190`
- `MESSAGE_TYPE_DIALOG_ASR_INFO -> asr_start`：已证据（映射），待验证（真实业务语义）
  证据：`RNDialogEngineModule.kt:439-440`；待验证点见 `docs/references/dialog-sdk-event-contract.md`
- `session_ready` 的 id 可能不同于 `engine_start`：已证据
  证据：`useTextChat.ts::handleAndroidDialogEvent(session_ready)`、`useTextChat.customVoiceS2S.test.tsx:480`

### A3. `official_s2s + chat`

主路径：

1. `sendText()` 先把用户文本消息落库。
2. `ensureAndroidDialogConversation('text', { forceRestart: true })`
3. `providers.dialogEngine.prepare({ dialogWorkMode: 'default' })`
4. `providers.dialogEngine.startConversation({ inputMode: 'text' })`
5. `providers.dialogEngine.sendTextQuery(content)`
6. Native 事件：`engine_start -> chat_partial* -> chat_final`
7. `chat_final` 时持久化助手文本；随后 `stopAndroidDialogConversation()`，状态回到 `idle`。

关键状态：

- 会话态：`androidDialogModeRef='text'`
- 回合态：`androidAssistantDraftRef`、`pendingAssistantReply`
- 生命周期控制：`androidRetiredSessionIdsRef` 用于过滤旧 session 的回包

关键事件：

- `sendTextQuery`
- `chat_partial/chat_final`
- `engine_stop`

SDK 语义标记：

- 文本轮当前是“短会话”模型：已证据
  证据：`useTextChat.ts::sendText()`、`useTextChat.android.test.tsx:161`
- 文本轮切换会触发前一语音会话 stop：已证据
  证据：`useTextChat.android.test.tsx:626`

### A4. `custom_llm + voice`

主路径：

1. `toggleVoice()` 仍然走 Android Dialog 会话，但 work mode 改为 `delegate_chat_tts_text`。
2. `engine_start -> session_ready`
3. 每轮 `asr_start` 时后台尝试 `useClientTriggeredTts()` 预热。
4. `asr_final` 后不等待平台 `chat_*`，而是执行 `runAndroidReplyFlow({ mode: 'voice' })`。
5. `providers.reply.generateReplyStream()` 生成 custom LLM 文本。
6. 若 client-triggered TTS 已就绪，则对每个 chunk 调 `streamClientTtsText({ start/content/end })`。
7. 助手文本必须落库；若 S2S 播报失败，只保留文本，不走本地 `audio.speak()`。
8. 若平台 `chat_partial/chat_final` 仍到达，当前实现把它视为泄漏并尝试 `interruptCurrentDialog()`。

关键状态：

- 会话态：`androidDialogWorkMode='delegate_chat_tts_text'`、`androidDialogSessionReadyRef`
- TTS 态：`androidDialogClientTtsEnabledRef`、`androidDialogClientTtsArmingRef`、`androidDialogClientTtsLastAttemptAtRef`
- 回合态：`androidReplyGenerationRef`、`pendingAssistantReply`、`androidObservedPlatformReplyInCustomRef`
- 收口态：`assistantPersisted`、`assistantText`、`canStreamViaClientTts`

关键事件：

- `asr_start`：每轮预热 client-triggered TTS
- `asr_final`：开始 custom LLM 回复生成
- `streamClientTtsText(start/content/end)`：S2S 播报
- `chat_partial/chat_final`：在 custom 模式下默认视为平台泄漏

SDK 语义标记：

- “每轮在 `asr_start` re-arm client-triggered TTS”是当前最稳定经验路径：已证据
  证据：`useTextChat.customVoiceS2S.test.tsx:217,250`
- `400061` 应当视为“已经是 client mode”：已证据
  证据：`useTextChat.ts::ensureAndroidClientTriggeredTts()`、`useTextChat.customVoiceS2S.test.tsx:397`
- `400060` 与 not-ready 的时机性问题：待验证其最小稳定重试窗口
  证据来源：当前代码重试逻辑与文档，不是完整真机时序证明

### A5. `custom_llm + chat`

主路径：

1. `sendText()` 不走 Android Dialog 文本会话。
2. `runTextRound()` 先把用户文本落库。
3. `providers.reply.generateReplyStream()` 直接生成 custom LLM 文本。
4. 助手文本落库，状态从 `thinking -> speaking -> idle`。
5. 不触发语音播报。

关键状态：

- 当前只有 `Conversation.status`、`pendingAssistantReply`
- 不存在 session id、turn id、dialog ready 等 Android 会话状态
- `custom_llm + chat` 与 `custom_llm + voice` 不是同一条主干上的不同驱动，而是两套不同 runtime 路径

关键事件：

- `sendText`
- `providers.reply.generateReplyStream()`
- repo `appendMessage(user)` / `appendMessage(assistant)`

SDK 语义标记：

- 这条路径当前完全绕过 Android Dialog：已证据
  证据：`useTextChat.ts::sendText()` 与 `runTextRound()`

### A6. 现状分叉总结

当前仓库的真实分叉点不是 2 个，而是至少 6 个：

- F1：`replyChainMode = official_s2s | custom_llm`
- F2：`mode = voice | text`
- F3：`Android Dialog runtime | non-Dialog runtime`
- F4：`platform reply | custom reply`
- F5：`session_ready 正常 | session_ready id mismatch | stale/retired session`
- F6：`client-triggered TTS 可用 | 400061 | 400060/not-ready | 失败后仅文本保留`

问题在于：这些分叉并没有被“显式建模”，而是散在 `useTextChat.ts` 的条件分支和若干 ref 中。

## B. 核心问题诊断（按优先级排序）

### P0-1. 模式切换与会话生命周期没有统一的“意图 token”，只能靠 ref 和事后过滤补偿

- 触发条件：
  - chat / voice 快速切换
  - 语音启动未完成时立即退出语音页
  - 语音转文本轮后旧 `engine_stop` / `engine_start` 晚到
  - 切换会话时仍有未完成 assistant draft
- 根因判断：
  - 运行时没有显式的 `sessionEpoch` / `desiredMode` / `activeIntent`。
  - 生命周期逻辑同时存在于 UI 层和 runtime 层：UI 通过 `VoiceAssistantConversationScreen` 的 `useEffect` 自动触发 `session.toggleVoice()`；runtime 再通过 `callLifecycleLockRef`、`androidRetiredSessionIdsRef`、`androidDialogModeRef` 等 ref 补偿。
  - 这意味着“用户意图串行化”和“SDK 事件串行化”不是同一个控制面。
- 影响范围：
  - 会出现模式切换后状态错位
  - 旧 stop/start 影响当前模式
  - draft 落到错误会话或被错误清空
  - 后续维护者很难判断应该在 UI 兜底还是在 runtime 兜底
- 代码定位：
  - `src/features/voice-assistant/runtime/useTextChat.ts::ensureAndroidDialogConversation`
  - `src/features/voice-assistant/runtime/useTextChat.ts::stopAndroidDialogConversation`
  - `src/features/voice-assistant/runtime/useTextChat.ts::handleAndroidDialogEvent`
  - `src/features/voice-assistant/runtime/useTextChat.ts::toggleVoice`
  - `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx::maybeRecoverVoiceAfterStop`
  - `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx::maybeStopAfterInFlight`

### P0-2. `custom_llm` 语音链路的“第二轮能否播报”仍然依赖隐式时序，不是显式 turn contract

- 触发条件：
  - 第一轮能播，第二轮只有文本无播音
  - `session_ready` 晚于 `asr_start`
  - `useClientTriggeredTts()` 返回 `400060` / `400061`
  - `asr_start` 噪声事件或 `asr_final` 抢占上一轮 generation
- 根因判断：
  - 每轮 TTS 触发模式由 `androidDialogSessionReadyRef`、`androidDialogClientTtsEnabledRef`、`androidDialogClientTtsArmingRef` 等多个 ref 共同维护。
  - `asr_start` 的后台预热和 `voice_round` 的前台保证是两个入口，且都直接写同一组 ref。
  - 当前修复已经明显改善了行为，但它还是“经验性的正确”，不是“结构上不可错”。
- 影响范围：
  - 语音体验最容易回归到“第二句不播”
  - 复盘时很难判断到底是 ready 问题、directive 时机问题，还是 generation 抢占问题
  - 任何未来重构都容易把该行为再打坏
- 代码定位：
  - `src/features/voice-assistant/runtime/useTextChat.ts::ensureAndroidClientTriggeredTts`
  - `src/features/voice-assistant/runtime/useTextChat.ts::armAndroidClientTriggeredTtsInBackground`
  - `src/features/voice-assistant/runtime/useTextChat.ts::runAndroidReplyFlow`
  - `src/features/voice-assistant/runtime/useTextChat.ts::handleAndroidDialogEvent(asr_start/asr_final)`
  - `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt::useClientTriggeredTts`
  - `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt::streamClientTtsText`

### P0-3. `custom_llm` 的“平台回复泄漏”是事后拦截，不是 reply ownership 的前置约束

- 触发条件：
  - delegate 模式未成功切到 client-triggered
  - SDK 仍然产生 `chat_partial/chat_final`
  - custom 生成失败或中断后，平台回复晚到
- 根因判断：
  - 当前只是在 `handleAndroidDialogEvent(chat_partial/chat_final)` 内看到事件后再做“泄漏判断 + best-effort interrupt”。
  - 运行时没有显式的 `replyOwner = platform | custom`，也没有“本 turn 是否允许平台 reply”这个统一字段。
  - 因此规则是 reactive guard，而不是 precondition。
- 影响范围：
  - 容易混入官方回复，违反 `custom_llm` 严格模式要求
  - 可能出现双 assistant 回复、双播报来源、文本与播报来源不一致
  - 这类 bug 最伤可维护性，因为它往往只在边缘时序下出现
- 代码定位：
  - `src/features/voice-assistant/runtime/useTextChat.ts::handleAndroidDialogEvent(chat_partial/chat_final)`
  - `src/features/voice-assistant/runtime/useTextChat.ts::runAndroidReplyFlow`
  - `src/features/voice-assistant/runtime/useTextChat.ts::ensureAndroidDialogPrepared`
  - `src/features/voice-assistant/runtime/providers.ts::createVoiceAssistantProviders`

### P1-1. Native 和 JS 同时负责 assistant draft 组装，事件契约不够单一

- 触发条件：
  - `chat_partial` 有时是 delta，有时接近 snapshot
  - `chat_final` 为空，但 partial 已经够用
  - SDK 只给出 `ASR_ENDED`，最终文本来自上一条 partial
- 根因判断：
  - Native 侧 `RNDialogEngineModule.kt` 用 `lastChatPartialText += content` 累计平台回复，同时 JS 侧 `mergeAssistantDraft()` 再做一次合并。
  - Native 侧 `asr_final` 直接使用 `lastAsrPartialText`，不是从 final payload 重建。
  - 这让“到底谁负责归并草稿”变得含糊。
- 影响范围：
  - 维护者需要同时理解 Native 和 JS 的两层归并逻辑
  - 未来若 SDK 事件文本语义变化，容易出现重复拼接或丢字
  - 测试虽然覆盖了部分场景，但契约本身仍不清晰
- 代码定位：
  - `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt::onSpeechMessage`
  - `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt::parseAsrText`
  - `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt::parseChatContent`
  - `src/features/voice-assistant/runtime/useTextChat.ts::mergeAssistantDraft`
  - `src/features/voice-assistant/runtime/useTextChat.ts::handleAndroidDialogEvent(chat_partial/chat_final)`

### P1-2. UI 层承担了进入/退出语音模式的编排责任，造成第二套状态机

- 触发条件：
  - 进入 voice 页面自动开始通话
  - 离开 voice 页面自动 stop
  - 启动/停止 promise 延迟解决
  - `activeConversationId` 迟到后再补启动
- 根因判断：
  - `VoiceAssistantConversationScreen.tsx` 用多个 ref 和 `useEffect` 管理 `toggleVoice()` 的补偿逻辑。
  - 这实际上把“页面模式”和“底层会话模式”都放进了 UI 层。
  - UI 测试里已经出现大量针对 lifecycle race 的断言，说明这块复杂度并不只是展示逻辑。
- 影响范围：
  - 增加一个新的 race 面
  - UI 变动时容易误伤通话编排
  - 很难把语音模式生命周期定义为单一事实来源
- 代码定位：
  - `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx::maybeRecoverVoiceAfterStop`
  - `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx::maybeStopAfterInFlight`
  - `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx` 三个 mode 相关 `useEffect`
  - `src/features/voice-assistant/ui/__tests__/VoiceAssistantConversationScreen.test.tsx:252,322,392`

### P1-3. 状态域过于扁平，缺少统一的 `session / turn / generation / draft` 模型

- 触发条件：
  - 任何需要理解回合状态的改动
  - 任何需要增加日志字段或写新测试的改动
- 根因判断：
  - 当前公开状态只有 `Conversation.status` 和若干 UI state。
  - 真正关键的运行时状态都藏在 ref 里，且命名上混杂了“会话”、“回复 generation”、“草稿”、“UI phase”。
  - `useSessionMachine()` 只有 `idle/listening/thinking/speaking/error`，不足以表达真实会话生命周期。
- 影响范围：
  - 改动成本高
  - 无法声明并验证 invariants
  - 很难把 `official_s2s` 与 `custom_llm` 放到同一主干上讨论
- 代码定位：
  - `src/features/voice-assistant/types/model.ts`
  - `src/features/voice-assistant/runtime/sessionMachine.ts`
  - `src/features/voice-assistant/runtime/useTextChat.ts` 顶部 refs 区域

### P1-4. SDK 语义已部分固化，但“已证据 / 待验证”边界还没有进入代码结构

- 触发条件：
  - 依赖 `asr_start` 作为每轮 re-arm 时机
  - `session_ready` 与 `engine_start` id 不同
  - 需要解释为什么不在 session startup 时切 TTS 模式，而在 turn-level 切
- 根因判断：
  - 文档中已经承认 `ASR_INFO` 存在语义冲突，但运行时代码还是直接把它当成“turn start”。
  - 这在现阶段是合理经验判断，但还没有被抽象为“证据等级 + 验证脚本 + 日志标准”。
- 影响范围：
  - 新同学很难知道哪些是源码确定项，哪些是实验确定项
  - 运行时重构时容易误把“待验证假设”当成稳定 API
- 代码定位：
  - `docs/references/dialog-sdk-event-contract.md`
  - `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt::onSpeechMessage`
  - `src/features/voice-assistant/runtime/useTextChat.ts::handleAndroidDialogEvent(session_ready/asr_start)`

### P2-1. Provider 能力矩阵是隐式布尔组合，后续扩展很容易继续分叉失控

- 触发条件：
  - 想新增一个 reply source 或 voice mode
  - 想把 custom_llm + chat 接回同一 Android Dialog 主干
- 根因判断：
  - `useAndroidDialogRuntime`、`useAndroidDialogTextRuntime`、`useCustomVoiceS2STts`、`effectiveVoicePipelineMode` 都是即时布尔推导。
  - `providers.ts` 和 `useTextChat.ts` 都在做能力判断。
- 影响范围：
  - 新分叉很难收敛
  - 容易出现 provider 选择和 runtime 分支不一致
- 代码定位：
  - `src/features/voice-assistant/runtime/providers.ts::createVoiceAssistantProviders`
  - `src/features/voice-assistant/runtime/useTextChat.ts` 初始化区域

### P2-2. 测试已经覆盖很多 patch，但测试分层还没把“原生契约”和“orchestrator 契约”拆开

- 触发条件：
  - Native 事件语义调整
  - Hook 拆分后测试需要迁移
- 根因判断：
  - 当前测试大量集中在 `useTextChat` hook 级别。
  - UI 层也承担了不少 race 测试。
  - 但 `android.ts` / `RNDialogEngineModule.kt` 的事件归一化还没有独立 contract test。
- 影响范围：
  - 测试很多，但不够分层
  - 未来拆分 orchestrator 后，现有测试会跟着大面积改动
- 代码定位：
  - `src/features/voice-assistant/runtime/__tests__/useTextChat.android.test.tsx`
  - `src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`
  - `src/features/voice-assistant/ui/__tests__/VoiceAssistantConversationScreen.test.tsx`

## C. 优化方案（必须可实施）

### C1. 目标架构

#### 1. 主干流程收敛为单一 orchestrator

建议把 Android 语音/聊天主链统一收敛成：

`Intent -> SessionController -> TurnReducer -> ReplyDriver -> DraftStore -> Repo Commit`

具体解释：

- `Intent`：来自 UI 的用户意图，只表达“我要进入 voice / text”“我要发文本”“我要中断播报”“我要静音输入”。
- `SessionController`：唯一负责 `prepare/start/stop/pause/resume/interrupt` 的控制器，串行化所有命令。
- `TurnReducer`：把 `engine_start/session_ready/asr_*/chat_*` 转成显式 turn state。
- `ReplyDriver`：只有两个实现：`OfficialS2SReplyDriver`、`CustomLlmReplyDriver`。
- `DraftStore`：唯一负责 `liveTranscript`、`assistantDraft`、`persisted`、`draftSource`。
- `Repo Commit`：统一在 turn finalize 时写入 repo，不再在多个分支重复写入。

这意味着 `useTextChat.ts` 应该从“全量 orchestrator”缩回“UI facade + repo state adapter”。

#### 2. 分叉显式化

建议把所有分叉收敛成两层：

- 第一层：`interactionMode = voice | text`
  - 控制 `inputMode`、是否持续保持 session、结束回复后是否回到 listening
- 第二层：`replyChain = official_s2s | custom_llm`
  - 控制回复来源、是否允许平台 reply、是否需要 client-triggered TTS

除此之外，其余都不应再是业务分叉，而应是异常分支：

- stale / retired session
- session_ready mismatch
- `400060` / `400061`
- platform reply leak
- cold start not ready

#### 3. 统一状态域

| 状态域 | 当前分散实现 | 目标状态 |
| --- | --- | --- |
| `session` | `androidDialogPreparedRef`、`androidDialogModeRef`、`androidDialogSessionIdRef`、`androidDialogSessionReadyRef`、`androidRetiredSessionIdsRef` | `SessionState { sessionEpoch, sdkSessionId, conversationId, interactionMode, replyChain, workMode, phase }` |
| `turn` | `liveUserTranscript`、`realtimeListeningState`、`androidDialogInterruptedRef` | `TurnState { turnId, phase, userText, assistantMessageType, replyOwner, interrupted }` |
| `generation` | `androidReplyGenerationRef`、`realtimeCallGenerationRef`、`callLifecycleLockRef` | `GenerationState { commandEpoch, replyGeneration }` |
| `draft` | `pendingAssistantReply`、`androidAssistantDraftRef`、Native `lastChatPartialText` | `DraftState { liveTranscript, assistantDraft, source, persisted }` |

建议：第一阶段这些状态只存在于 runtime 内存中，不动 repo schema；先稳定编排，再决定是否把 turn metadata 落库。

#### 4. 两条回复驱动器的责任边界

`OfficialS2SReplyDriver`：

- 输入：SDK `chat_partial/chat_final`
- 输出：统一的 `reply_delta/reply_final`
- 允许平台 reply
- 不负责 client-triggered TTS

`CustomLlmReplyDriver`：

- 输入：`ReplyProvider.generateReplyStream()`
- 输出：统一的 `reply_delta/reply_final`
- 不允许平台 reply 进入当前 turn
- voice 模式下负责 client-triggered TTS 的 arming / streaming / failure policy
- 保证“文本必须可落库；失败时不回退本地 TTS”

### C2. Phase 0：先把 SDK 契约和日志固定住

#### Step 0.1：补齐 Native -> JS 契约元信息

涉及文件：

- `src/core/providers/dialog-engine/types.ts`
- `src/core/providers/dialog-engine/android.ts`
- `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`

改造意图：

- 在不改变现有功能的前提下，把当前 runtime 依赖的隐含信息显式暴露出来。
- 建议给事件增加可选 meta 字段：
  - `nativeMessageType`
  - `dialogWorkMode`
  - `inputMode`
  - `textMode`（`aggregate | delta | final_from_last_partial`）
  - `directiveName`
  - `directiveRet`
- `RNDialogEngineModule.kt` 保留当前 `text` 字段兼容行为，但同时把“当前 text 是累计值还是 delta”说清楚。

验收：

- logcat 能看到每个关键事件来自哪个 Native message type。
- 能从日志判断 `chat_partial` 当前是累计值还是 delta 值。
- 能从日志区分 `400060`、`400061`、`Directive unsupported`。

#### Step 0.2：把“已证据 / 待验证”写成可执行 runbook

涉及文件：

- `docs/references/dialog-sdk-event-contract.md`
- `docs/references/expo-android-debug-runbook.md`

改造意图：

- 不是继续写原则，而是把关键时序写成真机操作步骤。
- 每个结论都标注：
  - `已证据（源码）`
  - `已证据（现有测试）`
  - `待验证（真机时序）`
- 明确 `ASR_INFO`、`session_ready`、`client-triggered TTS` 切换时机的观测方法。

验收：

- 新同学按手册能跑出 3 个最关键序列：
  - `official_s2s + voice`
  - `custom_llm + voice 两轮`
  - `voice -> chat 快切`

#### Step 0.3：先加 contract tests，再拆 hook

涉及文件：

- 新增 `src/core/providers/dialog-engine/__tests__/android.nativeEventContract.test.ts`
- 更新 `src/features/voice-assistant/runtime/__tests__/useTextChat.android.test.tsx`
- 更新 `src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`

改造意图：

- 在真正重构前，先把当前被依赖的契约冻结住。
- 重点冻结：
  - `session_ready id != engine_start id` 仍应 accepted
  - `chat_final` 为空时仍能从 draft finalize
  - `400061` 视为 already enabled
  - stale / retired session 的 drop 规则

验收：

- contract tests 先变绿，后续重构只允许修改 orchestrator，不允许偷偷改掉契约。

### C3. Phase 1：抽出 Android Dialog Orchestrator，收敛生命周期

#### Step 1.1：新建 runtime 状态模型与 reducer

涉及文件：

- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/types.ts`
- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/state.ts`
- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/reducer.ts`
- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/invariants.ts`

改造意图：

- 把现在分散在 ref 里的状态统一成一个运行时状态对象。
- reducer 只关心“状态如何从事件和命令演进”，不直接访问 provider 和 repo。
- 在 `invariants.ts` 里声明最关键约束：
  - 同一时刻只有一个 active session
  - 同一 turn 只能有一个 reply owner
  - `custom_llm + voice` 下 assistant 文本必须最终可落库
  - stale event 不得改变当前 session/turn

验收：

- 能用纯单测验证 `engine_start -> session_ready -> asr_final -> chat_final` 的状态演进。
- 能用纯单测验证 stale event 不改变当前状态。

#### Step 1.2：新建 `SessionController`，让命令走单一串行面

涉及文件：

- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/sessionController.ts`
- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/commandQueue.ts`
- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/draftStore.ts`
- 修改 `src/features/voice-assistant/runtime/useTextChat.ts`

改造意图：

- 所有 `prepare/start/stop/sendTextQuery/pause/resume/interrupt/useClientTriggeredTts/streamClientTtsText` 都通过 controller 串行发出。
- `callLifecycleLockRef` 升级成显式 command queue，不再由 UI 和 hook 各自持有一半逻辑。
- `useTextChat.ts` 只做：
  - 把 UI 意图转成 controller command
  - 订阅 orchestrator state
  - 同步 repo/messages 到 UI

验收：

- `toggleVoice()`、`sendText()`、`interruptVoiceOutput()`、`toggleVoiceInputMuted()` 都不再直接修改低层 ref。
- 旧的 `androidDialog*Ref` 数量显著下降。

#### Step 1.3：统一 session 级 stale 过滤规则

涉及文件：

- `src/features/voice-assistant/runtime/dialog-orchestrator/reducer.ts`
- `src/features/voice-assistant/runtime/dialog-orchestrator/sessionController.ts`
- `src/features/voice-assistant/runtime/useTextChat.ts`

改造意图：

- 用 `sessionEpoch + sdkSessionId` 双键过滤 stale。
- `session_ready id mismatch` 只在 reducer 中做一次 accepted/drop 判断。
- `retired session` 列表变成 reducer 的 session history，而不是 hook 外部 ref。

验收：

- `voice -> chat` 快切时，旧 session 的 `engine_stop/chat_final` 不会改变当前文本轮。
- 会话切换时 draft 仍能归属原 conversation。

### C4. Phase 2：把 `official_s2s` / `custom_llm` 分叉抽成 reply drivers

#### Step 2.1：抽 `OfficialS2SReplyDriver`

涉及文件：

- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/officialS2SReplyDriver.ts`
- 修改 `src/features/voice-assistant/runtime/useTextChat.ts`
- 修改 `src/core/providers/dialog-engine/types.ts`

改造意图：

- 把平台 `chat_partial/chat_final` 的处理从 `handleAndroidDialogEvent()` 中拆出来。
- 官方链只做三件事：
  - 接收平台 reply
  - 维护 assistant draft
  - 在 `reply_final` 时统一提交 repo

验收：

- `official_s2s + voice` 和 `official_s2s + chat` 使用同一套 draft/persist/finalize 逻辑。
- `chat_final` 为空时依然能正确 finalize。

#### Step 2.2：抽 `CustomLlmReplyDriver`

涉及文件：

- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/customLlmReplyDriver.ts`
- 新增 `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/ttsArmingPolicy.ts`
- 修改 `src/features/voice-assistant/runtime/useTextChat.ts`
- 修改 `src/features/voice-assistant/runtime/providers.ts`

改造意图：

- 把 custom 语音链的特殊规则都收口到一个 driver：
  - `asr_start` 是否预热 client-triggered TTS
  - `400060/400061` 如何解释
  - `custom_llm` 文本如何流式写 draft
  - S2S 播报失败时只保留文本，不回退本地 TTS
  - 平台 reply 泄漏如何阻断
- `useTextChat.ts` 不再直接知道 custom 的 TTS 细节。

验收：

- “第一句能播，第二句不播”有单测和真机脚本双验证。
- custom 失败时：文本仍落库；本地 `audio.speak()` 不被调用；平台回复不会入库。

#### Step 2.3：把“reply ownership”做成显式字段

涉及文件：

- `src/features/voice-assistant/runtime/dialog-orchestrator/types.ts`
- `src/features/voice-assistant/runtime/dialog-orchestrator/reducer.ts`
- `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/*.ts`

改造意图：

- 每个 turn 显式持有：
  - `replyOwner = platform | custom`
  - `platformReplyAllowed = true | false`
- 一旦 turn 被 `CustomLlmReplyDriver` 接管，平台 `chat_*` 只能作为 leak 事件记录，不得进入当前 draft。

验收：

- `custom_llm` 场景下，任何平台 `chat_partial/chat_final` 都只会产生 leak log，不会写 repo、不改变 `pendingAssistantReply`。

### C5. Phase 3：收口 UI 生命周期与最终契约

#### Step 3.1：把“进入/退出语音模式”的责任下沉到 runtime API

涉及文件：

- 修改 `src/features/voice-assistant/runtime/useTextChat.ts`
- 修改 `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx`
- 修改 `src/features/voice-assistant/ui/__tests__/VoiceAssistantConversationScreen.test.tsx`

改造意图：

- UI 层不再直接通过多个 `useEffect` 编排 `toggleVoice()` 的启动/停止竞态。
- 推荐暴露更明确的 intent API，例如：
  - `enterVoiceMode()`
  - `exitVoiceMode()`
  - 或 `setConversationMode('voice' | 'text')`
- `VoiceAssistantConversationScreen` 只负责发 intent，不再维护 `voiceToggleInFlightRef`、`pendingStopAfterInFlightRef` 等运行时补偿 ref。

验收：

- UI 测试回到“展示 + intent 分发”层。
- 语音启动/停止 race 改由 orchestrator 测试负责。

#### Step 3.2：清理 Native / JS 双重 draft 组装

涉及文件：

- `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
- `src/core/providers/dialog-engine/android.ts`
- `src/features/voice-assistant/runtime/dialog-orchestrator/draftStore.ts`
- 更新对应 contract tests

改造意图：

- 当 Phase 0 的 contract 和日志都稳定后，选定唯一的 draft 组装位置。
- 推荐最终方案：Native 只做 lossless normalization，JS 的 draftStore 负责唯一归并。
- 这样后续所有文本归并、去重、finalize 都只在一处维护。

验收：

- `chat_partial` 的处理逻辑只保留一层。
- 现有 snapshot/delta 兼容测试全部保留通过。

#### Step 3.3：同步文档与运行手册

涉及文件：

- `docs/references/dialog-sdk-event-contract.md`
- `docs/references/expo-android-debug-runbook.md`
- `docs/exec-plans/active/plan-voice-chat-flow-stabilization-v2.md`
- `docs/exec-plans/active/plan-conversation-single-surface.md`

改造意图：

- 把新的 state model、reply driver、日志字段、验证脚本写回 docs，确保仓库文档继续是唯一事实来源。

验收：

- 新同学只读 docs 就能解释 4 条主流程、5 类异常分支、3 个关键真机脚本。

## D. 测试与验证方案

### D1. 测试矩阵

| 场景 | 当前覆盖 | 建议动作 | 验收标准 |
| --- | --- | --- | --- |
| `official_s2s + voice` 主流程 | 已有：`useTextChat.android.test.tsx:190,587` | 保留 hook 级 happy path；新增 orchestrator reducer test | 用户消息与助手消息都正确落库，回复后回到 `listening` |
| `official_s2s + chat` 主流程 | 已有：`useTextChat.android.test.tsx:161` | 增加“文本短会话启动/收口” controller test | `chat_final` 后 stop，状态回到 `idle` |
| `custom_llm + voice` 主流程 | 已有：`useTextChat.customVoiceS2S.test.tsx:177` | 保留并迁移为 driver 集成测试 | custom 文本落库，S2S voice 播报优先，本地 TTS 不调用 |
| `custom_llm + voice` 第二轮播报 | 已有：`useTextChat.customVoiceS2S.test.tsx:250` | 增加“第二轮前一轮刚结束”和“第二轮插话后”两种场景 | 第二轮仍能播报，且 turn id 正确递增 |
| `custom_llm + chat` 主流程 | 缺少专门测试 | 新增 `useTextChat.customText.test.tsx` | 不启动 Android Dialog 会话；文本正确落库 |
| stale session / retired session | 已有：`useTextChat.android.test.tsx:871,965,1011` | 迁移为 reducer/controller test，hook 层保留 1 个回归用例 | 旧 session 事件不会改写当前 turn |
| `400061` | 已有：`useTextChat.customVoiceS2S.test.tsx:397` | 保留并迁移到 `ttsArmingPolicy` test | 视为 already enabled，继续播报 |
| `400060` / not-ready | 只有逻辑，没有明确单测 | 新增重试成功、重试失败两组测试 | 成功时正常播报；失败时文本仍落库、无本地 TTS |
| 平台回复泄漏 | 已有部分：`useTextChat.customVoiceS2S.test.tsx:348,428` | 新增严格 turn ownership test | 平台 `chat_*` 只记录 leak log，不写 repo |
| 模式快切 | UI 已有：`VoiceAssistantConversationScreen.test.tsx:252,322,392` | 把 race 主体验证迁到 orchestrator，UI 只留 smoke test | 快切后状态只服从最后一次 intent |
| 冷启动 session 未就绪 | 已有部分：`useTextChat.customVoiceS2S.test.tsx:480` | 新增 `engine_start 已到 / session_ready 未到 / asr_final 先到` 场景 | 未 ready 时不误播；ready 后 turn 恢复正常 |
| 空 `chat_final` / 空 `asr_final` | 已有：`useTextChat.android.test.tsx:1080,1106` | 保留 | 空 final 不生成脏消息，不破坏状态 |
| conversation 切换时 draft 归属 | 已有：`useTextChat.android.test.tsx:894` | 保留并迁移到 orchestrator 集成测试 | draft 始终落回原 conversation |

### D2. 建议新增的测试文件切分

- `src/core/providers/dialog-engine/__tests__/android.nativeEventContract.test.ts`
  - 测 `engine_start/session_ready` id 兼容
  - 测 `chat_partial` 文本语义
  - 测 `asr_final` 的 final 来源
- `src/features/voice-assistant/runtime/dialog-orchestrator/__tests__/reducer.test.ts`
  - 测 session/turn 状态演进与 stale drop
- `src/features/voice-assistant/runtime/dialog-orchestrator/__tests__/officialS2SReplyDriver.test.ts`
  - 测平台 reply draft/finalize
- `src/features/voice-assistant/runtime/dialog-orchestrator/__tests__/customLlmReplyDriver.test.ts`
  - 测 client-triggered TTS、`400060/400061`、平台 reply leak、partial persist
- `src/features/voice-assistant/runtime/__tests__/useTextChat.android.test.tsx`
  - 缩成 facade 集成测试
- `src/features/voice-assistant/ui/__tests__/VoiceAssistantConversationScreen.test.tsx`
  - 缩成展示与 intent 分发测试

### D3. 日志观测字段建议

最少要统一以下字段：

- `sessionEpoch`：runtime 自己生成的会话代号，用来区分“用户当前意图下的会话”
- `sessionId`：SDK session id
- `dialogId`：若 `session_ready` 给出不同 dialog id，单独记录
- `conversationId`
- `turnId`
- `mode`：`voice | text`
- `replyChain`：`official_s2s | custom_llm`
- `workMode`：`default | delegate_chat_tts_text`
- `phase`：`starting | ready | listening | awaiting_reply | replying | speaking | interrupted | stopping | idle | error`
- `replyOwner`：`platform | custom`
- `draftSource`：`platform | custom`
- `generation`
- `directive`
- `directiveRet`
- `eventType`
- `staleReason`
- `errorCode`
- `errorMessage`

建议统一日志 key 前缀：

- `dialog.intent`
- `dialog.session`
- `dialog.turn`
- `dialog.reply`
- `dialog.directive`
- `dialog.stale_drop`
- `dialog.leak_guard`

这样一次 logcat 就可以把一次 turn 串起来，而不是只看到零散的 `event type + textLength`。

### D4. 最小真机验证脚本（操作步骤 + 预期日志关键字）

#### 脚本 1：`custom_llm + voice` 双轮播报回归

操作步骤：

1. 真机启动应用，配置 `replyChainMode=custom_llm`。
2. 清空日志：`adb logcat -c`
3. 开始观察日志：`adb logcat | rg "RNDialogEngine|dialog\\.|voice-assistant"`
4. 进入同一 conversation 的语音模式。
5. 说第一句，等助手播报完成。
6. 立即说第二句。

预期日志关键字：

- `dialog.session phase=ready replyChain=custom_llm`
- `dialog.turn phase=user_committed turnId=t1`
- `dialog.directive name=useClientTriggeredTts result=ok` 或 `result=already_enabled`
- `dialog.reply owner=custom phase=streaming turnId=t1`
- `dialog.turn phase=user_committed turnId=t2`
- 第二轮再次出现 `useClientTriggeredTts`
- 不出现 `dialog.leak_guard platform_reply_accepted=true`

验收：

- 第二轮有实际播报
- 第二轮 assistant 文本也落库
- 日志里 turnId 是两轮递增，不是复用旧 turn

#### 脚本 2：`official_s2s` 下 voice -> chat 快切

操作步骤：

1. 配置 `replyChainMode=official_s2s`。
2. 进入语音模式，等待接通。
3. 立刻切回文字模式并发送一条文本。
4. 观察旧 voice session 的 stop/start 事件是否晚到。

预期日志关键字：

- `dialog.intent desiredMode=text`
- 旧 session 的 `engine_stop` 被记录为 `dialog.stale_drop` 或 `retired_session`
- 新文本轮出现 `dialog.reply owner=platform phase=finalized`

验收：

- UI 留在文字模式
- 不会被旧 `engine_stop` 拉回 idle/voice 错位状态
- 文本轮回复正常入库一次

#### 脚本 3：冷启动 `session_ready` mismatch

操作步骤：

1. 真机冷启动应用。
2. 配置 `replyChainMode=custom_llm`。
3. 进入语音模式，观察 `engine_start` 和 `session_ready`。
4. 在 ready 后说一句话。

预期日志关键字：

- `dialog.session phase=starting`
- `event=engine_start sessionId=...`
- `event=session_ready dialogId=... accepted=true`
- `dialog.directive name=useClientTriggeredTts result=ok|already_enabled`
- `dialog.reply owner=custom phase=finalized`

验收：

- 即使 `session_ready` id 与 `engine_start` 不同，也不影响第一轮播报
- 不出现 `session not ready` 的错误收口

## E. 风险与回滚

| 风险 | 说明 | 回滚策略（文件级） |
| --- | --- | --- |
| 1. Native 事件契约调整后，当前文本归并行为变化 | 一旦把 `chat_partial`/`asr_final` 语义写得更明确，现有 hook 可能先不兼容 | 回滚 `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`、`src/core/providers/dialog-engine/android.ts`、`src/core/providers/dialog-engine/types.ts` |
| 2. Orchestrator 抽取时漏掉现有 patch 边界 | stale session、draft owner、interrupt after speak 这些行为今天都靠 hook 内补丁维持 | 保留旧 `useTextChat.ts` 分支直到新 orchestrator 测试全部通过；必要时回滚新增 `src/features/voice-assistant/runtime/dialog-orchestrator/*` 并恢复 `useTextChat.ts` |
| 3. `custom_llm` 严格泄漏拦截过猛，误杀合法回复 | 如果 reply ownership 建模不准，可能把官方链路或合法事件也拦掉 | 回滚 `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/customLlmReplyDriver.ts` 和相关路由变更，临时恢复到当前 `handleAndroidDialogEvent(chat_*)` 防线 |
| 4. UI 生命周期 API 迁移后，语音页自动接通行为回归 | 目前 UI 层有较多补偿逻辑；下沉到 runtime 后若 intent 定义不完整，可能导致 auto-start 丢失 | 回滚 `src/features/voice-assistant/ui/VoiceAssistantConversationScreen.tsx` 与其测试，恢复现有 `toggleVoice()` 自动补偿逻辑 |
| 5. 日志字段扩充导致噪声过大、排查成本反而上升 | 如果没有统一 key 和 phase，日志只会更多不会更清晰 | 回滚新增结构化字段，只保留 `dialog.intent/session/turn/reply/stale_drop` 五类日志；对应调整 `RNDialogEngineModule.kt`、`useTextChat.ts`、`docs/references/expo-android-debug-runbook.md` |

补充判断：

- 这轮改造不建议先动 repo schema；优先做 runtime 内存态重构，因此回滚成本主要在 runtime / native bridge / tests 三层，风险可控。

## F. 最终推荐

1. 先在 `src/core/providers/dialog-engine/` 和 `RNDialogEngineModule.kt` 补齐事件契约元信息与结构化日志，不先改业务逻辑。
2. 新建 `src/features/voice-assistant/runtime/dialog-orchestrator/`，把 `ensureAndroidDialogConversation`、`stopAndroidDialogConversation`、`handleAndroidDialogEvent`、`runAndroidReplyFlow` 从 `useTextChat.ts` 拆出去。
3. 在 orchestrator 里显式定义 `SessionState / TurnState / GenerationState / DraftState`，并生成 `sessionEpoch` 与 `turnId`。
4. 把 `official_s2s` 和 `custom_llm` 抽成两个 reply driver，主干只保留一套 turn finalize / draft persist / stale drop 逻辑。
5. 把 `custom_llm` 的 client-triggered TTS 预热、`400060/400061` 解释、平台 reply 泄漏拦截收口到 `CustomLlmReplyDriver`，不再散落在 hook 分支里。
6. 把 `VoiceAssistantConversationScreen.tsx` 的语音模式自动启动/停止编排下沉到 runtime intent API，UI 只保留展示和分发 intent。
7. 为 `custom_llm + chat` 新增独立测试，确认它在文本模式下不误走 Android Dialog，会话状态也能和 voice 主干对齐。
8. 为 `400060`、冷启动 not-ready、platform leak after custom failure、`late engine_stop after mode switch` 补专门单测，不只依赖 hook 集成测试。
9. 在 `docs/references/dialog-sdk-event-contract.md` 和 `docs/references/expo-android-debug-runbook.md` 中写入“已证据 / 待验证”与最小真机脚本，作为后续重构的准入门槛。
