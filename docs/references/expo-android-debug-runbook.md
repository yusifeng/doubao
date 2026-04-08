# Expo Android 调试手册（my-doubao2）

本文是 `my-doubao2` 的**日常调试操作手册**。目标不是讲原理，而是让你在需要时照着做，就能：

1. 启动 Android 模拟器
2. 启动 Expo Dev Client / Metro
3. 打开正确的应用
4. 看关键日志
5. 排查“页面没更新 / 打开了旧项目 / 语音不回 / 没麦克风”等常见问题

---

## 1. 当前项目的关键标识

- 仓库路径：`/Users/david/Documents/github/my-doubao2`
- Android 包名：`com.anonymous.mydoubao2`
- Expo scheme：`mydoubao2`
- 当前推荐 Metro 端口：`8081`
- 当前推荐调试模式：`Expo Dev Client + Android Emulator`

说明：

- **以后默认只调这个仓库**，不要再把旧仓库 `my-doubao` 当成主调试对象。
- 如果同时开着多个 Expo 项目，最容易出现“模拟器打开的是别的 bundle”。

---

## 2. 先理解 3 个角色

### 2.1 Android 模拟器

就是虚拟手机本身。

### 2.2 Metro

就是 JS bundle 服务器。  
React Native 页面、逻辑更新，很多时候只是 Metro 提供了新的 JS。

### 2.3 Dev Client

就是装在模拟器里的 `my-doubao2` App。  
它会去连接某个 Metro，然后加载那个 Metro 提供的 JS。

最常见的误区：

- **App 打开了，不代表打开的是当前仓库的最新代码**
- 如果 Metro 连错了项目，你看到的页面和代码就会对不上

---

## 3. 一次完整的标准启动流程

### 3.1 进入项目目录

```bash
cd /Users/david/Documents/github/my-doubao2
```

### 3.2 启动模拟器

先看看本机有哪些 AVD：

```bash
~/Library/Android/sdk/emulator/emulator -list-avds
```

启动一个你常用的模拟器，例如：

```bash
~/Library/Android/sdk/emulator/emulator -avd Pixel_3a_API_33_arm64-v8a -no-snapshot-load
```

等设备起来：

```bash
adb wait-for-device
```

### 3.3 打开模拟器麦克风输入

实时语音调试前，建议执行：

```bash
adb emu avd hostmicon
```

如果你是第一次用模拟器测语音，还要在模拟器里确认：

1. 打开模拟器右侧 `...`
2. `Extended controls`
3. `Microphone`
4. 打开 `Host audio input`

### 3.4 启动 Metro

推荐命令：

```bash
pnpm exec expo start --dev-client --clear --port 8081
```

说明：

- `--dev-client`：明确这是给 Dev Client 用的
- `--clear`：清 Metro 缓存，避免“代码明明改了但页面没变”
- `--port 8081`：这个项目当前固定按 `8081` 使用，减少混乱

### 3.5 安装 / 打开 App

#### 情况 A：首次安装，或原生工程有变化

用：

```bash
CI=0 pnpm run android:run
```

这个命令会：

1. 同步角色 manifest
2. 构建 Android
3. 安装 `com.anonymous.mydoubao2`
4. 拉起 App

#### 情况 B：App 已经装过，只想重新连到当前 Metro

直接用 deep link 强制 Dev Client 打开当前项目：

```bash
adb shell am start -a android.intent.action.VIEW -d 'exp+my-doubao2://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
```

这个命令很重要。  
如果你怀疑“模拟器打开的是别的 Expo 项目”，优先用这个命令纠正。

---

## 4. 日常最推荐的调试方式

### 4.1 首次/重置式启动

适合：

- 今天第一次调
- Metro 看起来不对
- 页面像没更新
- NativeWind / Router / 环境变量感觉串了

步骤：

```bash
cd /Users/david/Documents/github/my-doubao2
adb emu kill
~/Library/Android/sdk/emulator/emulator -avd Pixel_3a_API_33_arm64-v8a -no-snapshot-load
adb wait-for-device
adb emu avd hostmicon
pnpm exec expo start --dev-client --clear --port 8081
```

新开另一个终端：

```bash
cd /Users/david/Documents/github/my-doubao2
CI=0 pnpm run android:run
```

### 4.2 日常增量调试

适合：

- App 已安装
- 只是改了 JS / TS / 页面样式
- 不需要重新构建原生

步骤：

终端 A：

```bash
cd /Users/david/Documents/github/my-doubao2
pnpm exec expo start --dev-client --clear --port 8081
```

终端 B：

```bash
cd /Users/david/Documents/github/my-doubao2
adb shell am start -a android.intent.action.VIEW -d 'exp+my-doubao2://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
```

---

## 5. 如何确认你打开的是“对的项目”

### 5.1 看 Metro 进程

```bash
lsof -i tcp:8081
```

正常情况下，你会看到当前仓库目录下启动的 `expo start --dev-client --clear --port 8081`。

### 5.2 看 App 关键日志

```bash
adb logcat -d | rg "NativeWind verifyInstallation|voice-assistant|s2s StartSession|demo realtime call started" | tail -n 60
```

你希望看到类似：

```text
NativeWind verifyInstallation() found no errors
[voice-assistant] s2s StartSession ack
[voice-assistant] demo realtime call started
```

如果你看到的是别的项目日志，或者完全没有这些关键字，说明 Dev Client 没连到当前仓库。

---

## 6. 最常用日志命令

### 6.1 清空旧日志

```bash
adb logcat -c
```

建议每次开始新的问题排查前先清一次。

### 6.2 看语音主链路日志

```bash
adb logcat | rg "voice-assistant|s2s|capture health|StartSession|StartConnection|assistant audio|assistant text|turn finalized|idle timeout"
```

### 6.3 看 NativeWind / 页面加载日志

```bash
adb logcat | rg "NativeWind verifyInstallation|verifyInstallation failed|ReactNativeJS"
```

### 6.4 只看最近一次结果

```bash
adb logcat -d | rg "voice-assistant|s2s|NativeWind verifyInstallation" | tail -n 120
```

### 6.5 远程日志采集（推荐，免 ADB 翻日志）

目标：让手机把结构化日志（含 `traceId/sessionId/turnId`）直接发到你电脑，落地为文件，后续可直接在仓库里分析。

1. 在电脑启动采集器：

```bash
cd /Users/david/Documents/github/my-doubao2
pnpm run log:collector
```

启动后会打印局域网地址，例如：

```text
[collector] phone endpoint: http://192.168.1.23:7357/ingest
```

2. 在 `.env` 里配置手机上报地址（使用你电脑的局域网 IP）：

```bash
EXPO_PUBLIC_DEBUG_LOG_SINK_URL=http://192.168.1.23:7357/ingest
EXPO_PUBLIC_DEBUG_DEVICE_LABEL=david-android
EXPO_PUBLIC_DEBUG_LOG_BATCH_SIZE=20
EXPO_PUBLIC_DEBUG_LOG_FLUSH_MS=800
EXPO_PUBLIC_DEBUG_LOG_MAX_QUEUE=2000
```

3. 重启 Metro + App 后生效。采集文件默认在：

```text
logs/voice-assistant-remote.ndjson
```

4. 常用查看命令：

```bash
tail -f logs/voice-assistant-remote.ndjson
```

按 traceId 过滤：

```bash
rg "\"traceId\":\"va-" logs/voice-assistant-remote.ndjson
```

---

## 7. 语音调试时应该怎么操作

### 7.1 正常流程

1. 打开语音页
2. 点 `开始通话`
3. 连续说一句完整的话
4. **说完后不要立刻点挂断**
5. 安静等大约 `2 秒`
6. 观察是否收到模型回复

### 7.2 很重要：`挂断通话` 不是“发送这一轮”

在当前实时语音实现里：

- `开始通话` = 打开持续音频上行
- `挂断通话` = 结束整个实时会话

所以如果你说完立刻点 `挂断通话`，很可能会把服务端还没来得及返回的这一轮直接切断。

### 7.3 当前回合结束依赖什么

当前实时语音主链路依赖服务端 VAD，核心参数是：

- `end_smooth_window_ms = 1500`

也就是说：

- 你停下来后，服务端大概需要 `1.5s` 左右确认“你说完了”
- 再开始回文本/语音

---

## 8. 常见问题与处理

### 8.1 页面没更新 / 看起来还是旧版本

先做这两件事：

```bash
pnpm exec expo start --dev-client --clear --port 8081
adb shell am start -a android.intent.action.VIEW -d 'exp+my-doubao2://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
```

根因通常是：

1. Metro 缓存没清
2. Dev Client 连到了别的仓库

### 8.2 App 黑屏 / 白屏

先确认是不是 Router / bundle 问题：

```bash
adb logcat -d | rg "ReactNativeJS|expo-router|NativeWind|Error"
```

再确认 Metro 是否真的活着：

```bash
lsof -i tcp:8081
```

### 8.3 没有麦克风输入

按顺序检查：

1. 模拟器 `Extended controls > Microphone > Host audio input`
2. 执行：

```bash
adb emu avd hostmicon
```

3. App 是否已有 `RECORD_AUDIO` 权限
4. macOS 是否允许模拟器相关进程使用麦克风

### 8.4 语音一直上行，但 LLM 不回

先看日志：

```bash
adb logcat -d | rg "capture health|s2s upstream audio|s2s downstream audio|turn finalized|idle timeout" | tail -n 120
```

判断逻辑：

1. 如果有 `capture health` 和 `s2s upstream audio`
   - 说明本地录音和上行都在跑

2. 但没有 `s2s downstream audio` / `turn finalized`
   - 说明服务端没有把这一轮收口
   - 常见原因是底噪 / 模拟器 VAD 不稳定

3. 如果出现 `DialogAudioIdleTimeoutError`
   - 说明这一轮太久没形成有效结束，服务端超时了

### 8.5 文字能发，语音不行

这通常说明：

1. WebSocket / S2S 连接没挂
2. 问题主要在音频采集、VAD、模拟器麦克风链路

这时候优先不要怀疑整个项目都坏了。

### 8.6 语音播报有声音，但聊天列表没有对应 assistant 文本

这是语音回合并发抢占的典型现象：

1. 第一轮回复已经开始播报（你能听到声音）
2. 但在落库前被第二轮抢占（generation preemption）
3. 若实现没有“抢占前持久化”，就会出现“听到了，但列表没这条”

当前仓库口径（已修复）：

- 语音回合中，已生成的 assistant 文本片段必须“可用即落库”
- 即使发生抢占或中途异常，也要写入会话消息，避免用户侧状态不一致

排查命令：

```bash
adb logcat -d | rg "voice-assistant|custom llm voice round failed|android dialog event|asr_final|chat_final" | tail -n 200
```

若仍复现，优先核对是否跑在最新 JS bundle（`expo start --dev-client --clear --port 8081` 后重新进入 App）。

---

## 9. 调试时建议开几个终端

### 终端 A：Metro

```bash
cd /Users/david/Documents/github/my-doubao2
pnpm exec expo start --dev-client --clear --port 8081
```

### 终端 B：日志

```bash
cd /Users/david/Documents/github/my-doubao2
adb logcat | rg "voice-assistant|s2s|NativeWind verifyInstallation|capture health|turn finalized"
```

### 终端 C：控制命令

例如：

```bash
adb shell am start -a android.intent.action.VIEW -d 'exp+my-doubao2://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
```

或：

```bash
CI=0 pnpm run android:run
```

---

## 10. 什么时候必须重建原生，什么时候不用

### 不用重建原生的情况

- 改 JS / TS 逻辑
- 改页面样式
- 改文案
- 改大部分 feature runtime / service / ui 代码

这时一般只需要：

```bash
pnpm exec expo start --dev-client --clear --port 8081
adb shell am start -a android.intent.action.VIEW -d 'exp+my-doubao2://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
```

### 需要重建原生的情况

- 改 `app.json` 插件配置
- 改 Android 包权限
- 接新的原生模块
- 变更 `expo prebuild` 会影响到的内容

这时用：

```bash
CI=0 pnpm run android:run
```

---

## 11. 当前项目下，我建议你记住的最小命令集

### 启动模拟器

```bash
~/Library/Android/sdk/emulator/emulator -avd Pixel_3a_API_33_arm64-v8a -no-snapshot-load
```

### 打开宿主麦克风

```bash
adb emu avd hostmicon
```

### 启动当前项目 Metro

```bash
cd /Users/david/Documents/github/my-doubao2
pnpm exec expo start --dev-client --clear --port 8081
```

### 首次安装 / 原生重建

```bash
cd /Users/david/Documents/github/my-doubao2
CI=0 pnpm run android:run
```

### 强制打开当前项目

```bash
adb shell am start -a android.intent.action.VIEW -d 'exp+my-doubao2://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'
```

### 看语音日志

```bash
adb logcat | rg "voice-assistant|s2s|capture health|turn finalized|idle timeout"
```

---

## 12. 当前阶段的现实建议

对于 `my-doubao2`：

1. **UI / 页面 / Router / 文本消息** 可以放心主要在模拟器调
2. **实时语音自动收口** 在模拟器上是“可以测，但不稳定”
3. 真正要验证“像打电话一样稳定对话”，最终还是要上真机

所以你看到“模拟器有时能回、有时不回”，先不要默认是代码完全坏了。  
很多时候是：

- 宿主麦克风
- 模拟器底噪
- 服务端 VAD 判停

这三件事共同影响的结果。

---

## 13. 自定义 LLM 路径验证（DeepSeek/OpenAI-compatible）

当前项目的文本回复已接入 `ReplyProvider`，支持用 `.env` 配置 openai-compatible 模型。

回复链路模式（必填）：

```env
# official_s2s: 官方稳定链路（Android Dialog SDK / S2S 自动回复）
# custom_llm: 自定义模型链路（openai-compatible 回复）
EXPO_PUBLIC_REPLY_CHAIN_MODE=custom_llm
```

最小配置示例：

```env
EXPO_PUBLIC_LLM_BASE_URL=https://api.deepseek.com/v1
EXPO_PUBLIC_LLM_API_KEY=sk-xxxx
EXPO_PUBLIC_LLM_MODEL=deepseek-chat
EXPO_PUBLIC_LLM_PROVIDER=deepseek
```

重启 Metro（确保新 env 生效）：

```bash
pnpm exec expo start -c
```

在 App 内验证是否走自定义 LLM：

1. 发送一条文本消息；
2. 查看会话页的连接提示（`connectivityHint`）是否显示：
   - `回复来源：自定义LLM（<provider> / <model>）`

若没有该提示，说明仍在默认回复路径或环境变量未生效，优先检查：

1. `EXPO_PUBLIC_LLM_*` 是否拼写正确；
2. `EXPO_PUBLIC_LLM_MODEL` 是否为供应商真实模型 ID（例如 DeepSeek 使用 `deepseek-chat`，不要写 `deepseek/deepseek-chat`）；
3. 是否已经完全重启过 Expo 进程。

模式建议：

1. 追求最稳表现：`EXPO_PUBLIC_REPLY_CHAIN_MODE=official_s2s`
2. 需要自定义模型：`EXPO_PUBLIC_REPLY_CHAIN_MODE=custom_llm`

---

## 14. 模式矩阵（最终口径）

本节是当前仓库的统一语义，避免“同一个模式下链路混用”。

### 14.1 `official_s2s`（非自定义 LLM）

聊天模式（文字）：

- 用户输入文本 -> Android Dialog/S2S 文本链路（`sendTextQuery`）-> 服务端 `chat_partial/chat_final` -> 前端消息列表
- 默认不主动自动朗读（除非后续单独加“文本自动播报”产品开关）

语音模式：

- 官方一体化链路：ASR + LLM + TTS 都在 S2S/Dialog SDK 内完成
- 插话打断、静音/恢复、会话生命周期都走官方能力

### 14.2 `custom_llm`（自定义模型）

聊天模式（文字）：

- 用户输入文本 -> `ReplyProvider(OpenAI-compatible)` -> 文本消息渲染
- 不播放语音

语音模式：

- 先识别用户语音得到文本（ASR）
- 回复文本来自自定义 LLM（`ReplyProvider`）
- 助手播报必须优先走 S2S voice（Android Dialog `client-triggered tts`）
- Android 引擎初始化必须使用 `DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`；否则 `useClientTriggeredTts` / `ChatTtsText` 指令可能报 `400060` 并回落官方默认回复音频
- 每轮在 `asr_start` 阶段选择 `useClientTriggeredTts`，`session_ready` 只做会话就绪标记
- 每轮在 `asr_start` 重新设置 client-triggered TTS；`voice_round` 阶段避免重复切换，防止 `400061` 导致误判不可播
- 若 S2S voice 切换失败（如 400060），本轮仍必须保留 custom LLM 文本落库；并优先打断官方播报，避免用户听到“官方脑子”的回复
- 若本轮 S2S voice 未能接管，仅保留 custom LLM 文本落库并提示“语音播报未就绪”；不走本地 TTS
- `custom_llm` 下自动插话打断以有效 `asr_partial` 为准；`asr_start` 噪声不应直接触发打断（否则容易出现等待回话阶段 UI 闪烁）
- 若 `useClientTriggeredTts` 返回 `400061`，按“已处于 client-triggered 模式”处理，不应将本轮误判为不可播音

排障判据（重要）：

- `asr_start` 后应尽快看到 `Get directive: 4000`（切到 client-triggered TTS）
- 若只看到 `1000/2001`（start/stop）且出现 `351/359`（平台 chat 回复），说明本轮仍是官方回复链路，custom LLM 未接管成功
- 若出现 `Get message event: 350` 且 `tts_type: \"default\"`，说明正在播放官方默认音频；custom 语音接管失败
- 此时优先检查：
  1. Native prepare 是否设置 `PARAMS_KEY_DIALOG_WORK_MODE_INT = DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`
  2. JS 侧是否收到并处理了 `asr_start`
  3. `useClientTriggeredTts` 是否报 `400060`（常见于模式未切到 delegate）或 `400061`（通常表示已在 client 模式）
  4. `asr_final` 后是否真正进入 `runAndroidReplyFlow` 并落库 custom 文本
  5. `interruptCurrentDialog` 是否返回 `Directive unsupported`（该情况下不能依赖中途打断补救，需前置保证 delegate + client-triggered 生效）

### 14.3 为什么这样分

- `official_s2s`：追求端到端稳定和官方完整能力
- `custom_llm`：允许替换“内容大脑”，但不放弃 S2S 的 voice 能力（音色/可控性）

---

## 15. 事件时序判据（Phase 0 固化）

本节用于“1 次 logcat 复盘”时快速判定链路是否健康。

### 15.1 单轮健康链路（official_s2s + voice）

期望关键序列（允许中间穿插 debug 日志）：

1. `dialog.event type=engine_start`
2. `dialog.event type=session_ready`
3. `dialog.event type=asr_start`
4. `dialog.event type=asr_partial`（可重复）
5. `dialog.event type=asr_final`
6. `dialog.event type=chat_partial`（可重复）
7. `dialog.event type=chat_final`
8. 最终回到 listening（`voiceRuntimeHint=正在听你说`）

超时判据（经验值）：

- `engine_start -> session_ready`：建议 `< 2s`。
- `asr_final -> first chat_partial`：建议 `< 4s`（网络波动可放宽到 `< 6s`）。
- `chat_final -> listening`：建议 `< 1s`。

### 15.2 单轮健康链路（custom_llm + voice）

期望关键序列：

1. `dialog.event type=engine_start`
2. `dialog.event type=session_ready`
3. `dialog.event type=asr_start`
4. `custom llm client tts enabled` 或 `custom llm client tts already enabled`
5. `dialog.event type=asr_final`
6. `custom llm voice round started`
7. `streamClientTtsText` 连续发送（start/content/end）
8. assistant 文本落库，回到 listening

异常判据：

- 出现 `custom llm voice setup failed: cannot enable client tts` 且后续无播音：属于 F2 分叉。
- custom 模式下出现 `dialog.leak_guard platform chat_partial/chat_final ...`：属于 F3 分叉（平台泄漏）。

### 15.3 推荐抓取命令

优先使用一键诊断（支持“设备在线自动同步 + 设备离线用本地归档继续分析”）：

```bash
pnpm run voice:diag
```

输出：

- 归档目录：`tmp/voice-log-archive/`
- 报告目录：`tmp/voice-log-reports/`
- 报告内容：用户 ASR final、默认/自定义回复文本、关键事件时间线、基础异常判定
- 自动清理：默认最多保留 `40` 份归档日志、`80` 份诊断报告

设备离线时可直接分析归档，不需要手机保持连接：

```bash
pnpm run voice:diag -- --no-sync
```

指定历史日志文件分析：

```bash
pnpm run voice:diag -- --file tmp/voice-log-archive/speech_sdk_xxx.log
```

---

如果需要手动 logcat 兜底，再使用下面命令。

先清理旧日志：

```bash
adb logcat -c
```

复现场景后抓取：

```bash
adb logcat -d | rg "dialog.event|dialog.stale_drop|custom llm|voice-assistant|RNDialogEngine" | tail -n 400
```

如果只想看契约字段：

```bash
adb logcat -d | rg "traceId=|questionId=|replyId=|sessionEpoch=|sessionId=|turnId=|replyChain=|replyOwner=|phase=" | tail -n 200
```

说明：

- `traceId` 是业务回合主键（runtime 保证每轮存在）。
- `questionId/replyId` 是 SDK 侧关联键（来自 payload，可能在部分事件缺失）。

### 15.4 快速判定表

- 看不到 `session_ready`：会话未就绪，先查 prepare/start 与 Native 初始化。
- `asr_final` 已到但无 `chat_*`/custom round：回合卡在 reply 启动。
- custom 下频繁 `400060`：delegate/workMode 或时序问题。
- custom 下收到平台 `chat_*`：leak guard 在工作，但需要排查为何未接管。
- 多个 sessionId 交叉：优先看 `dialog.stale_drop` 是否生效。

### 15.5 签名化故障提示（新增）

当前 runtime 的关键失败提示统一为：

- `connectivityHint = [<SIGNATURE>] <message>`

示例：

- `[F2_CLIENT_TTS_NOT_READY] 本轮自定义语音接管失败，已回到监听状态。`
- `[F7_TEXT_ROUND_FAILED] 本轮文本对话失败，请检查网络后重试。(sdk send failed)`

建议排查顺序：

1. 先按签名聚类（同签名通常同根因族）。
2. 再按 message 中的动态错误（如 SDK/网络文案）做二次定位。

快速过滤命令：

```bash
adb logcat -d | rg "F2_CLIENT_TTS_NOT_READY|F3_PLATFORM_LEAK_IN_CUSTOM|F7_TEXT_ROUND_FAILED|F8_REPLY_CHAIN_CONFIG_INCOMPLETE|F9_ANDROID_CALL_START_FAILED|F10_ANDROID_DIALOG_RUNTIME_ERROR|F11_CUSTOM_REPLY_ROUND_FAILED"
```

关联文档：

- 事件/指令契约：`docs/references/dialog-sdk-event-contract.md`
- 故障签名手册：`docs/references/voice-fault-signatures.md`
