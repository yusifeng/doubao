# Plan: RN Harness Docs First

## 计划信息

- Plan ID: `plan-rn-harness-docs-first`
- 状态: `completed`
- 创建日期: `2026-03-24`
- 完成日期: `2026-03-24`
- 负责人: `agent`

## 背景

当前仓库已具备基础 RN 可运行能力，但缺少 agent-first 的知识导航与执行计划生命周期管理。为降低上下文漂移风险，先落地 Docs First 模式。

## 范围

### In Scope

- 将 `AGENTS.md` 重构为 TOC 入口。
- 建立 `docs/` 骨架与主索引。
- 补充架构与前端约定文档。
- 建立执行计划目录与首个 active plan。

### Out of Scope

- 自定义校验脚本与 CI 门禁。
- 大规模代码重构或目录迁移。

## 验收结果

- [x] 仓库形成 `AGENTS -> ARCHITECTURE -> docs/index -> exec-plans` 导航闭环。
- [x] `docs/PLANS.md` 可准确指向 active/completed 计划。
- [x] 文档更新后 `pnpm run test` 通过。

## 进度记录

- [x] Step 1: AGENTS 收敛为 TOC。
- [x] Step 2: docs 骨架与索引完成。
- [x] Step 3: 架构与前端约定文档完成。
- [x] Step 4: active/completed 生命周期目录建立并投放首个计划。

## 决策记录

- 采用 Docs First 渐进策略：先文档，再机械门禁。
- 采用严格 agent-first 运行方式，但保留人工验收与决策。

## 经验总结

- 先建立知识入口与计划生命周期，再推进功能实现，可显著降低上下文漂移。
- `AGENTS` 保持短小且做 TOC，比堆规则更利于 agent 执行。
