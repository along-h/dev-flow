# Dev Flow · 专家开发团队

Dev Flow 是一套面向前端开发任务的多 Agent 协作流水线。它将需求分析、任务拆分、架构设计、测试驱动开发、代码与交付质量审查组织成可确认、可校验的标准流程。

你只需要提供开发需求、UC 文档和设计稿。Dev Flow 会先与你补齐需求基线，再把 UC 聚合为可独立验证的工作包，最后按执行拓扑和风险深度选择编排方式。

## 核心能力

- 以 6 个专家 Agent 分工完成需求到代码交付
- 将页面、UC、工作包和架构边界分开建模，避免“一 UC 一任务”
- 支持 `single-workstream` / `multi-workstream` 执行拓扑和 `fast` / `standard` / `rigorous` 治理深度
- 用带变更类型、工作包归属和单一职责备注的职责目录树展示计划文件边界
- 在 `COMPONENTS.md` 维护唯一的可见 UI 组件设计覆盖矩阵
- 自动从顶层设计源定位精确子节点，并一次性集中请求仍缺失的组件设计
- 架构方案通过结构校验后只等待用户确认，确认后由 Developer 先执行设计补水，再运行 `components-readiness` 开发准入
- 自动扫描目标项目的技术栈、目录结构和可复用组件
- 使用模板与校验脚本约束 PRD、TDD、审查报告等产物格式
- 通过结构化上下文包完成 Agent 之间的精简交接
- 首轮完整审查 P0、P1、P2，全部问题都由用户选择是否修改
- 仅修复用户选中项，并用 `selected-change-recheck` 限定复审实际修改及直接影响范围
- 在 PRD 中分离事实、假设、硬约束与方案偏好，优先验证高影响假设
- 从系统不变量派生乱序、重复提交、权限变化和部分失败等反例测试
- 交付前记录 typecheck、lint、test、build 的实际命令、退出码和结果

## 专家团队

| 代号（岗位）            | 角色           | 主要职责                                         |
| ----------------------- | -------------- | ------------------------------------------------ |
| Scanner（项目扫描师）   | 项目扫描师     | 扫描技术栈、项目结构与可复用资源                 |
| Lin（需求分析师）       | 需求分析师     | 澄清需求、边界条件和异常状态                     |
| Liu（任务拆分师）       | 任务拆分师     | 将 UC 聚合为工作包，梳理共享边界、依赖与执行顺序 |
| Chen（前端架构师）      | 前端架构师     | 设计组件边界、职责目录树、设计覆盖矩阵和 TDD     |
| Zhang（前端开发工程师） | 前端开发工程师 | 通过设计准入后按确认方案实现业务代码与测试       |
| Wang（独立质量审查官）  | 独立质量审查官 | 基于证据完整报告分级问题并复审用户选中的修改     |

## 环境要求

- Node.js 18 或更高版本
- 支持加载 Skill 和多 Agent 协作的开发环境

## 快速开始

### 1. 安装 Dev Flow

推荐通过 Skill 仓库安装：

```bash
npx skills add along-h/dev-flow
```

### 2. 初始化目标项目

进入需要开发的项目目录后执行：

```bash
npx dev-flow init
```

也可以显式指定目标目录：

```bash
npx dev-flow init --dir /path/to/project
```

初始化命令会在目标项目中创建 `.dev-flow/`，复制运行所需的脚本、模板、配置和产物目录，并向项目 `.gitignore` 幂等添加 `.dev-flow/`。该目录只保留在用户本地。

已有项目默认仍采用“缺失才复制”，不会覆盖旧 runtime。需要取得新版校验器与模板时显式执行安全升级：

```bash
npx dev-flow init --upgrade
```

`--upgrade` 只覆盖 Dev Flow 管理的 `scripts/`、`templates/`、`manifest.json` 和 `install.sh`；绝不覆盖或删除 `.dev-flow/project/`、`.dev-flow/runs/`、`.dev-flow/artifacts/` 及其中的业务产物。

### 3. 检查安装状态

```bash
sh .dev-flow/install.sh --check-only
```

检查内容包括目录完整性、配置格式、Node.js 版本、产物模板和核心脚本。

### 4. 描述开发需求

完成初始化后，直接向 Agent 描述前端开发任务。例如：

```text
开发一个词条审核页面，支持通过和驳回操作，设计稿：[设计稿链接]
```

```text
启动 Dev Flow，完成用户列表、用户详情和编辑用户三个用例。
```

```text
用多 Agent 开发这个前端需求，并在每个设计阶段让我确认。
```

## 自适应工作模式

Dev Flow 使用两阶段分诊：

```text
UC 文档 + 设计稿 + 用户说明
          ↓
初步接入：只选择需求发现深度，finalRoute = pending
          ↓
需求基线：补齐事实、假设、边界状态和验收标准
          ↓
工作包拆分：按状态/契约/独立验收边界聚合 UC
          ↓
最终编排：执行拓扑 × 治理深度
          ↓
架构产物：职责目录树 + 唯一设计覆盖矩阵 + 技术方案
          ↓
结构校验 → 用户确认架构方案
          ↓
启动 Developer 仅设计补水：自动定位精确子节点 → 一次性询问全部缺失项
          ↓
components-readiness：全部 UI 组件 complete 或逐项 waived
          ↓
Developer 测试驱动实现 → 首轮完整代码与交付质量审查
          ↓
用户选择 P0/P1/P2 修改项
     ┌────┴────┐
 无选择       有选择
     ↓          ↓
记录残余风险   仅修复选中项 → selected-change-recheck
     └────┬────┘
          ↓
运行验证与用户验收
```

### 执行拓扑

- `single-workstream`：一个内聚工作包；可以包含多个页面或多个 UC，但统一设计、开发和验收。
- `multi-workstream`：至少两个可独立验证的工作包，并且需要依赖排序、共享基础或分批交付。

### 治理深度

- `fast`：明确、局部、可逆且无共享契约或高风险状态变化；Architect 先产出并取得用户确认的精简 `COMPONENTS.md`，随后启动 Developer 的仅设计补水阶段。Developer 完成自动定位和集中补水后运行 `components-readiness`，通过前不得测试或实现。代码审查处置门禁保持独立。
- `standard`：存在有限需求不确定性、局部架构决策或中等风险异步交互；先完成 `components` 与 `tdd-proposal` 结构校验，再对组件方案和 TDD 执行唯一一次合并架构确认，之后才进入设计补水与实现。
- `rigorous`：高不确定性、高影响、权限安全、复杂状态或关键共享架构；加深风险证据、架构确认粒度、反例测试和回滚设计。

治理深度只改变方案与验证的深度，不改变核心门禁：架构决策都由用户确认，所有路径都在开发前通过 `components-readiness`，实现后都执行首轮完整代码与交付质量审查，并由用户选择每个级别的修改项。

`fast` 也不得缩减阶段 4：实现后先输出完整审查并通过 `review-proposal`，再由用户处置全部 P0/P1/P2。没有选中项或用户明确说“跳过此次修改”时保存 `WAIVED_BY_USER`、原话和残余风险；只有用户选中项进入修复，修复后执行 `selected-change-recheck` 限定复审，最后才进入运行证据交付。

例如，同一订单页中的查看、编辑、取消和重试可以是 4 个 UC，但如果共享状态、类型和服务且必须整体验收，仍是一个工作包。反过来，一个第三方登录 UC 跨多个可独立验证的权限和回调边界时，可以拆成多个工作包。

`multi-workstream` 会在每个工作包完成开发、审查和独立验证后暂停，向用户交付该包的变更摘要、测试证据和残余风险。只有用户明确确认该工作包完成，才进入下一工作包；全部工作包完成后仍会执行全局回归和最终验收。

## 产物说明

跨需求项目资产保存在 `.dev-flow/project/`，新需求产物保存在 `.dev-flow/runs/{需求编号}/`。旧 `.dev-flow/artifacts/` 仅作为历史产物只读来源。

项目组件索引按源码指纹跨需求复用。每个工作包通过 `HANDOFF.md` 恢复最小上下文，并默认读取 `COMPONENT-SLICE.md`；只有明确扩读触发器命中时才定向读取完整产物。

| 文件                                                          | 说明                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `PRD.md`                                                    | 包含拆分就绪结论的需求基线；简单任务可使用会话内精简版本 |
| `DESIGN-SOURCES.md`                                         | `inactive` / `required` 设计源状态、模块链接和刷新记录   |
| `design/{模块名}.md`                                        | 引用组件证据的结构化布局尺寸、五类 Token、逐状态、响应式和溢出规格 |
| `project/COMPONENT-INDEX.md`                                | 跨需求复用的项目组件与资源索引                           |
| `runs/{需求编号}/work-packages/{WP编号}/HANDOFF.md`         | 当前工作包最小上下文入口                                 |
| `runs/{需求编号}/work-packages/{WP编号}/COMPONENT-SLICE.md` | 当前工作包组件索引切片                                   |
| `COMPONENTS.md`                                             | 职责目录树、组件拆分和唯一设计覆盖矩阵                   |
| `TDD.md`                                                    | 引用已确认矩阵版本的技术设计与测试驱动开发方案           |
| `REVIEW.md`                                                 | 完整分级问题、用户处置和限定复审证据                     |
| `TASK-BREAKDOWN.md`                                         | 工作包、UC 映射、依赖、二维编排决策和升级触发器          |
| `GLOBAL-ARCHITECTURE.md`                                    | 共享职责目录树、共享契约、UI 设计矩阵归属或纯非视觉证明   |

架构方案使用 `components`、`tdd-proposal` 或 `global-architecture-proposal` 在用户确认前校验职责目录树、设计覆盖关系和方案正文。用户确认是唯一的架构决策门禁；确认记录写入产物并通过最终结构校验后，流程直接进入开发前设计补水。

结构校验只证明必需章节和一致性约束存在，不把设计缺口变成事实。开发前必须运行 `components-readiness`；交付状态仍由实现后的完整代码与交付质量审查、实际运行命令和验收标准映射共同证明。

## 风险评分与代码审查处置

风险分数使用“影响 × 发生可能性 × 不确定性”，每项取 1–3：

- 1–8：低风险，保留必要结构校验、测试和运行证据。
- 9–18：中风险，补充针对性反例测试、直接影响验证和回退条件。
- 19–27 或关键共享架构：高风险，加深用户确认粒度、反例测试、运行证据与回滚设计。

实现完成后的首轮代码与交付质量审查始终覆盖当前工作包完整变更、验收标准、设计还原度、测试和运行证据。Reviewer 对每个真实问题使用 `### P0-1/P1-1/P2-1` 稳定唯一编号，报告证据、影响、建议与残余风险；未编号或重复编号的候选不能通过校验，级别只表达影响，不会自动触发修复。

主 Agent 一次性呈现全部问题，由用户选择是否修改。只有确实没有任何问题块时记录 `NO_CHANGES_REQUESTED`；用户全部不选或明确说“跳过此次修改”时记录 `WAIVED_BY_USER`、用户原话和残余风险并继续。只有 `SELECTED_FOR_REVISION` 项进入修复。修复后执行 `selected-change-recheck`：本轮实际修改编号集合必须非空且为用户选中编号集合的子集；直接调用方、直接数据契约、直接受影响测试三类分别记录具体证据或“`不适用：可核验证据原因`”。

异步读写、mutation、提交、重试或状态切换路径中的乱序响应和重复提交风险不得低于 9 分，除非给出可核验的不适用证明。

## 手动校验产物

可以使用以下格式手动校验产物：

```bash
node .dev-flow/scripts/validate-artifact.js <type> <file>
```

例如：

```bash
node .dev-flow/scripts/validate-artifact.js prd .dev-flow/runs/REQ-001/PRD.md
node .dev-flow/scripts/validate-artifact.js components .dev-flow/runs/REQ-001/work-packages/WP01/COMPONENTS.md
node .dev-flow/scripts/validate-artifact.js components-readiness .dev-flow/runs/REQ-001/work-packages/WP01/COMPONENTS.md
node .dev-flow/scripts/validate-artifact.js tdd-proposal .dev-flow/runs/REQ-001/work-packages/WP01/TDD.md
node .dev-flow/scripts/validate-artifact.js tdd .dev-flow/runs/REQ-001/work-packages/WP01/TDD.md
node .dev-flow/scripts/validate-artifact.js review-proposal .dev-flow/runs/REQ-001/work-packages/WP01/REVIEW.md
node .dev-flow/scripts/validate-artifact.js review .dev-flow/runs/REQ-001/work-packages/WP01/REVIEW.md
```

支持的产物类型包括：

- `prd`
- `design-sources`
- `module-design-spec`
- `component-index`
- `handoff`
- `component-slice`
- `components`
- `components-readiness`
- `tdd-proposal`
- `tdd`
- `review-proposal`
- `review`
- `task-breakdown`
- `global-architecture-proposal`
- `global-architecture`

## 项目结构

```text
dev-flow/
├── agents/                 # 专家 Agent 定义
├── artifacts/              # 仓库自检产生的临时产物
├── bin/
│   └── init.js             # 项目初始化 CLI
├── scripts/
│   ├── scan-project.js     # 项目结构与资源扫描
│   └── validate-artifact.js # 产物格式校验
├── templates/              # 标准产物模板
├── install.sh              # 安装完整性检查
├── manifest.json           # Skill 元数据与能力声明
├── package.json            # npm 包与 CLI 配置
└── SKILL.md                # 主 Agent 编排规则
```

初始化到目标项目的 `.dev-flow/` 目录只包含运行时所需的脚本、模板、配置和产物目录；完整仓库中的 `SKILL.md` 与 `agents/` 用于安装和加载 Skill。

目标项目的运行目录结构如下：

```text
.dev-flow/
├── project/                         # 跨需求项目资产
│   ├── COMPONENT-INDEX.md
│   └── SCAN-META.json
├── runs/{需求编号}/                 # 单次需求产物
│   └── work-packages/{WP编号}/
│       ├── HANDOFF.md
│       └── COMPONENT-SLICE.md
├── artifacts/                       # 旧版历史产物，只读兼容
├── scripts/
└── templates/
```

仓库内 Skill 的修改不会自动更新全局安装副本。验证完成后需要重新安装，或同步全局 Skill 到 `/Users/hly/.agents/skills/dev-flow/`。

## 常见问题

### 提示“项目尚未初始化 Dev Flow”

确认目标项目中存在 `.dev-flow/scripts/scan-project.js`。如果不存在，请在项目根目录重新执行：

```bash
npx dev-flow init
```

### Node.js 版本过低

Dev Flow 要求 Node.js 18 或更高版本。可以通过以下命令查看当前版本：

```bash
node --version
```

### `.dev-flow/` 已存在时没有覆盖

默认初始化检测到已有目录时会跳过同名 runtime，避免意外覆盖，但仍会检查 `.gitignore`。若需要刷新旧校验器和模板，使用 `npx dev-flow init --upgrade`；该安全路径只覆盖 Dev Flow 受管 runtime，保留 `project/`、`runs/` 和 `artifacts/`。若检测到旧 `dev-flow/`，只提示手动迁移，不会自动删除或覆盖。

### 什么时候会使用多工作流

只有存在至少两个可独立实现和验收的工作包，并且需要依赖排序、共享基础或分批交付时，才使用 `multi-workstream`。页面或 UC 数量本身不会触发多工作流。

### 一个页面有多个 UC 怎么处理

先判断这些 UC 是否共享状态、数据模型、接口契约和整体验收边界。共享且无法独立验收时聚合为一个工作包；只有具备真实独立交付边界时才拆分。

## License

MIT
