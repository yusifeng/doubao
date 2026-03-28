# Voice Assistant S2S V1 Design

## 1. 目标

在 `voice-assistant-s2s-v1` 产品规格基础上，确定 V1 技术设计：

- 采用分层架构与 Provider 架构；
- Android 优先、免长按语音交互；
- V1 优先可用与可演进，V2 再增强安全与平台化能力。
- 建立样式 Tokenizer Design，保证视觉语言一致且可扩展。
- V1 默认采用稳定语音链路：`ASR -> sendTextQuery -> TTS`，实时 PCM 链路保留为实验开关。
- Android 新阶段切换到官方 Dialog SDK 托管 ASR/TTS/AEC/播放，并采用模式矩阵：
  - `official_s2s`：`DIALOG_WORK_MODE_DEFAULT`（官方自动回复）
  - `custom_llm`：`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`（自定义文本 + client-triggered TTS）

## 2. 总体架构

```text
UI(Screen/Component)
  -> Runtime(ConversationStateMachine)
    -> Service(UseCases)
      -> Repo(ConversationRepo, S2SRepo)
        -> Providers(StorageProvider, S2SProvider, AudioProvider, ObservabilityProvider)
```

约束：

- `ui` 不直接访问网络/数据库；
- `runtime` 只编排状态，不持有底层实现细节；
- `repo` 仅依赖 provider 契约，不依赖具体实现。

## 3. 分层与目录建议

建议新增：

- `src/features/voice-assistant/types`
- `src/features/voice-assistant/config`
- `src/features/voice-assistant/repo`
- `src/features/voice-assistant/service`
- `src/features/voice-assistant/runtime`
- `src/features/voice-assistant/ui`

建议新增 core 级 provider 契约与实现：

- `src/core/providers/storage`
- `src/core/providers/s2s`
- `src/core/providers/audio`
- `src/core/providers/dialog-engine`
- `src/core/providers/reply`
- `src/core/providers/observability`

建议新增样式 token 模块：

- `src/core/theme/tokens.ts`
- `src/core/theme/mappers.ts`（token 到 NativeWind/组件属性映射）

## 4. Provider 设计（V1）

## 4.1 StorageProvider（本地存储）

V1 决策：会话与消息持久化优先采用 **SQLite**。

原因：

- 会话与消息天然是结构化数据，适合关系存储；
- 便于分页、检索、按时间排序、历史归档；
- 便于后续扩展（多会话状态、草稿、失败重试记录）。

契约建议：

- `createConversation()`
- `listConversations()`
- `appendMessage(conversationId, message)`
- `listMessages(conversationId, cursor?)`
- `updateConversationMeta(conversationId, patch)`

## 4.2 S2SProvider（实时语音网关）

V1 决策：**客户端直连 WebSocket**（开发效率优先）。

V2 规划：迁移为服务端中转（密钥保护、审计、限流）。

契约建议：

- `connect() / disconnect()`
- `startSession(config)`
- `sendAudioFrame(frame)`
- `sendTextQuery(text)`（文本兜底）
- `interrupt()`（打断播报）
- `onEvent(handler)`（统一事件流）

协议实现要点（已落地）：

- 按服务端帧头 `message_type_specific_flags` 解析 `sequence/event/session/payload`，不再用猜测偏移；
- 兼容 `gzip` 压缩响应体并在解析失败时提供可定位错误；
- 文本回复按流式分片合并，并以助手完成事件（如 `359/152/153`）收敛为完整句，避免“只返回首字”。
- 文本收束仅使用助手完成类事件（`359/152/153`），不使用用户侧端点事件 `459`，避免单轮内提前收束导致重复展示。
- 助手文本入库前执行轻量去重与规范化（连写口语段裁剪、尾部重复块折叠、标点差异归一），降低“同句重复两次”的展示概率。
- 实时语音模式下，文本轮询需短超时非阻塞（当前 40ms），避免阻塞音频消费导致播报断续。
- 若服务端返回 `DialogAudioIdleTimeoutError`（`52000042`），前端优先自动重连并恢复会话，失败后再向用户提示通话中断。

## 4.3 AudioProvider（采集与播放）

职责：

- 管理本机语音识别（ASR）会话；
- 播放服务端回复对应的语音（V1 默认本机 TTS）；
- 管理输入与播报冲突（打断策略）。

契约建议：

- `startCapture() / stopCapture()`
- `onFrame(handler)`
- `startRecognition() / stopRecognition() / abortRecognition()`
- `play(chunk) / stopPlayback()`

V1 落地策略：

- 默认：`expo-speech-recognition` 做本机语音识别，识别文本后走 `S2SProvider.sendTextQuery`。
- 默认模型版本：`2.2.0.0`（SC2.0），在 `StartSession` 中显式携带 `model` 字段。
- 默认发音人：优先使用自定义复刻音色 `S_mXRP7Y5M1`。
- SC兼容兜底：若 `StartSession` 返回“当前 model 不支持该 speaker”（如 `45000001`），在同一连接内自动切换到下一个 `saturn` 女声音色重试；全部失败后再尝试不显式传 `speaker`。
- 角色人设来源：`src/character/konan.md`，通过同步脚本生成 `src/character/konanManifest.ts` 并注入 `dialog.character_manifest`（SC版本生效字段）。
- 兜底：保留 `expo-av` 分段音频与服务端回包播放实现，受 `EXPO_PUBLIC_VOICE_PIPELINE_MODE=realtime_audio` 控制。
- 实时通话防回采：在助手播报期间按 PCM 估算时长静音上行（含尾部 margin），防止“把 TTS 当用户输入”引发自循环回复。
- 实时通话收口辅助：客户端在检测到“用户已经说过一句话，随后进入持续静音”时，会短窗口本地抑制上行，帮助服务端 VAD 更稳定结束当前轮，减少“停嘴后长时间不回 / 偶发不回”。
- 实时通话输入反馈：语音页显式展示“正在听你说 / 已听到你在说话 / 已发送，等待回复 / 助手播报中”，避免用户只能靠 LLM 是否开口来猜测输入链状态。
- 输入反馈与静音门分层：低阈值只用于过滤持续底噪；“已听到你在说话 / 已发送”必须基于更严格的人声证据触发，避免页面在未开口时误判成已发出。
- 实时通话顺滑化：优先使用 `data:audio/wav;base64` 直接播放，失败时再回退临时文件；播放调度采用“小预缓冲 + 快速 idle flush”（约 200ms 级）降低断续感与长等待。
- Android 真正实时播放链路：新增原生 `AudioTrack` 流式 PCM 播放模块（`RNRealtimePcmPlayer`），优先直写 PCM 队列；`expo-av` 作为平台兜底。
- 降级策略：保持 native 为默认主链路；仅当 native 写流发生运行时故障时，短窗口临时回退 `expo-av`，随后自动重试恢复 native。
- Android 播放输出路由：实时下行播放使用 `MEDIA/MUSIC` 输出流（避免 `VOICE_CALL` 通路在模拟器/部分机型出现失真噪音）。
- 下行音频兼容：播放前增加 PCM 格式探测窗口（避免首包误判）；若检测到 `float32 PCM` 则自动转为 `s16le` 再播放，降低格式不一致造成的白噪。
- Android 抗抖动：`AudioTrack` 线程在短时下行间隙注入静音桥接（仅 200ms 级窗口），降低网络抖动导致的下溢爆音。
- 文本去重兜底：助手完成事件重复到达时做短窗口去重，避免同一轮回复重复入库展示。
- UI 展示层将“旁白/动作句”自动包裹括号并使用浅色斜体，仅影响可视化，不改变语音播放链路。

字段生效说明（按官方文档约束）：

- O版本（`1.2.1.1`）：`bot_name / system_role / speaking_style`
- SC版本（`2.2.0.0`）：`character_manifest`

## 4.4 ObservabilityProvider（可观测）

职责：

- 输出结构化日志；
- 关键链路打点：连接、识别、生成、播报、失败。

日志最小字段建议：

- `sessionId`, `conversationId`, `phase`, `latencyMs`, `errorCode`, `errorMessage`

## 4.5 DialogEngineProvider（Android 官方引擎）

Android 平台新增 `DialogEngineProvider`，封装火山 Dialog SDK：

- `prepare()`
- `startConversation(config)`
- `stopConversation()`
- `sendTextQuery(text)`
- `useClientTriggeredTts()`
- `streamClientTtsText({ start, content, end })`
- `setListener(listener)`
- `destroy()`

职责：

- 原生录音 / AEC / ASR / TTS / 播放
- 将 SDK 回调映射为统一 JS 事件：
  - `engine_start`
  - `engine_stop`
  - `error`
  - `asr_start`
  - `asr_partial`
  - `asr_final`
  - `chat_partial`
  - `chat_final`

Android 运行时不再依赖手写 PCM 上下行与本地音频能量推测来完成主要语音闭环。
在 Android Dialog SDK 模式下，运行时增加插话打断策略：当 `chat_partial` 播报阶段收到新的 `asr_start/asr_partial`，会自动触发 `interruptCurrentDialog()`，保留已展示 assistant 文本，并将状态切回 listening。
在 Android Dialog SDK 模式下，会话内静音通过 `DIRECTIVE_PAUSE_TALKING / DIRECTIVE_RESUME_TALKING` 实现：仅暂停/恢复麦克风输入，不结束会话与播报输出。
在 Android Dialog SDK 模式下，主动挂断或强制切换会话模式前，需先把当前 `chat_partial` 草稿写回消息流，避免 `chat_final` 晚到导致“已播报但聊天记录缺失”。

Android SDK 运行前置环境：

- `EXPO_PUBLIC_S2S_APP_ID`
- `EXPO_PUBLIC_S2S_ACCESS_TOKEN`
- `EXPO_PUBLIC_S2S_APP_KEY`（可选；未显式提供时沿用当前 dialog 资源默认 app key）

WS 地址在运行时固定使用内置 SC2.0 地址（不再暴露环境变量配置）。

## 4.6 ReplyProvider（业务回复来源）

`ReplyProvider` 负责“回复文本从哪里来”，并与语音合成链路解耦：

- `generateReplyStream(input)`

当前设计采用“双模式矩阵”，由 `EXPO_PUBLIC_REPLY_CHAIN_MODE` 控制：

1. `official_s2s`
- 聊天模式文本回复走 Android Dialog/S2S 官方链路（`sendTextQuery`）
- 语音模式走官方一体化链路（ASR + LLM + TTS）

2. `custom_llm`
- 聊天模式文本回复走 `ReplyProvider(OpenAI-compatible)`
- 语音模式文本回复仍走 `ReplyProvider(OpenAI-compatible)`，但语音播报必须优先走 S2S voice（Android Dialog `useClientTriggeredTts + streamClientTtsText`）
- 仅在 S2S voice 播报失败时，允许本地 TTS 兜底，避免整轮静默
- `custom_llm` 严格模式下，不回退官方自动回复文本链路；即使本轮 `useClientTriggeredTts` 失败，也应继续生成并落库 custom LLM 文本，避免“只有失败提示没有回复内容”
- 自定义语音会话在 prepare 阶段必须把 Android Dialog 设为 `DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`，否则 `useClientTriggeredTts` / `streamClientTtsText` 可能报 `400060` 且回落官方默认播报
- 每轮在 `asr_start` 阶段选择 `useClientTriggeredTts`；`session_ready` 仅用于会话就绪标记，不再作为主切换点
- 当 SDK 不支持 `DIRECTIVE_CANCEL_CURRENT_DIALOG` 时（返回 `Directive unsupported`），不应依赖“中途打断官方播报”兜底，必须前置确保 delegate + client-triggered 生效
- 语音回合文本持久化采用“可用即落库”原则：若流式回复被下一轮抢占（generation preemption）或中途异常，已生成的 assistant 文本片段仍需写入会话消息，避免出现“用户听到了播报但聊天记录为空”

这个边界保证了：

- 自定义 LLM 能替换“回复内容”
- 同时不丢 S2S 的 voice 能力（音色/可控性）

## 4.5 Style Tokenizer（样式令牌体系）

V1 决策：引入统一设计令牌，禁止核心页面散落硬编码视觉值。

令牌分组：

- `color`: 背景、前景、边框、状态色
- `space`: 间距刻度（xs/sm/md/lg/xl）
- `radius`: 圆角刻度
- `typography`: 字号、字重、行高语义层级

使用规则：

- 页面与组件优先使用语义 token（例如 `text-primary`, `bg-surface`），而不是直接写颜色值。
- NativeWind class 可继续使用，但 class 中的颜色与排版应来自 token 映射。
- 允许过渡期存在少量历史硬编码，但新功能与重构范围内必须 token 化。

## 5. 状态机设计

状态：

- `idle`
- `listening`
- `thinking`
- `speaking`
- `error`

核心迁移：

- `idle -> listening`：用户发起语音输入
- `listening -> thinking`：输入结束并提交
- `thinking -> speaking`：收到可播报回复
- `speaking -> listening`：用户打断并继续输入
- `* -> error`：链路失败
- `error -> idle`：用户重试或恢复

实时通话优化补充（2026-03-24）：

- 运行时使用显式实时通话 phase：`idle -> starting -> listening -> speaking -> stopping -> idle`
- `start/stop` 通过生命周期锁串行化，避免快速点击导致的并发乱序
- 每次实时通话分配 generation token，旧 loop 在新会话启动后自动失效退出
- 统一通过共享 cleanup 重置实时通话本地状态，避免异常路径残留脏状态
- 输入链在服务端 VAD 之外补了一层轻量本地 endpoint assist，用于在真机/模拟器底噪存在时帮助当前轮尽快收口

简化流程图：

```text
tap start
  -> starting
  -> connect + startSession + startCapture
  -> listening
  -> receive assistant audio
  -> speaking
  -> speaking end / mute window done
  -> listening
tap stop
  -> stopping
  -> stopCapture + finishSession + finishConnection + disconnect
  -> idle
```

## 6. 数据模型（V1 最小）

- `Conversation`
  - `id`, `title`, `lastMessage`, `updatedAt`, `status`
- `Message`
  - `id`, `conversationId`, `role(user|assistant)`, `content`, `type(text|audio)`, `createdAt`

## 7. 安全与配置

- V1 允许直连以快速验证；
- 支持“设置页覆盖 `.env`”的运行时配置仓储：用户配置优先，环境变量兜底；
- 敏感字段（LLM API Key、S2S Access Token、Android AppKey 覆盖值）持久化到 SecureStore；
- 非敏感字段（URL、模型、模式、音色）持久化到普通存储；
- V2 必须切换中转层并移除客户端直接持有敏感凭证。

## 8. 错误与恢复策略

- WebSocket 连接失败：提示并支持一键重连；
- 识别/生成超时：中止当前轮并回到 `idle`；
- 播放失败：保留文本结果，允许手动重播；
- 任意异常不阻塞会话列表与历史回看。

## 9. 性能目标（V1）

- 主观可用：用户能感知“正在听/思考/播报”；
- 首次交互可在可接受时间内返回（具体数值在实现阶段补充度量）；
- 连续 5 轮对话不崩溃，状态可恢复。

## 10. 实施顺序建议

1. 先搭 Provider 契约与空实现；
2. 先打通文本链路（最小可用）；
3. 再接入语音识别（ASR）与 TTS 播放；
4. 最后补齐会话持久化与错误恢复。
5. 在 UI 收敛阶段完成 token 化替换与一致性检查。

## 11. UI 同款对齐补充

当前首页视觉对齐参考来源：

- `my-doubao-pic/*.jpg`

已落地约束：

- 使用暖色浅背景和品牌色头部区，不再使用默认深色控制台风格
- 状态区、消息区、输入区统一使用大圆角卡片体系
- 主语音操作与次级按钮做强弱区分
- 助手/用户消息在底色和文字对比上明确区分

验收文档：

- `docs/design-docs/voice-assistant-ui-parity.md`
