# Android Dialog SDK 事件与指令契约（Voice/Chat 稳态版）

> 目的：把 `useTextChat` 与 Android Dialog SDK 的依赖语义固化为“可验证契约”，避免继续基于猜测叠补丁。
> 更新时间：2026-04-06（Asia/Shanghai）

## 0. 分层原则（本页总约束）

- SDK 数字事件码（如 `3018/3011/359`）属于“native 适配层实现细节”，可能随 SDK 构建变化。
- 业务层只允许依赖语义事件：
  - `assistant_playback_started`
  - `assistant_playback_finished`
  - `assistant_playback_interrupted`
  - `user_speech_started`
  - `user_speech_finalized`
- `nativeMessageType` 在上层仅可用于日志与诊断附注，不可作为业务状态切换判据。

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
- `src/core/providers/audit/types.ts`

### 2.1 业务关联字段（新增）

- Native -> JS 事件契约新增透传字段：`questionId`、`replyId`、`traceId`。
- 字段来源：
  - 优先取 SDK payload（`question_id/reply_id/trace_id`）；
  - 若当前事件未携带，则 native 使用最近一次有效值兜底（主要覆盖 `player_finish` 等无 payload 场景）。
- runtime 约束：
  - `traceId` 为业务主键（每轮必有，缺失时由 runtime 生成）；
  - `questionId/replyId` 为 SDK 侧关联键（可选补充，不可替代 `traceId`）。

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
| `MESSAGE_TYPE_DIALOG_USAGE_RESPONSE (3007)` | （native 内部） | `none` | 当前轮 token 用量回执 | 不参与播放生命周期判定 | L1 + L2 + L3 |
| `MESSAGE_TYPE_DIALOG_TTS_SENTENCE_START (3008)` | （native 内部） | `none` | 服务端句级播报起点 | 仅用于辅助生命周期调度，不直接驱动 JS speaking 文案 | L1 + L2 + L3 |
| `MESSAGE_TYPE_DIALOG_TTS_ENDED (3011)` | `player_finish`（逻辑候选） | `none` | 服务端“合成已结束”信号 | 作为逻辑结束 marker 优先信号；仍需叠加尾部静默窗口再收敛 | L1 + L2 + L3 |
| `MESSAGE_TYPE_DIALOG_PLAYER_AUDIO (3018)` | `player_audio_sample`（native 内部） | `none` | 可选播放器 PCM 回调 | 不再作为播放启动主信号；仅在已处于播放态时作为补充心跳 | L1 + L3 |
| `MESSAGE_TYPE_PLAYER_START_PLAY_AUDIO (3019)` | `player_start`（可选） | `none` | 通用播放器开始事件 | 当前 Dialog 链路不可依赖，作为可选补充信号 | L1 + L3 |
| `MESSAGE_TYPE_PLAYER_FINISH_PLAY_AUDIO (3020)` | `player_finish`（可选） | `none` | 通用播放器结束事件 | 当前 Dialog 链路不可依赖，作为可选补充信号 | L1 + L3 |

## 3. 指令真值表（Directive Truth Table）

| 指令 | 使用场景 | 预期返回 | 失败处理 | 证据 |
| --- | --- | --- | --- | --- |
| `DIRECTIVE_START_ENGINE` | `startConversation` | `0` | 抛错并进入启动失败收敛 | L1 |
| `DIRECTIVE_SYNC_STOP_ENGINE` | `stopConversation` | `0` | best effort 停止并清理本地态 | L1 |
| `DIRECTIVE_EVENT_CHAT_TEXT_QUERY` | `official_s2s + text` | `0` | 当前文本轮失败并写错误提示 | L1 |
| `DIRECTIVE_DIALOG_USE_CLIENT_TRIGGER_TTS` | `custom_llm + voice` 每轮 re-arm | `0` 或 `400061` | `400060/not ready` 重试；若本轮仍未选中 client-triggered tts，则直接 fail-closed（取消本轮并重置会话） | L1 + L3 |
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
  - `chat_final` 负责 finalize + 持久化；
  - `speaking/listening` 以“`3010/352` 播放心跳 + `3011/359` 逻辑结束 marker + 尾部静默窗口”联合判定收敛。
- `custom_llm`：
  - `asr_final` 后由 `ReplyProvider` 生成文本；
  - `asr_start -> asr_final` 之间必须完成本轮 client-triggered tts 选路；未完成则取消本轮并重置语音会话，不进入自定义回复生成；
  - `player_start/player_finish` 仅在“本轮 custom `chat_tts_text(start=true)` 已成功发出”后才允许驱动 UI speaking/listening；用于隔离同会话内平台 `tts_type=default` 的生命周期污染；
  - 播报状态以“`3010/352` 播放心跳 + `3011/359` 逻辑结束 marker + 尾部静默窗口”收敛；`chat_tts_text(end=true)` 仅作为延迟兜底结束条件；
  - 已进入自定义回复后若 `chat_tts_text` 中途失败，仍保留已生成文本并持久化；
  - 平台 `chat_partial/chat_final` 视为 leak，不入库。

### 4.4 中断规则

- manual interrupt 和 barge-in 走同一路径：`interruptCurrentDialog`。
- 中断失败时不得丢失当前已生成文本。

### 4.5 失败规则

- 任一轮失败都要满足“文本可落库或明确错误提示可见”。
- 不允许 silent failure（无音频、无文本、无错误提示）。

## 5. 会话与分叉契约（F1~F5）

- `F1` stale/retired/session mismatch：仅允许 active session 写入，旧 session 统一 drop 并记录 `dialog.stale_drop`。
- `F2` delegate trigger failure：`400060` 重试，`400061` 视作已启用；若本轮最终未选中 client-triggered tts，则 fail-closed（本轮取消并重置会话）。
- `F3` platform leak in custom：平台 `chat_*` 一律丢弃；若 `interruptCurrentDialog` 失败则执行会话硬重置（stop + restart）。
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
  - `src/features/voice-assistant/runtime/__tests__/useTextChat.customVoiceS2S.clientTtsSelection.test.tsx`（覆盖 `400060` 重试与 `400061` 已启用语义）

## 8. 播报生命周期事件采样结论（2026-03-30 ~ 2026-03-31）

- 采样来源：Android 端 `files/dialog-sdk-debug/speech_sdk_*.log` 多文件统计（2026-03-26 ~ 2026-03-31）。
- 观测结果：
  - `MESSAGE_TYPE_DIALOG_PLAYER_AUDIO (3018)`：高频出现，且可跨越“未播报/播报/已播报”多阶段，不具备稳定的“播报开始”语义；
  - `MESSAGE_TYPE_PLAYER_START_PLAY_AUDIO (3019)`：统计为 0；
  - `MESSAGE_TYPE_PLAYER_FINISH_PLAY_AUDIO (3020)`：统计为 0；
  - `MESSAGE_TYPE_DIALOG_TTS_SENTENCE_START (3008)` / `MESSAGE_TYPE_DIALOG_TTS_RESPONSE (3010)` / `MESSAGE_TYPE_DIALOG_TTS_ENDED (3011)`：稳定出现；
  - `3007` 实际为 `UsageResponse`，不包含可用于播放时长收口的稳定语义；
  - 可观测到 `3011` 后仍持续出现 `3018`（即 `3011` 不能直接视为本地播放完成）；
  - 可观测到 custom 会话中同轮同时出现 `tts_type=default` 与 `tts_type=chat_tts_text`，说明平台播报生命周期会污染 custom 链路。
- 决策：
  - 两条链路均以 `3010/352` 作为播放心跳主信号，`player_start/player_finish` 由 native 心跳状态机发出；
  - `official_s2s`：`3011/359` 作为逻辑结束 marker，需叠加尾部静默窗口后才能收敛；
  - `custom_llm`：优先使用 `3011/359` 作为逻辑结束 marker；`chat_tts_text(end=true)` 只在 SDK 结束事件缺失时作为延迟兜底；
  - custom 每轮 `chat_tts_text(start=true)` 需要重置 native 播放所有权，避免默认播报残留使新一轮 `player_start` 丢失；
  - `3019/3020` 不作为主判据，仅保留兼容消费能力；
  - `3018` 不透传给 JS 文案层，且不再承担播放启动判据，避免高频噪声导致 UI 抖动或误切换；
  - JS 侧在 `speaking` 且未完成中断时，不允许 `asr_start/asr_partial` 抢先把 phase 切回 `listening`（防 UI 闪回）。

## 9. 参考

- 火山引擎文档（可访问片段）：<https://www.volcengine.com/docs/6561/1597646>
- 仓库源码：
  - `/android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
  - `/src/core/providers/dialog-engine/android.ts`
  - `/src/features/voice-assistant/runtime/useTextChat.ts`
