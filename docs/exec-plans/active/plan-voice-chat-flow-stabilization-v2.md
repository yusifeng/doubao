# Plan: Voice/Chat 流程稳态优化（SDK First）

## 背景

过去多轮修复后，`official_s2s` 与 `custom_llm` 在语音/聊天切换路径上已可用，但仍存在“复杂分叉过多、事件语义不透明、回归风险高”的工程性问题。

本计划目标不是再叠加功能，而是：

- 先固化 SDK 语义与主流程；
- 再把现有实现收敛为“主干稳定、分叉受控”的结构；
- 最后用测试和日志把稳定性门槛抬高。

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

- [ ] 建立“事件/指令真值表”并标注证据级别（L1/L2/L3）
- [ ] 对 `ASR_INFO` 语义冲突做真机时序采样并结论化
- [ ] 形成 `Turn Contract`：一轮的开始、中断、完成、失败收敛规则
- [ ] 更新调试手册：把关键日志关键词与判据标准化

交付物：

- `docs/references/dialog-sdk-event-contract.md`（持续更新）
- `docs/references/expo-android-debug-runbook.md` 补充“事件时序判据”

## Phase 1：runtime 结构收敛（主干/分叉解耦）

- [ ] 将 `useTextChat` 中 Android Dialog 主链抽出为独立 orchestrator（保持 API 不变）
- [ ] 统一 turn 级状态容器（session/turn/generation/draft）
- [ ] 把 `official_s2s` 与 `custom_llm` 的共同骨架抽象为同一回合管线
- [ ] 仅保留显式分叉点（F1~F5），移除隐式 if-else 交叉
- [ ] 明确 `prepare/start/stop` 的幂等与串行约束

## Phase 2：测试矩阵升级（以回归防线为目标）

- [ ] 补齐“主流程 A/B/C/D”端到端级 hook 测试场景
- [ ] 分叉 F1~F5 各自至少 1 个稳定回归用例
- [ ] 增加“长回合 + 快切 + 中断”组合场景测试
- [ ] 补“事件乱序/延迟到达”测试（含 stale 过滤）

## Phase 3：可观测与运维化

- [ ] 增加统一结构化字段：`sessionId/turnId/mode/replyChain/phase`
- [ ] 限制噪声日志，保留可用于 1 次 logcat 复盘的关键链路
- [ ] 输出“故障签名 -> 定位步骤 -> 修复建议”对照表

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

- [ ] 新增 Native 事件 contract tests，冻结当前依赖契约。
  - 文件：`src/core/providers/dialog-engine/__tests__/android.nativeEventContract.test.ts`（新建）
  - 必测：`session_ready` id mismatch accepted、空 `chat_final` finalize、stale/retired drop。
- [ ] 补齐日志字段最小集：`sessionEpoch/sessionId/turnId/mode/replyChain/phase/replyOwner/generation`。
  - 文件：`src/features/voice-assistant/runtime/useTextChat.ts`、`src/core/providers/dialog-engine/android.ts`
  - 验收：单轮 logcat 可串起 intent -> session -> turn -> reply -> finalize。
- [ ] 完成 `ASR_INFO` 语义真机采样并更新文档结论。
  - 文件：`docs/references/dialog-sdk-event-contract.md`、`docs/references/expo-android-debug-runbook.md`
  - 说明：未形成结论前，禁止把 `ASR_INFO` 当作 Native reset 触发点。

### Week 2-3：Phase 1 结构收敛（主干从 hook 抽离）

- [ ] 新建 `dialog-orchestrator` 目录与状态模型（session/turn/generation/draft）。
  - 文件：
    - `src/features/voice-assistant/runtime/dialog-orchestrator/types.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/state.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/reducer.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/invariants.ts`
  - 验收：reducer 单测可覆盖 `engine_start -> session_ready -> asr_final -> reply_final`。
- [ ] 抽 `SessionController`，统一控制面命令串行（prepare/start/stop/send/interrupt）。
  - 文件：
    - `src/features/voice-assistant/runtime/dialog-orchestrator/sessionController.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/commandQueue.ts`
  - 约束：高频 `streamClientTtsText` 不与控制面同队列，避免流式播报阻塞。
- [ ] `useTextChat.ts` 缩为 facade（UI intent + state adapter），移除低层 ref 直写。
  - 文件：`src/features/voice-assistant/runtime/useTextChat.ts`
  - 验收：`androidDialog*Ref` 数量显著下降，核心流程不再依赖 UI 层补偿。

### Week 3：Phase 2/3 合流（回复驱动与观测闭环）

- [ ] 拆分 `OfficialS2SReplyDriver` 与 `CustomLlmReplyDriver`，统一 reply 管线骨架。
  - 文件：
    - `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/officialS2SReplyDriver.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/customLlmReplyDriver.ts`
    - `src/features/voice-assistant/runtime/dialog-orchestrator/replyDrivers/ttsArmingPolicy.ts`
- [ ] 引入显式 `replyOwner` 与 `platformReplyAllowed` 字段，前置约束平台回复泄漏。
  - 验收：`custom_llm` 下平台 `chat_partial/chat_final` 仅记 leak log，不入 draft、不落库。
- [ ] 整理并隔离遗留 `realtime_audio` demo loop（避免继续污染主链）。
  - 文件：`src/features/voice-assistant/runtime/useRealtimeDemoLoop.ts`（新建，按需）
- [ ] 输出故障签名手册并与调试 runbook 互链。
  - 文件：`docs/references/voice-fault-signatures.md`（新建）

### 里程碑准入门槛（Gate）

- [ ] Gate A（进入 orchestrator 重构前）：
  - P0 修复与新增回归用例全绿。
  - Phase 0 contract tests 全绿。
- [ ] Gate B（切换到 reply drivers 前）：
  - reducer/controller 测试稳定。
  - 快切与 stale 场景无回归。
- [ ] Gate C（宣布完成）：
  - 主流程 A/B/C/D 全通过。
  - 分叉 F1~F5 各有稳定回归用例。
  - 真机双轮语音 + voice/chat 快切脚本可稳定复现通过。

### 本轮明确不做（避免跑偏）

- [ ] 不新增语音兜底策略（保持 “S2S 优先且无本地兜底”）。
- [ ] 不在 iOS/Web 扩展同类重构。
- [ ] 不调整产品层提示词、人设、会话体验文案策略。
