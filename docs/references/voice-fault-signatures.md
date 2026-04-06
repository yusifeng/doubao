# Voice Fault Signatures（语音链路故障签名）

> 目标：把高频问题标准化为“签名 -> 定位步骤 -> 修复建议”，减少重复排查成本。
> 适用范围：Android Dialog SDK + `useTextChat` 当前主链。

> 口径说明：签名定位以语义阶段为主（start/end/interrupted/listening 收口），数字事件码仅作为排障附注，不作为业务判断条件。

## 1. 使用方式

1. 先按 `docs/references/expo-android-debug-runbook.md` 复现并抓日志。
2. 用下方签名表匹配最接近的问题。
3. 按“定位步骤”执行，不要跳步。
4. 只在证据闭环后改代码。

## 2. 签名对照表

| 故障签名 | 典型现象 | 关键日志 | 定位步骤 | 修复建议 |
| --- | --- | --- | --- | --- |
| `F1_STALE_SESSION_DROP` | 旧会话回复串进当前会话或消息错位 | `dialog.stale_drop`, `payload_session_mismatch`, `retired_session` | 1) 对比 `eventSessionId` 与 `activeSessionId` 2) 确认是否已有 `engine_stop` | 保持 retired/stale 过滤；禁止移除 session mismatch guard |
| `F2_CLIENT_TTS_NOT_READY` | custom 语音本轮被取消并提示“接管失败” | `useClientTriggeredTts ... 400060`, `custom llm voice turn aborted: client tts was not selected` | 1) 检查 `dialogWorkMode=delegate_chat_tts_text` 2) 看 `session_ready` 是否先到 3) 看 `asr_start` 后是否触发本轮选路与等待 | 保持每轮 `asr_start` re-arm + `asr_final` 选路 gate；未完成接管时 fail-closed（取消本轮并重置会话），禁止回退平台回复 |
| `F2_CLIENT_TTS_ALREADY` | 指令报错但实际可播 | `400061` | 1) 确认错误码是否 400061 2) 检查后续是否有 stream | 将 `400061` 视为 already enabled，不应判失败 |
| `F3_PLATFORM_LEAK_IN_CUSTOM` | custom 轮次混入官方回复（或播报生命周期被平台事件污染） | `dialog.leak_guard platform chat_partial/chat_final ...`、`Get message event: 350 ... \"tts_type\":\"default\"`（同会话内与 `chat_tts_text` 交替） | 1) 确认当前 `replyChain=custom_llm` 2) 核对同会话是否同时出现 `tts_type=default` 与 `tts_type=chat_tts_text` 3) 检查是否触发 interrupt 以及 `Directive unsupported` | 平台 `chat_*` 在 custom 模式下一律丢弃；player 生命周期在 custom 模式下必须绑定“本轮 custom stream 已开始”所有权门槛；interrupt 失败时执行会话硬重置（stop+restart） |
| `F4_MODE_SWITCH_RACE` | voice/chat 快切后状态错位、偶发 not prepared | `call lifecycle lock wait timeout`, `Dialog engine is not prepared` | 1) 看 `toggleVoice` 与 `sendText` 时间重叠 2) 检查 lifecycle lock 生效 | 控制面命令串行化；`sendText` 等待 lifecycle lock |
| `F5_COLD_START_NOT_READY` | 首轮操作被吞或不触发播报 | 首轮缺 `session_ready` / `activeConversationId` 为空 | 1) 确认 conversation 是否已 bootstrap 2) 看 session 是否 ready | 未 ready 不进 reply 主链；等待会话就绪后重试 |
| `F6_PLAYER_LIFECYCLE_GAP` | 播报中状态先显示“说话或点击打断”后回到“正在听...”再跳回 | `3011` 提前到达；`3011` 后仍有 `3018`；或 custom 轮次未绑定到 `chat_tts_text(end=true)` marker；或 `asr_start/asr_partial` 在 speaking 中抢占 phase | 1) 核对是否存在 `3011 -> 3018` 连续序列 2) 检查 custom 是否在 `chat_tts_text(start=true/end=true)` 两端正确重置/收口 3) 检查 `player_finish` 是否由“逻辑 end marker + 音频尾静默”联合触发 4) 检查 JS 是否在 speaking 阶段被 asr 事件抢先切到 listening | 以 `3018` 为播放心跳主信号；`official_s2s` 用 `3011` 作逻辑结束 marker，`custom_llm` 用 `chat_tts_text(end=true)` 作逻辑结束 marker；finish 必须满足“有 marker + 音频尾静默窗口”，不直接依赖 `3011` 或 `3019/3020`；JS 在 speaking 且未完成中断时禁止 asr 抢占 phase |
| `TURN_FINALIZE_EMPTY_CHAT_FINAL` | `chat_final` 文本为空导致丢回复 | `chat_final textLength=0` + 之前有 partial | 1) 看是否有 `chat_partial` 草稿 2) 查 final 合并逻辑 | final 走 event/draft/pending 三段 fallback 合并 |
| `INTERRUPT_UNSUPPORTED` | 中途打断无效或报错 | `Directive unsupported` | 1) 检查触发点是 manual/barge-in/leak 2) 看是否仍有文本落库 | 不依赖 interrupt 做唯一补救；前置保证 delegate + tts 接管 |

## 3. 最小复盘字段

一次复盘至少收集以下字段（来自 structured logs）：

- `sessionEpoch`
- `sessionId`
- `turnId`
- `mode`
- `replyChain`
- `phase`
- `replyOwner`
- `generation`

缺少以上字段时，不建议直接给修复结论。

## 4. 与其他文档的关系

- 事件语义与契约：`docs/references/dialog-sdk-event-contract.md`
- 日常抓包与时序判据：`docs/references/expo-android-debug-runbook.md`
- 当前执行计划：`docs/exec-plans/active/plan-voice-chat-flow-stabilization-v2.md`
