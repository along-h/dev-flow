# 全局架构方案（Global Architecture）

> 基于任务拆分方案：`.dev-flow/runs/{需求编号}/TASK-BREAKDOWN.md`
> 基于全局 PRD：`.dev-flow/runs/{需求编号}/PRD.md`
> 生成时间：{timestamp}
> 版本：v1.0

---

## 1. 技术方案概览

| 项目 | 选择 |
|------|------|
| 框架 | {React 18 / Vue 3} |
| 语言 | TypeScript |
| 构建工具 | {Vite / Webpack} |
| CSS 方案 | {Tailwind CSS / CSS Modules} |
| 状态管理 | {Zustand / Redux Toolkit / Context} |
| 服务端状态 | {React Query / SWR} |
| 路由 | {React Router / Vue Router} |
| 测试框架 | {Vitest + Testing Library} |
| 组件库 | {Ant Design / 自研} |

---

## 2. 统一数据模型（全局 types）

> 多个工作包共用的核心数据类型统一定义，避免各工作包各自定义导致契约漂移。

```typescript
// types/entry.ts —— 词条
export interface Entry {
  id: string;
  word: string;
  definitions: Definition[];
  status: ReviewStatus;
  // ...
}

// types/definition.ts —— 释义
export interface Definition {
  id: string;
  posType: PosType;        // 词性
  enDefinition: string;    // 英文释义
  zhDefinition: string;    // 中文释义
  // ...
}

// types/review.ts —— 审核状态
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type PosType = 'noun' | 'verb' | 'adj' | 'adv' | ...;
```

**使用方工作包 / 覆盖 UC**：WP01（UC01, UC02）, WP02（UC03）

---

## 3. 共享组件库设计

> 跨工作包复用的组件在共享架构阶段统一设计，各工作包开发时直接引用。

### 3.1 基础 UI 组件（components/ui/）

| 组件 | 用途 | 使用方工作包/UC | Props 契约 |
|------|------|----------|-----------|
| StatusBadge | 状态标签 | UC01,02,03 | `{ status, size? }` |
| Pagination | 分页 | UC01,03 | `{ current, total, pageSize, onChange }` |
| SearchBar | 搜索栏 | UC01,03 | `{ onSearch, filters }` |
| ConfirmModal | 确认弹窗 | UC03 | `{ title, content, onConfirm, onCancel }` |

### 3.2 业务共享组件（components/business/）

| 组件 | 用途 | 使用方工作包/UC | Props 契约 |
|------|------|----------|-----------|
| EntryDetailModal | 词条详情弹窗 | UC02, UC03 | `{ entryId, mode: 'view'|'edit', onClose }` |
| EntryForm | 词条编辑表单 | UC02, UC03 | `{ initialValues?, onSubmit }` |

### 3.3 组件 Props 契约（关键共享组件）

```typescript
// EntryDetailModal —— WP01 和 WP02 共用
interface EntryDetailModalProps {
  entryId: string;
  mode: 'view' | 'edit';
  onClose: () => void;
  onEditSubmit?: (data: EntryFormData) => Promise<void>;
}
```

---

## 4. 全局 API 层（services/）

> 跨工作包共用的 API 统一定义。

```typescript
// services/entry.ts
export const getEntryList = (params: EntryListParams): Promise<EntryListResponse> => {...}
export const getEntryDetail = (id: string): Promise<Entry> => {...}
export const updateEntry = (id: string, data: EntryFormData): Promise<Entry> => {...}

// services/review.ts —— WP02 / UC03 专属
export const approveEntry = (id: string): Promise<void> => {...}
export const rejectEntry = (id: string, reason: string): Promise<void> => {...}
```

---

## 5. 全局路由与布局

```
/                              → Layout
├── /entries                   → UC01 词汇列表页
├── /entries/create            → UC02 新增词条
├── /entries/:id               → UC02 词条详情
└── /review                    → UC03 词汇审核页
```

**布局结构**：
```
Layout
├── Header（全局导航）
├── Sidebar（可选）
└── Content → <Outlet />
```

标注：
- 权限守卫位置
- 懒加载路由

---

## 6. 全局状态管理

| 状态 | 类型 | 管理方式 | 使用方工作包/UC |
|------|------|---------|----------|
| 用户权限 | 全局 | Context / Store | 全部 |
| 全局筛选条件 | 全局 | Store | UC01, UC03 |
| 词条列表数据 | 服务端 | React Query | UC01, UC03 |
| 词条详情 | 服务端 | React Query | UC02, UC03 |
| 表单临时状态 | 局部 | useState | 各工作包覆盖的 UC 表单 |

---

## 7. 设计 Token 系统映射

> 将 PRD 全局设计 Token 映射到具体实现（CSS 变量 / Tailwind 配置）。

| 设计 Token | 实现方式 |
|-----------|---------|
| `--color-primary` | Tailwind `text-primary` / CSS 变量 |
| `--spacing-md` | Tailwind `p-4` / CSS 变量 |
| ... | ... |

---

## 8. 目录结构

```
src/
├── layouts/            # 全局布局
├── pages/              # 工作包覆盖的页面
│   ├── entries/        # WP01 / UC01, UC02
│   └── review/         # WP02 / UC03
├── components/
│   ├── ui/             # 基础 UI 组件（全局共享）
│   └── business/       # 业务共享组件
├── hooks/              # 自定义 Hooks
├── services/           # API 调用
├── stores/             # 全局状态
├── types/              # 统一数据模型
├── utils/              # 工具函数
├── constants/          # 常量
└── styles/             # 全局样式 / 设计 Token
```

---

## 9. 各工作包的架构边界

> 明确每个工作包在共享架构下拥有什么、引用什么，并保留 UC 覆盖映射。

| 工作包 | 覆盖 UC | 拥有的页面/组件 | 引用的共享资源 |
|-------|---------|---------------|--------------|
| WP01 | UC01, UC02 | 词汇列表、新增/详情页, EntryForm | StatusBadge, Pagination, Entry 类型 |
| WP02 | UC03 | 审核页 | EntryDetailModal, StatusBadge, approveEntry/rejectEntry |

---

## 10. 风险评估

> 风险分数 = 影响 × 发生可能性 × 不确定性，每项取 1–3。

| 风险/关键假设 | 影响 | 可能性 | 不确定性 | 分数 | 影响的工作包/UC | 缓解/回滚方案 |
|---------------|------|--------|-----------|------|-----------|--------------|
| ... | 1-3 | 1-3 | 1-3 | ... | ... | ... |

**审查深度**：低风险（1–8）/ 中风险（9–18）/ 高风险（19–27 或关键共享基础）

## 11. 技术方案确认

> 架构师完成本方案后，先使用 `global-architecture-proposal` 类型校验正文，再呈现给用户确认。只有用户明确确认后，才允许进入架构对抗审查。

**方案确认状态**：`PENDING_USER_CONFIRMATION` / `CONFIRMED`

**确认依据**：{用户明确确认的时间与原话摘要}

**确认版本**：v{N}

## 12. 架构对抗审查

> 本节只能在“技术方案确认”为 `CONFIRMED` 后填写。所有风险级别均由独立挑战视角尝试推翻共享模型、组件边界、状态与执行顺序。

| 编号 | 挑战问题 | 反例/证据 | 影响范围 | 修改建议 |
|------|---------|----------|---------|---------|
| AR-01 | 共享抽象是否只有一个已确认使用方？ | ... | ... | ... |
| AR-02 | 某个共享契约变化时哪些工作包和 UC 会失效？ | ... | ... | ... |
| AR-03 | 跨工作包更新、缓存失效和部分失败是否一致？ | ... | ... | ... |

**审查结论**：`BLOCK` / `ACCEPT_WITH_RISK` / `ACCEPT`

**审查者**：`code-reviewer` 独立挑战模式

**输入边界**：仅包含用户结果、事实/假设、硬约束和用户已确认的待审查产物；不包含架构师完整推理

**BLOCK 处置**：由用户选择是否修改；不得自动退回架构师

**结论依据**：...

**待验证风险**：...

## 13. 审查问题处置

> 主 Agent 将全部架构审查问题呈现给用户。只有用户选择修改的问题才交给架构师；用户选择不修改或审查无问题时，可以直接进入下一阶段。

| 问题编号 | 用户决定 | 状态 | 修订或残余风险记录 |
|---------|---------|------|------------------|
| AR-01 | 修改 / 不修改 | `SELECTED_FOR_REVISION` / `RESOLVED` / `WAIVED_BY_USER` | ... |
| 无问题时填写 | 不修改 | `NO_CHANGES_REQUESTED` | 审查未发现需要修改的问题，进入下一阶段 |

**流转规则**：

- 存在 `SELECTED_FOR_REVISION`：交给架构师修订；修订方案再次经用户确认后，只复审受影响问题。
- 全部为 `RESOLVED`、`WAIVED_BY_USER` 或 `NO_CHANGES_REQUESTED`：记录残余风险并进入逐工作包开发阶段。
