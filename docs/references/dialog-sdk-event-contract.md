# Android Dialog SDK 事件与指令基线（当前仓库）

> 目的：在“语音/聊天链路稳定性优化”前，先统一 SDK 语义口径，减少基于猜测改逻辑。
> 版本：基于当前仓库 `RNDialogEngineModule.kt` + `useTextChat.ts` + 官方文档可获取片段。

## 1. 证据分级

- `L1（源码强证据）`：仓库内 Android 原生桥与 JS runtime 行为，可直接定位代码行。
- `L2（官方文档证据）`：火山引擎文档中可访问内容与搜索摘要。
- `L3（运行时推断）`：来自 logcat/线上现象，需持续验证。

## 2. 事件映射（L1）

来源文件：

- `android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
- `src/core/providers/dialog-engine/types.ts`
- `src/core/providers/dialog-engine/android.ts`

当前映射关系：

| Native Message Type | JS Event | 当前处理语义 |
| --- | --- | --- |
| `MESSAGE_TYPE_ENGINE_START` | `engine_start` | 会话启动，设置 active session id |
| `3003` | `session_ready` | 会话就绪（兼容 `dialog_id` 与 `engine_start` id 不一致） |
| `MESSAGE_TYPE_ENGINE_STOP` | `engine_stop` | 会话结束，清理状态与草稿 |
| `MESSAGE_TYPE_ENGINE_ERROR` | `error` | 引擎错误，进入 error/idle 收敛 |
| `MESSAGE_TYPE_DIALOG_ASR_INFO` | `asr_start` | 一轮语音识别开始（目前 runtime 以此触发 turn re-arm） |
| `MESSAGE_TYPE_DIALOG_ASR_RESPONSE` | `asr_partial` | 增量识别文本 |
| `MESSAGE_TYPE_DIALOG_ASR_ENDED` | `asr_final` | 识别结束，使用 `lastAsrPartialText` 作为最终文本 |
| `MESSAGE_TYPE_DIALOG_CHAT_RESPONSE` | `chat_partial` | 增量回复文本（当前 native 直接拼接为累计草稿） |
| `MESSAGE_TYPE_DIALOG_CHAT_ENDED` | `chat_final` | 回复结束，提交并清草稿 |

## 3. 指令使用面（L1）

当前项目实际调用指令（经原生桥封装）：

- 生命周期：
  - `DIRECTIVE_SYNC_STOP_ENGINE`
  - `DIRECTIVE_START_ENGINE`
- 对话控制：
  - `DIRECTIVE_EVENT_CHAT_TEXT_QUERY`
  - `DIRECTIVE_CANCEL_CURRENT_DIALOG`
  - `DIRECTIVE_PAUSE_TALKING`
  - `DIRECTIVE_RESUME_TALKING`
- Delegate TTS：
  - `DIRECTIVE_DIALOG_USE_CLIENT_TRIGGER_TTS`
  - `DIRECTIVE_DIALOG_USE_SERVER_TRIGGER_TTS`
  - `DIRECTIVE_DIALOG_CHAT_TTS_TEXT`

## 4. 工作模式与链路边界（L1 + L2）

- `DIALOG_WORK_MODE_DEFAULT`：
  - 官方自动回复链路（ASR + LLM + TTS）主导；
  - 适配 `official_s2s` 主流程。
- `DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`：
  - 允许每轮选择 client-triggered 或 server-triggered TTS；
  - 适配 `custom_llm` 语音主流程（内容来自自定义 LLM，播报优先 S2S voice）。

官方文档可见片段（iOS 版接口文档）与当前实现一致地强调：

- delegate 模式下，每轮都需要明确选择 client/server trigger，否则可能不播音；
- 常见时机是收到 `SEDialogASRInfo` 后切换 trigger 模式。

## 5. 当前已知不确定点（必须通过实验固化）

### 5.1 `ASR_INFO` 语义存在文档表述冲突（L2）

- 同一官方文档不同段落对 `SEDialogASRInfo` 有“用户开始说话”与“用户说完一句等待回复”两种表述。
- 当前仓库把它映射为 `asr_start` 并在这一点做 turn re-arm（`useClientTriggeredTts` 背景预热）。

动作：

- 需要在 Android 真机上补“事件时序采样”日志，确认 `ASR_INFO/ASR_RESPONSE/ASR_ENDED` 的真实顺序与语义。

### 5.2 `session_ready` id 与 `engine_start` id 可能不一致（L1 + L3）

- 已在 runtime 做兼容，不再把该场景直接当 stale；
- 仍需继续监控这类会话下的 stale 过滤误杀率。

### 5.3 `DIRECTIVE_CANCEL_CURRENT_DIALOG` 能力并非所有构建稳定支持（L1 + L3）

- 已观察到 `Directive unsupported`；
- 结论：不能把“中途打断”作为唯一纠偏手段，必须在回合前置确保 delegate + trigger 路径正确。

## 6. 优化前强制不变量（供 runtime 重构使用）

- 同一时刻只允许一个 active dialog session；
- 任何回合文本都必须“可落库”，即使播报失败；
- `custom_llm` 模式下，平台 `chat_partial/chat_final` 默认视为泄漏事件；
- 语音模式切换要满足最终一致性：
  - `mode=text => isVoiceActive=false`
  - `mode=voice => isVoiceActive=true`（会话就绪后补偿启动）

## 7. 参考来源

- 火山引擎：端到端 iOS SDK 接口文档（可访问片段）
  - <https://www.volcengine.com/docs/6561/1597646>
- 仓库源码：
  - `/android/app/src/main/java/com/anonymous/mydoubao2/dialog/RNDialogEngineModule.kt`
  - `/src/core/providers/dialog-engine/android.ts`
  - `/src/features/voice-assistant/runtime/useTextChat.ts`
