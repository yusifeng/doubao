# Android Dialog SDK 事件与指令契约（Voice/Chat 稳态版）

> 目的：把 `useTextChat` 与 Android Dialog SDK 的依赖语义固化为“可验证契约”，避免继续基于猜测叠补丁。
> 更新时间：2026-03-29（Asia/Shanghai）

## 1. 证据分级

- `L1（源码强证据）`：仓库源码与单测可直接验证。
- `L2（官方文档证据）`：可访问官方文档片段。
- `L3（运行观测证据）`：logcat/实机现象或历史排障记录。

## 2. 事件真值表（Event Truth Table）

来源文件：

- `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
- `src/core/providers/dialog-engine/android.ts`
- `src/core/providers/dialog-engine/types.ts`
- `src/features/voice-assistant/runtime/useTextChat.ts`

| Native Message Type | JS Event | textMode | Turn 语义 | 运行时处理要点 | 证据 |
| --- | --- | --- | --- | --- | --- |
| `MESSAGE_TYPE_ENGINE_START` | `engine_start` | `none` | Session 启动 | 锁定 active `sessionId`，重置 ready/client-tts 标志 | L1 |
| `3003` | `session_ready` | `none` | Session 可收发 | 标记 ready；允许 `session_ready` id 与 `engine_start` id 不一致 | L1 + L3 |
| `MESSAGE_TYPE_ENGINE_STOP` | `engine_stop` | `none` | Session 结束 | 清理会话/草稿/ready，加入 retired-session 列表 | L1 |
| `MESSAGE_TYPE_ENGINE_ERROR` | `error` | `none` | Session 失败 | 进入 error 收敛，语音态退回 idle | L1 |
| `MESSAGE_TYPE_DIALOG_ASR_INFO` | `asr_start` | `none` | Turn 起点（候选） | 每轮 re-arm client-triggered TTS，重置 leak-guard | L1 + L2 |
| `MESSAGE_TYPE_DIALOG_ASR_RESPONSE` | `asr_partial` | `delta` | Turn 进行中 | 刷新 live transcript，更新 hearing 状态 | L1 |
| `MESSAGE_TYPE_DIALOG_ASR_ENDED` | `asr_final` | `final_from_last_partial` | Turn 输入完成 | 用户消息落库并启动 reply 管线 | L1 |
| `MESSAGE_TYPE_DIALOG_CHAT_RESPONSE` | `chat_partial` | `aggregate` | Reply 流式输出 | official: 更新草稿；custom: 视为 leak 并丢弃 | L1 |
| `MESSAGE_TYPE_DIALOG_CHAT_ENDED` | `chat_final` | `final_from_last_partial` | Reply 结束 | official: finalize 落库；custom: 仅记录 leak，不落库 | L1 |

## 3. 指令真值表（Directive Truth Table）

| 指令 | 使用场景 | 预期返回 | 失败处理 | 证据 |
| --- | --- | --- | --- | --- |
| `DIRECTIVE_START_ENGINE` | `startConversation` | `0` | 抛错并进入启动失败收敛 | L1 |
| `DIRECTIVE_SYNC_STOP_ENGINE` | `stopConversation` | `0` | best effort 停止并清理本地态 | L1 |
| `DIRECTIVE_EVENT_CHAT_TEXT_QUERY` | `official_s2s + text` | `0` | 当前文本轮失败并写错误提示 | L1 |
| `DIRECTIVE_DIALOG_USE_CLIENT_TRIGGER_TTS` | `custom_llm + voice` 每轮 re-arm | `0` 或 `400061` | `400060/not ready` 重试；失败仅保留文本 | L1 + L3 |
| `DIRECTIVE_DIALOG_USE_SERVER_TRIGGER_TTS` | 预留，不走主链 | `0` | 当前链路不依赖该指令 | L1 |
| `DIRECTIVE_DIALOG_CHAT_TTS_TEXT` | custom 文本流式播报 | `0` | 失败后中断平台播报，回落为“文本可用” | L1 |
| `DIRECTIVE_CANCEL_CURRENT_DIALOG` | manual interrupt / leak 抑制 | `0` | 失败不影响文本持久化 | L1 + L3 |
| `DIRECTIVE_PAUSE_TALKING` / `RESUME_TALKING` | 语音输入静音开关 | `0` | 回滚 mute UI 态，保持会话 | L1 |

## 4. Turn Contract（单轮收敛契约）

### 4.1 Turn 状态机

`idle -> listening -> awaiting_reply -> replying/speaking -> finalized -> listening`

### 4.2 入口条件

- `session.phase=ready`。
- `asr_start` 到达时，必须先执行：
  - 清理上一轮 draft；
  - 重新标记当前轮 `replyOwner/platformReplyAllowed`；
  - custom 模式重置 client-triggered tts 轮级标记并触发 re-arm。

### 4.3 收敛规则

- `official_s2s`：
  - `chat_partial*` 仅更新草稿；
  - `chat_final` 负责 finalize + 持久化。
- `custom_llm`：
  - `asr_final` 后由 `ReplyProvider` 生成文本；
  - S2S 播报失败不阻断文本落库；
  - 平台 `chat_partial/chat_final` 视为 leak，不入库。

### 4.4 中断规则

- manual interrupt 和 barge-in 走同一路径：`interruptCurrentDialog`。
- 中断失败时不得丢失当前已生成文本。

### 4.5 失败规则

- 任一轮失败都要满足“文本可落库或明确错误提示可见”。
- 不允许 silent failure（无音频、无文本、无错误提示）。

## 5. 会话与分叉契约（F1~F5）

- `F1` stale/retired/session mismatch：仅允许 active session 写入，旧 session 统一 drop 并记录 `dialog.stale_drop`。
- `F2` delegate trigger failure：`400060` 重试，`400061` 视作已启用；最终失败只降级为文本可用。
- `F3` platform leak in custom：平台 `chat_*` 只记 leak log，不入 draft、不落库。
- `F4` mode switch race：`prepare/start/stop/send/interrupt` 走统一控制面串行队列，`sendText` 等待 lifecycle lock。
- `F5` cold start not ready：在 `activeConversationId` 未就绪或 session 未 ready 时，禁止进入 reply 播报链。

## 6. `ASR_INFO` 语义采样结论（当前阶段）

### 6.1 现状

- 文档层面对 `ASR_INFO` 存在“开始说话”与“一句结束”两种描述（L2）。
- 当前实现仍将 `ASR_INFO` 映射为 `asr_start`，并用于 turn re-arm（L1）。

### 6.2 本轮采样状态

- 2026-03-29 在当前开发环境执行 `adb devices`，无可连接真机。
- 结论：本轮无法完成“真机时序采样”证据闭环，仅能维持 L1/L2/L3 组合结论。

### 6.3 临时决策

- 在获得真机时序证据前，保持现有策略：`ASR_INFO -> asr_start`，只做 turn re-arm，不作为 Native turn reset 触发点。
- 该决策已在 runtime 与测试中冻结，避免再次引入重置类回归。

## 7. 已冻结的测试证据

- Native 事件契约：`src/core/providers/dialog-engine/__tests__/android.nativeEventContract.test.ts`
  - `session_ready` id mismatch accepted。
  - empty `chat_final` payload passed-through。
  - unknown type strict drop。
  - retired/stale shape accepted for runtime filtering。
- Runtime 主链与分叉：
  - `src/features/voice-assistant/runtime/__tests__/useTextChat.android.test.tsx`
  - `src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.test.tsx`

## 8. 参考

- 火山引擎文档（可访问片段）：<https://www.volcengine.com/docs/6561/1597646>
- 仓库源码：
  - `/android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
  - `/src/core/providers/dialog-engine/android.ts`
  - `/src/features/voice-assistant/runtime/useTextChat.ts`
