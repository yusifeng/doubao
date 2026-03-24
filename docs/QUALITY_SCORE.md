# Quality Score

当前采用轻量评分，用于跟踪 Docs First 阶段质量演进。

## 评分维度（A/B/C）

- 架构清晰度：B（已建立入口，分层细节待补齐）
- 测试覆盖：B（核心组件已测，业务路径不足）
- 文档完备度：B（骨架已建，内容正在填充）
- 可维护性：B（约定明确，机械门禁待下一阶段）

## 近期改进

- 完成 `AGENTS -> ARCHITECTURE -> docs/index -> exec-plans` 导航闭环。
- 维持 `pnpm run test` 通过作为最低验收线。
