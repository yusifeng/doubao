# AGENTS

本文件是仓库入口目录（TOC），不承载细节规范。详细规则以仓库文档为准。

## 项目意图

- 将当前 Expo RN 项目按 Harness engineering（Docs First）方式演进。
- 人类提供目标与验收标准，agent 负责实现、测试、文档同步。
- 仓库内文档是唯一事实来源；口头规则不视为长期约束。

## 优先阅读

- [README.md](./README.md)（若后续补充）：项目使用说明。
- [ARCHITECTURE.md](./ARCHITECTURE.md)：分层边界与依赖方向。
- [docs/index.md](./docs/index.md)：知识库入口。
- [docs/PLANS.md](./docs/PLANS.md)：执行计划总索引。

## 机械执行（本阶段为流程约束）

- 代码与文档同步：
  - 行为变化、架构约束变化，必须同步更新 docs。
- 测试优先：
  - 新增组件需配套 `*.test.tsx`。
  - 至少覆盖关键渲染与核心交互。
- 最佳实践：
  - 默认采用最佳实践实现；偏离时必须说明原因与影响。
- 包管理：
  - 使用 `pnpm`。
- 提交留痕（强制）：
  - 每次 `git commit` 前，必须先更新 `docs/commit-history.md`。
  - 记录本次改动摘要、影响范围、测试结果、风险与回滚点。
  - 未更新 `docs/commit-history.md` 不允许提交。

## 当前技术栈

- React Native: Expo SDK 55 + Expo Router + TypeScript
- UI: NativeWind
- 测试: Jest + React Native Testing Library

## 常用命令

- `pnpm run start`
- `pnpm run android`
- `pnpm run ios`
- `pnpm run web`
- `pnpm run test`
- `pnpm run test:coverage`

## 计划与文档导航

- 进行中计划：`docs/exec-plans/active/`
- 已完成计划：`docs/exec-plans/completed/`
- 设计文档：`docs/design-docs/`
- 产品规格：`docs/product-specs/`
- 参考资料：`docs/references/`

## 不确定时

1. 先读 `ARCHITECTURE.md` 与 `docs/index.md`。
2. 按 active exec-plan 执行，保持小步可验证改动。
3. 先补文档语义，再扩展实现细节。

## 沟通禁令

- 不要在答复结尾追加重复、低信息量的尾巴话术。
- 禁止使用类似“如果你愿意，我也可以……”“如果你要，我可以再……”这类可选项收尾，除非用户明确要求列下一步选项。
- 需要补充内容时，一次性讲完；不需要补充时，直接结束回答。

### Review Profile (Single Source of Truth)

- Review command: `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`
- Tool-call timeout for review: `timeout_ms >= 1200000`
- Apply this profile everywhere (skills/plans/docs). Do not redefine model/reasoning/timeout in other files.

- **Commit workflow (when user says “commit”)**: assume the user already ran `git add`. Do:
  - `git status --short` and `git diff --cached` (or `git diff --cached --stat`)
  - Generate a Conventional Commit message: `type(scope): summary` (≤72 chars, imperative)
  - Run `git commit -m "<message>"`
