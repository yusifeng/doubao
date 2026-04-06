# Plan: Voice/Chat 流程稳态优化（SDK First）

## 背景

过去多轮修复后，`official_s2s` 与 `custom_llm` 在语音/聊天切换路径上已可用，但仍存在“复杂分叉过多、事件语义不透明、回归风险高”的工程性问题。

本计划目标不是再叠加功能，而是：

- 先固化 SDK 语义与主流程；
- 再把现有实现收敛为“主干稳定、分叉受控”的结构；
- 最后用测试和日志把稳定性门槛抬高。

## 本轮实施口径（去数字依赖，决策完成版）

- 业务层（`runtime/ui/orchestrator`）只消费语义事件，不再以 `3018/3011/359...` 等 `nativeMessageType` 做状态分支。
- Android native 适配层是唯一允许处理 SDK 数字事件码的位置；上层仅接收语义结果：
  - `assistant_playback_started`
  - `assistant_playback_finished`
  - `assistant_playback_interrupted`
  - `user_speech_started`
  - `user_speech_finalized`
- `speaking -> listening` 唯一收口入口保持为 `player_finish`（语义等价于 `assistant_playback_finished`）。
- 验收口径改为“语义时间线是否收口稳定”，数字事件仅作为附录级调试信息，不作为业务验收条件。

## 范围

### In Scope

- `src/features/voice-assistant/runtime/useTextChat.ts`
- `src/features/voice-assistant/runtime/providers.ts`
- `src/core/providers/dialog-engine/*`
- `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
- 对应 runtime/UI 测试与运行手册文档

### Out of Scope

- 新增业务功能（新模式/新页面/新能力）
- iOS/Web 主链重构
- 角色人设与提示词产品策略变更

## 主流程定义（先稳主干）

### 主流程 A：`official_s2s` + 语音

1. `toggleVoice(start)` -> `startConversation(input=audio)`
2. SDK 事件：`engine_start -> session_ready`
3. 回合：`asr_start -> asr_partial* -> asr_final`
4. 平台回复：`chat_partial* -> chat_final`
5. runtime：消息落库、状态切回 listening

### 主流程 B：`official_s2s` + 聊天

1. `sendText` -> `startConversation(input=text)` + `sendTextQuery`
2. 平台 `chat_partial/chat_final`
3. 消息落库并收口会话

### 主流程 C：`custom_llm` + 语音（S2S 播报优先）

1. `asr_start` 触发每轮 trigger re-arm
2. `asr_final` 后进入 `runAndroidReplyFlow`
3. 文本生成：`ReplyProvider(OpenAI-compatible)`
4. 播报：`useClientTriggeredTts + streamClientTtsText`
5. 失败策略：保留文本落库，不走本地 TTS

### 主流程 D：`custom_llm` + 聊天

1. `sendText` -> `ReplyProvider`
2. 文本落库
3. 不触发语音播报

## 分叉管理（只允许显式分叉）

- F1：会话生命周期异常（stale session / retired session / session id mismatch）
- F2：delegate 触发失败（`400060`、`400061`、not ready）
- F3：平台回复泄漏（`custom_llm` 下收到 `chat_partial/chat_final`）
- F4：模式切换竞态（voice<->text 快速切换、start/stop in-flight）
- F5：冷启动会话未就绪（`activeConversationId` 尚未生成）

每个分叉必须满足：

- 有明确入口条件；
- 有唯一收敛路径；
- 有单测覆盖。

## 执行阶段

## Phase 0：SDK 语义固化（先认知后重构）

- [x] 建立“事件/指令真值表”并标注证据级别（L1/L2/L3）
- [x] 对 `ASR_INFO` 语义冲突做真机时序采样并结论化（当前开发环境无可连接真机，已固化阻塞结论与临时决策）
- [x] 形成 `Turn Contract`：一轮的开始、中断、完成、失败收敛规则
- [x] 更新调试手册：把关键日志关键词与判据标准化

交付物：

- `docs/references/dialog-sdk-event-contract.md`（持续更新）
- `docs/references/expo-android-debug-runbook.md` 补充“事件时序判据”

## Phase 1：runtime 结构收敛（主干/分叉解耦）

- [x] 将 `useTextChat` 中 Android Dialog 主链抽出为独立 orchestrator（保持 API 不变）
- [x] 统一 turn 级状态容器（session/turn/generation/draft）
- [x] 把 `official_s2s` 与 `custom_llm` 的共同骨架抽象为同一回合管线
- [x] 仅保留显式分叉点（F1~F5），移除隐式 if-else 交叉
- [x] 明确 `prepare/start/stop` 的幂等与串行约束

## Phase 2：测试矩阵升级（以回归防线为目标）

- [x] 补齐“主流程 A/B/C/D”端到端级 hook 测试场景
- [x] 分叉 F1~F5 各自至少 1 个稳定回归用例
- [x] 增加“长回合 + 快切 + 中断”组合场景测试
- [x] 补“事件乱序/延迟到达”测试（含 stale 过滤）

## Phase 3：可观测与运维化

- [x] 增加统一结构化字段：`sessionId/turnId/mode/replyChain/phase`
- [x] 限制噪声日志，保留可用于 1 次 logcat 复盘的关键链路
- [x] 输出“故障签名 -> 定位步骤 -> 修复建议”对照表

## 验收标准

- 主流程 A/B/C/D 各自稳定通过并可重复复现；
- 任一分叉 F1~F5 都能回到可预期收敛状态（不静默、不丢消息、不悬挂）；
- 语音/聊天切换不存在已知竞态导致的“UI 与 runtime 状态错位”；
- `custom_llm` 语音链在 S2S 不可播时仅降级为“文本可用”，不回退官方内容脑路；
- 调试手册可被新同学按步骤复现并定位问题。

## 决策记录

- 2026-03-29：确定采用“SDK 语义先行 + 主流程优先 + 分叉显式化”的优化策略。
- 2026-03-29：将 `custom_llm` 视为 `official_s2s` 主干上的“内容来源分叉”，而非独立系统。

## 进度记录

- 2026-04-06（long-file optimization / P0+P1）：
  - 完成 `useTextChat` 顶层共享块拆分：新增 `src/features/voice-assistant/runtime/useTextChat.shared.ts`，迁出运行时常量、语义事件映射、trace id 生成与 system prompt 解析，`useTextChat.ts` 从 `3504` 行降至 `3401` 行。
  - 完成 provider 边界拆分：
    - `src/core/providers/audio/expoRealtime.constants.ts` + `src/core/providers/audio/expoRealtime.pcm.ts`（常量/PCM 工具外置），`expoRealtime.ts` 从 `1134` 行降至 `1034` 行。
    - `src/core/providers/s2s/websocket.constants.ts`（协议常量外置）。
    - `src/core/providers/dialog-engine/android.eventNormalizer.ts`（native 事件归一化外置），`android.ts` 从 `292` 行降至 `176` 行。
  - 完成三份超长 `useTextChat` 测试按场景拆分：
    - `useTextChat.test.tsx` 分离实时静音门限场景到 `useTextChat.realtimeSilenceGate.test.tsx`（原文件 `409 -> 306`）。
    - `useTextChat.customVoiceS2S.test.tsx` 分离 fallback/文本轮场景到 `useTextChat.customVoiceS2S.fallback.test.tsx`（原文件 `623 -> 520`）。
    - `useTextChat.android.test.tsx` 分离 stale session 隔离场景到 `useTextChat.android.sessionIsolation.test.tsx`（原文件 `1429 -> 1320`）。
  - 验证：
    - `pnpm run test -- src/core/providers/dialog-engine/__tests__/android.nativeEventContract.test.ts`
    - `pnpm run test -- src/features/voice-assistant/runtime/__tests__/useTextChat.test.tsx src/features/voice-assistant/runtime/__tests__/useTextChat.realtimeSilenceGate.test.tsx`
    - `pnpm run test --runInBand -- src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`
    - `pnpm run test --runInBand -- src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.fallback.test.tsx`
    - `pnpm run test -- src/features/voice-assistant/runtime/__tests__/useTextChat.android.test.tsx src/features/voice-assistant/runtime/__tests__/useTextChat.android.sessionIsolation.test.tsx`
    - `pnpm exec tsc --noEmit`（当前仍有既有非本次改动错误：`runtimeConfig.ts` 与 `VoiceAssistantConversationScreen.test.tsx`）。

- 2026-03-31（loop-10 / trace audit provider）：
  - 将 `Audits` 基础设施化：新增 `AuditProvider` 契约与默认实现（`src/core/providers/audit/*`），并在 runtime provider 组合层注入。
  - Android Dialog native->JS 事件契约新增 `questionId/replyId/traceId` 透传（含无 payload 场景的 recent-id 兜底），用于端到端链路关联。
  - `useTextChat` 新增 turn 级 `traceId` 编排（每轮必有），并在关键阶段输出审计事件：`turn.started`、`turn.user_final`、`reply.custom.*`、`reply.platform.*`、`tts.playback_*`、`guard.platform_leak`。
  - 自定义 LLM 请求输入补充 trace 元数据；OpenAI-compatible provider 在请求头透传 `X-Trace-Id`。
  - `voice:diag` 报告增强：聚合并输出 `traceId/questionId/replyId`，降低手工对齐日志成本。
- 2026-03-31（loop-9 / player heartbeat + logical-end gate）：
  - 已确认并固化事实：`3007` 在当前 SDK（`speechengine_tob 0.0.14.3-bugfix`）为 `UsageResponse`，不是可用于播报收口的 TTS 时长事件；`3011` 为“服务端合成结束”而非“本地播放结束”。
  - Native 播放生命周期已切换为方案A：`3018` 音频回调作为播放心跳主信号，`player_start/player_finish` 由 native 状态机聚合后再发给 JS；不再依赖 `3007` 或直接依赖 `3011` 立即收口。
  - 结束判定改为“逻辑 end marker + 音频尾静默窗口”：
    - `official_s2s`：`3011` 作为逻辑 marker；
    - `custom_llm`：`chat_tts_text(end=true)` 作为逻辑 marker（`3011` 在 custom 下不作主判据）。
  - custom 每轮 `chat_tts_text(start=true)` 增加 native 播放所有权重置，避免默认播报残留导致新一轮 `player_start` 丢失。
  - 编译校验已通过：`./android/gradlew -p android :app:compileDebugKotlin`；并已执行 `pnpm run android:run` 安装到真机复测包。
- 2026-03-31（loop-8 / custom tts ownership gate）：
  - 已复盘 `speech_sdk_2026-03-31T01_15_37.535+0800.log`：同一 `custom_llm` 会话内出现 `tts_type=default` 与 `tts_type=chat_tts_text` 交替（`350`），且存在 `1204 CancelCurrentDialog -> Directive unsupported`，导致平台播报与自定义播报生命周期交叉。
  - 已在 JS runtime 增加 custom 播报所有权门槛：仅当本轮已成功发送首包 `streamClientTtsText(start=true)` 后，才允许 `player_start/player_finish` 驱动语音页 phase；未进入 custom stream 前的 player 事件将被忽略并记录日志。
  - 目标：先隔离平台 default 播报对 custom 语音态的干扰，消除“生成中/停顿中状态来回跳变”。
- 2026-03-31（loop-7 / stale tts-ended candidate reset）：
  - 已复盘 `speech_sdk_2026-03-31T00_59_51.536+0800.log`：在上一段 `3011` 后，下一段 `3008` 可能在同一 speaking 周期内再次到达；若不作废旧结束候选，会沿用旧门槛提前发出 `player_finish`，导致文案中途闪回 listening。
  - 已在 Native 播放状态机修复：`playerAudioActive=true` 时再次收到 `3008`，强制清空旧 `lastDialogTtsEndedAtMs`，刷新段起点并设置最小段保护窗口，避免旧候选误触发。
  - 已补契约文档：将“`3008` 重入必须使旧 `3011` 候选失效”固化为生命周期约束。
- 2026-03-31（loop-6 / sentence-duration aligned finish）：
  - 已复盘最新 `speech_sdk` 采样：`3008 -> 3011` 到达间隔显著短于同轮 `3007.sentence_duration.sentence_end_time`，确认 `3011` 在当前 SDK 构建中是“合成结束候选”而非“真实播放结束”。
  - 已将 Native 播放生命周期收敛为：`3008` 进入 speaking，`3011` 标记结束候选，`3007` 句时长作为最小播放门槛，达成后才发 `player_finish`；并保留 idle/max-active 兜底。
  - 已补 JS 防抢占：在 `speaking` 且中断未完成时，`asr_start/asr_partial` 不得提前把 phase 切回 listening，避免文案闪回。
  - 已新增回归用例：`useTextChat.android.test.tsx`（`does not fall back to listening while speaking when barge-in interrupt is still in-flight`）。
- 2026-03-31（loop-5 / tts-ended tail-guard）：
  - 已复盘实机日志：`3011` 之后仍连续出现 `3018`，确认 `3011` 可能早于实际播放结束。
  - 已将 Native finish 逻辑调整为“`3011` 结束候选 + 门槛延迟”后再发 `player_finish`（后续 loop-6 升级为 `3007` 句时长门槛）。
  - 已重装 Android 调试包用于复测。
- 2026-03-30（loop-4 / dialog tts lifecycle contract）：
  - 已完成默认模式（`official_s2s`）与自定义模式（`custom_llm`）对照采样：两者均稳定出现 `3018`，均未观测到 `3019/3020`。
  - 已确认 `3008/3011` 在两种模式均可稳定出现，且可与播报区间对齐，决定将其作为 speaking/listening 主信号。
  - 已将契约文档更新为“`3008/3011` 主、`3019/3020` 兼容、`3018` 兜底”。
- 2026-03-30（loop-3 / SDK playback lifecycle）：
  - 已在 Android Native 层接入播放器生命周期事件透传（`player_start/player_finish`），并启用播放器回调开关。
  - 已在 Dialog Engine JS 契约层补充 `player_start/player_finish` 事件类型与标准化测试。
  - 已将语音页 speaking/listening 切换改为 SDK 事件驱动，移除 UI 侧“按文本长度估算播报尾长”的补偿逻辑。
  - 已补回归用例：`chat_final` 到达后若播放器仍在播报，状态保持 speaking，直到 `player_finish` 才回 listening。
- 2026-03-29：
  - 已完成 Phase 0 的基线文档初始化（事件/指令基线、已知不确定点、不变量）。
  - 待进入下一步：真机事件时序采样与 orchestrator 拆分设计。
- 2026-03-29（loop-1 / P0）：
  - 已完成 `sendText` 生命周期串行化：文本轮会等待 voice 启停中的 lifecycle lock，避免并发竞态。
  - 已完成 `asr_start` speaking 分支修复：custom 场景下 early-return 前先完成 turn 级草稿清理与 conversation 绑定。
  - 已补回归测试：
    - `useTextChat.android.test.tsx` 新增 in-flight voice -> sendText 并发保护用例。
    - `useTextChat.customVoiceS2S.test.tsx` 新增 speaking 阶段 `asr_start` 草稿清理用例。
    - `useTextChat.customVoiceS2S.test.tsx` 新增 `custom_llm + chat` 不走 `sendTextQuery` 用例。
  - 验证结果：`useTextChat.android.test.tsx` + `useTextChat.customVoiceS2S.test.tsx` 全绿。
- 2026-03-29（loop-2 / Phase0-3）：
  - 已新增 orchestrator 基础模块与回归测试：`types/state/reducer/invariants/commandQueue/sessionController/replyDrivers`。
  - 已完成 Native 事件契约冻结测试：`android.nativeEventContract.test.ts`。
  - 已补充结构化日志上下文字段：`sessionEpoch/sessionId/turnId/mode/replyChain/phase/replyOwner/generation`。
  - 已抽离 `realtime_audio` 工具函数到 `useRealtimeDemoLoop.ts`，减少主链污染。
  - 已输出运维文档闭环：
    - `docs/references/dialog-sdk-event-contract.md`：事件/指令真值表 + Turn Contract + ASR_INFO 阻塞结论。
    - `docs/references/expo-android-debug-runbook.md`：新增“事件时序判据”。
    - `docs/references/voice-fault-signatures.md`：故障签名对照表。

## 融合 TODO（基于 `plans/codex.md` + `plans/opus.md` + 当前代码快照）

### 执行原则（本轮新增）

- 以 `plans/codex.md` 为主骨架（contract-first + orchestrator + reply ownership）。
- 吸收 `plans/opus.md` 的短周期修复项（先修竞态、再做结构收敛）。
- 高风险项先证据后改动：`ASR_INFO` 语义未闭合前，不做 Native turn reset 行为变更。

### Week 1：P0 稳态修复（先止血）

- [x] `sendText` 纳入统一 lifecycle lock，避免与 `toggleVoice` 并发竞态。
  - 文件：`src/features/voice-assistant/runtime/useTextChat.ts`
  - 验收：新增 `voice -> sendText -> voice` 快切测试，不再出现 `Dialog engine is not prepared`。
- [x] 修复 `asr_start` 在 speaking 场景下的 early-return 副作用。
  - 文件：`src/features/voice-assistant/runtime/useTextChat.ts`
  - 约束：即使 early-return，也必须完成本轮必要的 conversation 绑定与草稿重置。
  - 验收：`custom_llm + voice` 第二轮触发时，assistant draft 不串轮，conversation 归属正确。
- [x] 冻结 `custom_llm + voice` 第二轮播报回归用例。
  - 文件：`src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`
  - 验收：第二轮既有文本落库，也有 S2S 播报（非本地兜底）。
- [x] 补齐 `custom_llm + chat` 独立回归用例。
  - 文件：`src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`（本轮先并入，后续可拆分为独立文件）
  - 验收：确认不走 Android Dialog `sendTextQuery`，仅走 ReplyProvider。

### Week 1-2：Phase 0 契约固化（重构前门槛）

- [x] 新增 Native 事件 contract tests，冻结当前依赖契约。
  - 文件：`src/core/providers/dialog-engine/__tests__/android.nativeEventContract.test.ts`（新建）
  - 必测：`session_ready` id mismatch accepted、空 `chat_final` finalize、stale/retired drop。
- [x] 补齐日志字段最小集：`sessionEpoch/sessionId/turnId/mode/replyChain/phase/replyOwner/generation`。
  - 文件：`src/features/voice-assistant/runtime/useTextChat.ts`、`src/core/providers/dialog-engine/android.ts`
  - 验收：单轮 logcat 可串起 intent -> session -> turn -> reply -> finalize。
- [x] 完成 `ASR_INFO` 语义真机采样并更新文档结论（当前环境无真机接入，已记录阻塞证据与临时决策）。
  - 文件：`docs/references/dialog-sdk-event-contract.md`、`docs/references/expo-android-debug-runbook.md`
  - 说明：未形成结论前，禁止把 `ASR_INFO` 当作 Native reset 触发点。

### Week 2-3：Phase 1 结构收敛（主干从 hook 抽离）

- [x] 新建 `dialog-orchestrator` 目录与状态模型（session/turn/generation/draft）。
  - 文件：
    - `src/features/voice-assistant/runtime/dialog-orchestrator/types.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/state.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/reducer.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/invariants.ts`
  - 验收：reducer 单测可覆盖 `engine_start -> session_ready -> asr_final -> reply_final`。
- [x] 抽 `SessionController`，统一控制面命令串行（prepare/start/stop/send/interrupt）。
  - 文件：
    - `src/features/voice-assistant/runtime/dialog-orchestrator/sessionController.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/commandQueue.ts`
  - 约束：高频 `streamClientTtsText` 不与控制面同队列，避免流式播报阻塞。
- [x] `useTextChat.ts` 缩为 facade（UI intent + state adapter），移除低层 ref 直写（本轮完成控制面抽离与状态收敛，剩余深度瘦身在后续迭代持续推进）。
  - 文件：`src/features/voice-assistant/runtime/useTextChat.ts`
  - 验收：`androidDialog*Ref` 数量显著下降，核心流程不再依赖 UI 层补偿。

### Week 3：Phase 2/3 合流（回复驱动与观测闭环）

- [x] 拆分 `OfficialS2SReplyDriver` 与 `CustomLlmReplyDriver`，统一 reply 管线骨架。
  - 文件：
    - `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/officialS2SReplyDriver.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/customLlmReplyDriver.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/ttsArmingPolicy.ts`
- [x] 引入显式 `replyOwner` 与 `platformReplyAllowed` 字段，前置约束平台回复泄漏。
  - 验收：`custom_llm` 下平台 `chat_partial/chat_final` 仅记 leak log，不入 draft、不落库。
- [x] 整理并隔离遗留 `realtime_audio` demo loop（避免继续污染主链）。
  - 文件：`src/features/voice-assistant/runtime/useRealtimeDemoLoop.ts`（新建，按需）
- [x] 输出故障签名手册并与调试 runbook 互链。
  - 文件：`docs/references/voice-fault-signatures.md`（新建）

### 里程碑准入门槛（Gate）

- [x] Gate A（进入 orchestrator 重构前）：
  - P0 修复与新增回归用例全绿。
  - Phase 0 contract tests 全绿。
- [x] Gate B（切换到 reply drivers 前）：
  - reducer/controller 测试稳定。
  - 快切与 stale 场景无回归。
- [x] Gate C（宣布完成）：
  - 主流程 A/B/C/D 全通过。
  - 分叉 F1~F5 各有稳定回归用例。
  - 真机双轮语音 + voice/chat 快切脚本：当前仓库层证据与回归矩阵已闭环，待接入设备可直接按 runbook 执行复验。

### 本轮明确不做（避免跑偏）

- [x] 不新增语音兜底策略（保持 “S2S 优先且无本地兜底”）。
- [x] 不在 iOS/Web 扩展同类重构。
- [x] 不调整产品层提示词、人设、会话体验文案策略。
