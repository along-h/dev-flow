# Dev Flow 默认 Fast 与条件审查设计

## 目标

降低普通开发任务的固定治理成本：局部、可逆的 UI 与非 UI 任务默认走 Fast；Standard 只增加真实风险所需的技术治理；独立 Reviewer 由风险触发，不再是固定尾节点。

## 路由模型

- `direct-development`：清晰、机械、局部、可立即回滚的非 UI 修改。
- `fast`：默认开发路径，覆盖局部 UI、工作包内部组件/Hook/Mock 复用和确定性本地异步读取。
- `standard`：真实 API 契约、跨工作包共享契约、全局 Store、外部异步竞态或多模块协调等中风险任务。
- `rigorous`：权限、安全、支付、不可逆写入、数据迁移、关键公共架构或高不确定性任务。

`reuseScope` 使用 `none | local | cross-work-package | global`。只有 `cross-work-package` 和 `global` 才令 `hasSharedArchitecture = true`；同一工作包内复用不升级治理。

异步按风险而不是语法判断。本地确定性只读 Promise 保持低风险；只有外部非确定性、业务写入、重试副作用、乱序会改变业务结果或无法安全回滚时升级。

## 产物模型

- Fast 和 Standard 默认只维护当前工作包的 `PLAN.md`。
- `PLAN.md` 合并目标范围、修改文件、关键决策、必要设计锚点、真实风险、验证命令和回滚方式。
- Fast/Standard 单工作包不默认创建完整 PRD、TASK-BREAKDOWN、COMPONENTS、TDD、HANDOFF、DESIGN-SOURCES 或模块设计规格。
- Standard 在同一 `PLAN.md` 中增加真实风险章节，并由 Liu 定向审核；不创建另一套固定文档。
- Rigorous 与跨工作包关键共享架构继续兼容既有完整产物和校验器。

设计源按视觉簇提取。页面根节点、一个独立交互面板或本次实际修改的公共组件可以成为设计锚点；不得因为存在设计链接就递归拆出所有可见子组件。复用且不修改的项目组件只记录契约路径。

## 条件 Reviewer

Developer 始终执行与改动匹配的测试、Lint、类型检查和构建，这些属于验证而不是 Review。

独立 `code-reviewer` 仅在以下条件触发：

- 权限、安全、支付、不可逆操作或数据迁移；
- 真实写 API、跨工作包/全局共享契约、全局 Store 或公共基础设施变化；
- 有业务影响的复杂竞态、缓存一致性或重试副作用；
- 必需验证失败后完成修复，需要独立复核；
- 修改跨越多个业务域或用户明确要求审查。

未命中触发器时，Developer 输出简短自检与运行证据后直接交付。命中时 Reviewer 只读取 `PLAN.md`、变更 diff、触发风险和相关验证证据；无问题只输出简版结论，有问题才生成结构化问题记录。

## 上下文与时间预算

- Fast 方案建议不超过 150 行，Standard 全部治理产物建议不超过 300 行。
- 单 Agent 默认上下文包不超过约 15KB；超限时由 Orchestrator 先摘要，不允许通过多个 `full` 引用绕过。
- Reviewer 必须有时间预算、进度心跳和超时接管规则；不得用短轮询重复消耗上下文。
- 全局基线失败先与任务前基线比较，确认是新增回归后才扩查。

## 兼容性

保留既有 PRD、COMPONENTS、TDD、HANDOFF、REVIEW 和设计矩阵模板与校验类型，供旧运行和 Rigorous 路径使用。新 Fast/Standard 路径不再默认生成或读取它们。

## 验收

1. 路由说明明确 local reuse 和本地确定性 Promise 不升级 Fast。
2. Fast/Standard 使用 `PLAN.md`，Standard 是 Fast 的风险增量。
3. Direct/Fast 默认调度不包含 Reviewer，Standard 也只按触发器插入 Reviewer。
4. Rigorous 保留独立 Reviewer。
5. Manifest、README、SKILL、Agent 指令和测试使用一致语义。
