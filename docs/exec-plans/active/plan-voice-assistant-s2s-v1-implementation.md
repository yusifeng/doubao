# Plan: Voice Assistant S2S V1 Implementation

## 计划信息

- Plan ID: `plan-voice-assistant-s2s-v1-implementation`
- 状态: `active`
- 创建日期: `2026-03-24`
- 负责人: `agent`

## 输入文档

- Product Spec: `docs/product-specs/voice-assistant-s2s-v1.md`
- Design Doc: `docs/design-docs/voice-assistant-s2s-v1-design.md`

## 目标

在 Android 优先前提下，交付可演示的 V1 语音对话助手主链路：

- 对话列表页
- 会话详情页
- 语音会话页（免长按）
- S2S 实时对话（listen/think/speak 状态可见）

## 范围

### In Scope

- 建立 `voice-assistant` feature 分层目录与基础骨架。
- 落地 Provider 契约（Storage/S2S/Audio/Observability）。
- 打通文本链路（先可用）。
- 接入语音输入与语音播报链路。
- 最小会话持久化（SQLite）。
- 基础错误恢复与重试。
- 最小测试覆盖（状态机与关键渲染）。
- 建立样式 Tokenizer Design，并在核心页面落地 token 化样式。

### Out of Scope

- 联网检索、外部 RAG、角色市场。
- 多端同步与账号体系。
- 服务端中转（本期保持直连，作为 V2）。

## 里程碑拆解

1. **M1 - Feature Skeleton**
   - 新建 `src/features/voice-assistant/{types,config,repo,service,runtime,ui}`。
   - 接入 App 入口路由/页面占位。
2. **M2 - Provider Contracts**
   - 定义四类 Provider 契约及空实现。
   - 在组合根完成注入。
3. **M2.5 - Style Tokenizer Foundation**
   - 建立 token 模块（颜色、排版、间距、圆角）。
   - 在语音主页面先完成 token 化映射，避免硬编码视觉值。
4. **M3 - Text-first Pipeline**
   - 打通文本发问/回复消息流与会话列表。
   - 状态机最小闭环：`idle -> thinking -> speaking/idle`。
5. **M4 - Voice Pipeline**
   - 默认接入稳定语音链路（ASR -> 文本 S2S -> TTS）。
   - 保留实时音频分帧链路作为 feature flag（`realtime_audio`）实验路径。
   - 状态机完整闭环：`idle/listening/thinking/speaking/error`。
6. **M5 - Persistence + Reliability**
   - SQLite 持久化会话与消息。
   - 错误提示、重试、断线恢复最小能力。
7. **M6 - Test & Polish**
   - 关键单测/组件测试、基本验收脚本、文档回填。

## 当前进度

- [x] M1 - Feature Skeleton
- [~] M2 - Provider Contracts（契约已定义，组合根注入待在 M3 一并接入）
- [x] M2.5 - Style Tokenizer Foundation
- [x] M3 - Text-first Pipeline
- [x] M4 - Voice Pipeline
- [ ] M5 - Persistence + Reliability
- [~] M6 - Test & Polish（实时链路优化、UI 同款对齐、回归测试持续推进中）

## 验收标准

- Android 上可完成至少 5 轮连续语音对话。
- 用户无需长按即可发起语音输入。
- UI 可明确展示 `listening/thinking/speaking/error`。
- 会话列表可回看历史，失败可重试。
- `pnpm run test` 通过。
- 核心页面（语音页/会话页）视觉值优先来自统一 token。

## 风险与缓解

- 音频链路复杂：先文本链路后语音链路，分阶段收敛。
- 外部网络不稳定：明确重试与错误提示，不阻断历史会话浏览。
- 直连安全边界：V1 标注风险并预留 V2 中转演进位。
- 样式漂移风险：通过 token 模块集中收敛视觉语义，减少散落 class 漂移。

## 决策日志（初始）

- V1 采用 Android 优先与免长按交互。
- V1 采用 S2S 直连；V2 再迁移服务端中转。
- 会话与消息持久化优先 SQLite。
- V1 引入样式 Tokenizer Design，先覆盖核心页面并逐步替换历史硬编码。
- 2026-03-24：语音主链路切换为稳定优先（本机 ASR + 文本 query + 本机 TTS），实时 PCM 方案降级为可切换实验路径。
- 2026-03-24：S2S 协议层改为事件驱动解析（含 gzip 解压），文本响应改为按 turn 结束事件聚合流式分片，修复“仅返回首字”问题。
- 2026-03-24：开始执行“Realtime Voice Code Optimization”阶段，重点收敛实时通话生命周期、S2S turn state、短句去重、UI 同款对齐与回归测试。
