<span id="ace64e82"></span>

# 集成指南

<span id="ef81a2dc"></span>

## SDK 简介

Dialog语音对话 SDK 是基于豆包端到端实时语音大模型，使用设备自身的录音机与播放器，提供低延迟、双向流式语音交互能力，可用于构建语音到语音的对话工具。
<span id="883ad289"></span>

## SDK版本

Android: com.bytedance.speechengine:speechengine_tob:[0.0.14.1](http://0.0.14.1/)\-bugfix
iOS: pod 'SpeechEngineToB', '[0.0.14.1](http://0.0.14.1/)\-bugfix'
注：0.0.14版本开始SDK不再依赖TTNet，但Android依赖okhttp，iOS 依赖 SocketRocket。变更后依赖示例如下：
Android:
0.0.14及之后版本

```Java
// Speech Engine
implementation 'com.bytedance.speechengine:speechengine_tob:0.0.14'
// Net  okhttp:4.9.1为默认依赖的网络库版本，若有其它版本需要，可引用相应okhttp版本
implementation("com.squareup.okhttp3:okhttp:4.9.1")
```

0.0.14之前版本

```C++
implementation 'com.bytedance.boringssl.so:boringssl-so:1.3.7-16kb'
implementation('org.chromium.net:cronet:4.2.210.4-tob') {
    exclude group: 'com.bytedance.common', module: 'wschannel'
}
implementation 'com.bytedance.frameworks.baselib:ttnet:4.2.210.4-tob'
```

iOS:
0.0.14及之后版本

```Ruby
# Net  0.6.1为默认依赖的网络库版本，若有其它版本需要，可引用相应SocketRocket版本
pod 'SocketRocket', '0.6.1'
```

0.0.14之前版本

```C++
pod 'TTNetworkManager', '4.2.210.20'
```

<span id="f3820fad"></span>

## Maven仓库

```Plain Text
maven {
    url "https://artifact.bytedance.com/repository/Volcengine/"
}
```

<span id="89b64b06"></span>

## 组件依赖

```Plain Text
// Network
implementation 'com.bytedance.boringssl.so:boringssl-so:{LATEST_VERSION}'
implementation('org.chromium.net:cronet:{LATEST_VERSION}') {
    exclude group: 'com.bytedance.common', module: 'wschannel'
}
implementation 'com.bytedance.frameworks.baselib:ttnet:{LATEST_VERSION}'

// Speech Engine
implementation 'com.bytedance.speechengine:speechengine_tob:{LATEST_VERSION}'
```

<span id="b792c110"></span>

## 兼容性

| | | \
|**类别** |**兼容范围** |
|---|---|
| | | \
|系统 |最低支持Android 4.4 以上版本，API LEVEL 19 |
| | | \
|架构 |armeabi-v7a，arm64-v8a |
| | | \
|网络 |支持移动数据与 WiFi 两种网络环境 |

<span id="ace0cf29"></span>

## AndroidManifest.xml 文件

```Plain Text
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

<span id="cf267a2d"></span>

## 混淆规则

```Plain Text
-keep class com.bytedance.speech.speechengine.SpeechEngineImpl {*;}
```

<span id="4adaf1a9"></span>

## 回声消除 AEC

Dialog 语音对话过程中，如果既启用录音机，又启用播放器，则设备会录入播放的人声而影响对话。故Dialog SDK 内置 AEC能力，对回声进行消除处理。但需要开启AEC功能，并配置AEC模型文件路径。
特别的，在自定义输入音频或自定义输出音频场景，如果能确保输入音频没有回声，可以选择关闭AEC。如果不能，则需要自行保证输出音频和输入回声所处的时间位置一致，以便AEC进行处理。
（当前硬件AEC为强制开启，故可能存在可能关闭Dialog SDK内置AEC之后，硬件AEC继续生效不会自打断。主要原因是为了设备当前有其它APP存在播放的声音时，该声音Dialog SDK内置AEC消除不掉，故强制开启硬件AEC 作为保底。）
AEC 模型版本如下：
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/f2d02bbec78b4da0a140beef3a6dc23c~tplv-goo7wpa0wc-image.image" name="aec.model" ></Attachment>
<span id="7892829c"></span>

# 调用流程

<span id="6590b854"></span>

## 初始化环境依赖

创建语音对话 SDK 引擎实例前调用，完成网络环境等相关依赖配置。APP 生命周期内仅需执行一次。

```Kotlin
SpeechEngineGenerator.PrepareEnvironment(getApplicationContext(), getApplication());
```

<span id="cc9a4fcf"></span>

## 创建引擎实例

```Kotlin
SpeechEngine engine = SpeechEngineGenerator.getInstance();
engine.createEngine();
```

<span id="ac8ab830"></span>

## 参数配置

其中 APPID 、TOKEN 获取方式参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F) ，RESOURCE ID 设置为 `volc.speech.dialog`。

```Java
//【必需配置】Engine Name
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.DIALOG_ENGINE);

//【可选配置】本地日志文件路径，SDK会在该路径文件夹下生成名为 speech_sdk.log 的日志文件，开发时设置，线上关闭。
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, "已存在的文件夹路径，或者空字符串");
//【可选配置】日志级别，开发时设置为 TRACE（最低级别），线上设置 WARN；
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE);

//【必需配置】鉴权相关：Appid
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, "APPID");
//【必需配置】鉴权相关：AppKey
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_KEY_STRING, "APPKEY");
//【必需配置】鉴权相关：Token
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, "ACCESS TOKEN");
//【必需配置】对话服务资源信息ResourceId
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RESOURCE_ID_STRING, "RESOURCE ID");
//【必需配置】User ID（用以辅助定位线上用户问题，如无法提供可提供固定字符串）
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, "UID");
//【必需配置】对话服务域名
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_ADDRESS_STRING, "wss://openspeech.bytedance.com");
//【必需配置】对话服务Uri
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_URI_STRING, "/api/v3/realtime/dialogue");
// AEC
//【可选配置】是否开启AEC，默认不开启，同时启用设备录音和播放时必须开启
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_AEC_BOOL, true);
//【可选配置】AEC模型路径，开启AEC时必填
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_AEC_MODEL_PATH_STRING, "AEC 模型文件路径，路径需包含文件名，示例：/xxx/xxx/aec.model");

// 输入音频 & 录音机
//【可选配置】配置音频来源，默认使用设备麦克风录音（Dialog 仅支持 RECORDER 和 STREAM 模式，RECORDER表示设备麦克风录音，STREAM表示自定义音频输入）
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, SpeechEngineDefines.RECORDER_TYPE_RECORDER);
//【可选配置】录音文件保存路径，如不为空字符串，则SDK会将录音机音频保存到该路径下，文件格式为 .wav
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_RECORDER_PATH_STRING, "已存在的文件夹路径，或者空字符串");
//【可选配置】启用录音机音频回调，开启后录音音频数据将通过MESSAGE_TYPE_DIALOG_RECORDER_AUDIO消息回调，默认不启用
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_RECORDER_AUDIO_CALLBACK_BOOL, false);

// 输出音频 & 播放器
//【可选配置】是否开启播放器，默认开启
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_PLAYER_BOOL, true);
//【可选配置】启用播放器音频回调，默认不启用（为当前正在播放的音频数据，会随着播放进度回调）
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_PLAYER_AUDIO_CALLBACK_BOOL, false);
//【可选配置】启用解码后原始音频回调，默认不启用（为解码后的需要播报的数据，会在解码完成后立刻回调，不等待播放进度）
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_DECODER_AUDIO_CALLBACK_BOOL, false);
//【可选配置】播放文件保存路径，如不为空字符串，则SDK会将播放器音频保存到该路径下，文件格式为 .wav
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_PLAYER_PATH_STRING, "已存在的文件夹路径，或者空字符串");
```

<span id="07354fcc"></span>

## 初始化引擎实例

初始化引擎对象并设置回调监听。

```Java
// 初始化引擎实例
int ret = engine.initEngine();
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "初始化失败，返回值: " + ret);
    return;
}
engine.setContext(getApplicationContext());
engine.setListener(this);
```

<span id="c97d955e"></span>

## 发送指令

语音对话 SDK 通过发送指令接口 `sendDirective` 触发各种操作，需要注意不建议在 SDK 的回调线程中调用该接口。
<span id="a3a105ae"></span>

### 启动引擎

启动引擎的传参，请参考[端到端实时语音大模型API接入文档](https://www.volcengine.com/docs/6561/1594356#%E5%AE%A2%E6%88%B7%E7%AB%AF%E4%BA%8B%E4%BB%B6)中 客户端事件 -> StartSession 的参数说明。

```Java
// 注意这里先调用同步停止，避免SDK内部异步线程带来的问题
engine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
// 启动Dialog引擎
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, "{\"dialog\":{\"bot_name\":\"豆包\"}}");
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "启动失败，返回值: " + ret);
    return;
}
```

<span id="8bf028da"></span>

### 播报开场白

播报开场白的传参，请参考[端到端实时语音大模型API接入文档](https://www.volcengine.com/docs/6561/1594356#%E5%AE%A2%E6%88%B7%E7%AB%AF%E4%BA%8B%E4%BB%B6)中 客户端事件 -> SayHello 的参数说明。

```Java
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_SAY_HELLO, "{\"content\": \"我是你的AI助手，请问有什么可以帮你。\"}");
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "播报开场白失败，返回值: " + ret);
    return;
}
```

<span id="c5445277"></span>

### 自定义TTS ：使用自定义文本回复

仅开启`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`模式时可用：开启`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`模式后，每轮TTS回复都需要选择 **自定义文本回复** 或 **默认文本回复** ，否则将不会进行TTS播报。
**自定义文本回复**：播报自定义的文本内容，会替换Dialog 助手自动回复的文本。
**自定义文本回复**的传参，请参考[端到端实时语音大模型API接入文档](https://www.volcengine.com/docs/6561/1594356#%E5%AE%A2%E6%88%B7%E7%AB%AF%E4%BA%8B%E4%BB%B6)中 客户端事件 -> ChatTTSText 的参数说明。

```objectivec
// 初始化前，设置参数开启 DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT 模式
engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_DIALOG_WORK_MODE_INT, SpeechEngineDefines.DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT);

// ... 初始化引擎实例 ...

// ... 启动引擎 ...

// ... 接收到 MESSAGE_TYPE_DIALOG_ASR_ENDED 事件。标志用户已经说完一句话，等待回复 ...

// Directive：发送ChatTtsText指令以播放自定义回复文本，可以流式不断补充文本内容。首包需要包含start:true，end:false 。
String chatTtsTextJson = "{\"start\": true, \"content\": \"这里是自定义回复内容\", \"end\": false}";
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_CHAT_TTS_TEXT, chatTtsTextJson);
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "自定义TTS回复失败: " + ret);
    return;
}
// Directive：发送ChatTtsText指令以播放自定义回复文本，可以流式不断补充文本内容。尾包需要包含start:false，end:true 。
chatTtsTextJson = "{\"start\": false, \"content\": \"\", \"end\": true}";
ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_CHAT_TTS_TEXT, chatTtsTextJson);
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "自定义TTS回复失败: " + ret);
    return;
}
```

<span id="962120dd"></span>

### 自定义TTS ：使用默认文本回复

仅开启`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`模式时可用：开启`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`模式后，每轮对话都需要选择使用 **客户端指定的TTS回复** 或 **服务自动生成的TTS回复**，否则将不会进行TTS播报。
**客户端指定的TTS回复**：回复内容都是通过主动调用 SDK发送指令 接口触发的，包含以下类型：

- SayHello 指令触发的开场白音频，对应 tts_type 为 chat_tts_text。
- ChatTtsText 指令触发的指定文本回复，对应 tts_type 为 chat_tts_text。
- ChatRagText 指令触发的外部RAG总结回复，对应 tts_type 为 external_rag。

```objectivec
// 初始化前，设置参数开启 DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT 模式
engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_DIALOG_WORK_MODE_INT, SpeechEngineDefines.DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT);

// ... 初始化引擎实例 ...

// ... 启动引擎 ...

// ... 接收到 MESSAGE_TYPE_DIALOG_ASR_INFO 事件。标志一轮对话开始 ...

// Directive：发送UseClientTriggerTts指令，本轮对话将播放Dialog客户端指定的TTS回复。
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_USE_CLIENT_TRIGGER_TTS, "");
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "播放客户端指定的TTS回复失败: " + ret);
    return;
}
```

<span id="704d562c"></span>

### 自定义TTS：播放服务自动生成的TTS回复

仅开启`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`模式时可用：开启`DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT`模式后，每轮TTS回复都需要选择 **客户端指定的TTS回复** 或 **服务自动生成的TTS回复**，否则将不会进行TTS播报。
**服务自动生成的TTS回复**：不需要主动调用SDK接口，服务会自动生成下发，包含以下类型：

- 闲聊，即默认TTS回复，对应 tts_type 为 default。
- 安全审核音频，对应 tts_type 为 audit_content_risky。
- 内置联网音频，对应 tts_type 为 network。

```objectivec
// 初始化前，设置参数开启 DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT 模式
engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_DIALOG_WORK_MODE_INT, SpeechEngineDefines.DIALOG_WORK_MODE_DELEGATE_CHAT_TTS_TEXT);

// ... 初始化引擎实例 ...

// ... 启动引擎 ...

// ... 接收到 MESSAGE_TYPE_DIALOG_ASR_INFO 事件。标志一轮对话开始 ...

// Directive：发送UseServerTriggerTts指令，本轮对话将播放Dialog服务自动生成的TTS回复音频。
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_DIALOG_USE_SERVER_TRIGGER_TTS, "");
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "播放服务自动生成的TTS回复失败: " + ret);
    return;
}
```

<span id="1bedb7dc"></span>

### 发送文本Query

Dialog 支持不通过语音，而是通过输出文本的方式，触发语音回复。传参请参考 [端到端实时语音大模型API接入文档--豆包语音-火山引擎](https://www.volcengine.com/docs/6561/1594356) 中 客户端事件 -> ChatTextQuery 的参数说明。

```Java
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_CHAT_TEXT_QUERY, "{\"content\": \"1+1等于几\"}");
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "文本Query失败，返回值: " + ret);
    return;
}
```

<span id="4075159c"></span>

### 发送 RAG Query

Dialog 支持输入外部RAG知识，通过模型的总结和口语化改写之后输出对应音频。传参和具体使用请参考 [端到端实时语音大模型API接入文档--豆包语音-火山引擎](https://www.volcengine.com/docs/6561/1594356) 中 客户端事件 -> ChatRAGText 的参数说明。

```Java
int ret = engine.sendDirective(SpeechEngineDefines.DIRECTIVE_EVENT_CHAT_RAG_TEXT, "{\"external_rag\":\"[{\\\"title\\\":\\\"Dialog语音SDK\\\",\\\"content\\\":\\\"Dialog语音对话 SDK 是基于豆包端到端实时语音大模型，使用设备自身的录音机与播放器，提供低延迟、双向流式语音交互能力，可用于构建语音到语音的对话工具。\\\"}]\"}");
if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
    Log.e(SpeechDemoDefines.TAG, "RAG Query失败，返回值: " + ret);
    return;
}
```

<span id="2740abca"></span>

### 自定义音频输入

Dialog 可以选择不使用系统录音机，而通过feedAudio接口，传入原始音频数据作为用户的输入音频。注意：

- 输入音频仅支持 PCM 16bit位深音频格式，且采样率需要为16k，通道数为1即单通道。
- 如果采样率不为16k，或者通道数不为1，可以开启SDK 内部重采样，SDK会自动重采为16k、单通道音频。

```Java
//【可选配置】配置音频来源，STREAM 模式表示使用自定义音频输入
engine.setOptionString(SpeechEngineDefines.PARAMS_KEY_RECORDER_TYPE_STRING, SpeechEngineDefines.RECORDER_TYPE_STREAM);
// 当输入音频采样率不为16k，或通道数不为1时，使用下述方式开启重采样
// 【可选配置】启用 SDK 内部的重采样，默认不启用。
// engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_ENABLE_RESAMPLER_BOOL, true);
// 【可选配置】设置为输入音频的实际采样率，这里以采样率44.1k 通道数2 为例，sdk内部会重采为采样率16k 通道1。
// engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_SAMPLE_RATE_INT, 44100);
// engine.setOptionInt(SpeechEngineDefines.PARAMS_KEY_CUSTOM_CHANNEL_INT, 2);

// ...
// 初始化引擎实例 并 发送指令-启动引擎
// ...

byte[] buffer = new byte[mBufferSize];
// ...
// 业务自行将音频读入到 buffer 中
// ...
int ret = engine.feedAudio(buffer, buffer.length);
if (ret != 0) {
    Log.e(SpeechDemoDefines.TAG, "Feed audio failed.");
    break;
}
```

<span id="5934b0e8"></span>

### 自定义音频输出

Dialog 可以关闭设备播放器，业务方通过回调拿到原始音频数据，再视需要进行使用。

- 播放器数据回调：即使关闭播放器，也会跟随现实时间播放进度，每100ms现实时间就回调100ms的音频数据。
- 解码器数据回调：不跟随现实时间，只要收到Dialog服务的音频数据并解码后，就立刻回调接收到的所有音频数据。

```Java
//【可选配置】是否开启播放器，默认开启，不使用设备播放器时需要关闭。
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_PLAYER_BOOL, false);
//【可选配置】启用播放器音频回调，默认不启用（为当前正在播放的音频数据，会随着播放进度回调）
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_PLAYER_AUDIO_CALLBACK_BOOL, true);
//【可选配置】启用解码后原始音频回调，默认不启用（为解码后的需要播报的数据，会在解码完成后立刻回调，不等待播放进度）
engine.setOptionBoolean(SpeechEngineDefines.PARAMS_KEY_DIALOG_ENABLE_DECODER_AUDIO_CALLBACK_BOOL, true);

// ...
// 初始化引擎实例 并 发送指令-启动引擎
// ...

// 消息回调中，对接收到的音频数据进行处理
@Override
public void onSpeechMessage(int type, byte[] data, int len) {
    switch (type) {
        case SpeechEngineDefines.MESSAGE_TYPE_PLAYER_AUDIO_DATA:
            // Callback: 播放器音频数据回调
            Log.e(SpeechDemoDefines.TAG, "Callback: 播放器音频数据回调: len: " + len);
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_DECODER_AUDIO_DATA:
            // Callback: 解码器音频数据回调
            Log.e(SpeechDemoDefines.TAG, "Callback: 解码器音频数据回调: len: " + len);
            break;
        default:
            break;
    }
}
```

<span id="a7ba44a0"></span>

### 停止引擎

```Java
// 会等待回调函数执行完成，不可在回调线程中执行。
engine.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "");
```

<span id="d9842ded"></span>

## 回调接收返回数据

启动引擎后，SDK会不断回调消息。其中Dialog类回调的消息内容，请参考[端到端实时语音大模型API接入文档](https://www.volcengine.com/docs/6561/1594356#%E6%9C%8D%E5%8A%A1%E7%AB%AF%E4%BA%8B%E4%BB%B6)中 服务事件 说明。

```Java
@Override
public void onSpeechMessage(int type, byte[] data, int len) {
    String strData = new String(data);
    switch (type) {
        case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START:
            // Callback: 引擎启动成功回调
            Log.i(SpeechDemoDefines.TAG, "Callback: 引擎启动成功: " + strData);
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP:
            // Callback: 引擎关闭回调，启动引擎成功后，此消息必定发生且为最后一个回调消息
            Log.i(SpeechDemoDefines.TAG, "Callback: 引擎关闭: " + strData);
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR:
            // Callback: 错误信息回调
            Log.e(SpeechDemoDefines.TAG, "Callback: 错误信息: " + type + " data: " + strData);
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_INFO:
            // Callback: ASR语音识别开始,用户开始说话
            Log.i(SpeechDemoDefines.TAG, "Callback: ASR 识别开始");
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_RESPONSE:
            // Callback: ASR语音识别结果回调
            Log.i(SpeechDemoDefines.TAG, "Callback: ASR 识别结果: " + strData);
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_ENDED:
            // Callback: ASR语音识别结束，用户停止说话
            Log.i(SpeechDemoDefines.TAG, "Callback: ASR 识别结束");
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_CHAT_RESPONSE:
            // Callback: Chat对话内容回调
            Log.i(SpeechDemoDefines.TAG, "Callback: Chat 回复内容: " + strData);
            break;
        case SpeechEngineDefines.MESSAGE_TYPE_DIALOG_CHAT_ENDED:
            // Callback: Chat回复结束
            Log.i(SpeechDemoDefines.TAG, "Callback: Chat 回复结束");
            break;
        default:
            break;
    }
}
```

<span id="ef858baf"></span>

## 销毁引擎实例

当不再需要语音对话后，建议对引擎实例进行销毁，释放内存资源。

```Java
// 内部会执行SYNC_STOP，不可在回调线程中执行。
engine.destroyEngine();
engine = null;
```

<span id="61f74f8b"></span>

# 示例工程

<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/68b14133682749d0bac4b8ba5ca616a7~tplv-goo7wpa0wc-image.image" name="SpeechDemoAndroid.zip" ></Attachment>
<span id="0e28fdb1"></span>

## 运行方法

1. 首先使用Android Studio 打开工程，修改 app/build.gradle 文件中的SDK依赖版本，并添加TTNet 依赖：

<div style="text-align: center"><img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/6a9774867579477991cdda84704df5ee~tplv-goo7wpa0wc-image.image" width="1868px" /></div>

2. 打开 app/src/main/java/com/bytedance/speech/speechdemo/utils/SensitiveDefines.java ，要运行语音对话功能，至少需修改下述内容：

其中 APPID 、APPKEY、TOKEN 获取方式参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)

<div style="text-align: center"><img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/4da14382c66c41cf8239db2734ee9820~tplv-goo7wpa0wc-image.image" width="1858px" /></div>

RESOURCE ID 设置为 `volc.speech.dialog`。

<div style="text-align: center"><img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/ee60beb2548546c4a4900569ae7dee43~tplv-goo7wpa0wc-image.image" width="2108px" /></div>

3. 连接Android真机，点击三角号执行demo 构建即可。

![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/bfda231c02d745cdb3595ff4c8d5655c~tplv-goo7wpa0wc-image.image =330x)

4. 选择 语音交互 -> 对话交互 进入Dialog 测试页，对应的页面代码文件为 app/src/main/java/com/bytedance/speech/speechdemo/DialogActivity.java 。

![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/48454f7a5d664fe7bdc9f4991796b5d7~tplv-goo7wpa0wc-image.image =184x)

5. 点击 Init Engine -> Start Engine 即可体验语音对话功能。
