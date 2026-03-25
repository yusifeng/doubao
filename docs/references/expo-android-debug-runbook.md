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
