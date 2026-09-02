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

### 3.1 共享可见组件声明

> 本表是共享可见组件的唯一声明入口。组件名必须与下方设计归属表逐项精确一致，不得使用纯文本清单替代。

| 组件名 | Props 契约 | 使用工作包 |
|---|---|---|
| StatusBadge | StatusBadgeProps | WP01、WP02 |
| Pagination | PaginationProps | WP01、WP02 |
| SearchBar | SearchBarProps | WP01、WP02 |
| ConfirmModal | ConfirmModalProps | WP02 |
| EntryDetailModal | EntryDetailModalProps | WP01、WP02 |
| EntryForm | EntryFormProps | WP01、WP02 |

#### 3.1.1 纯非视觉共享分支（与上表二选一）

实际共享边界确实只有 types、API、services 或 store 等非视觉契约时，删除上方可见组件数据行并填写：

- **共享可见组件结论**：`无共享可见组件`
- **非视觉证明**：仅包含 `src/types/entry.ts`、`src/services/entry.ts` 等具体非视觉路径；不包含 JSX、Vue、HTML、CSS 或其他可见渲染文件

该分支不得与真实可见组件并存；职责目录树一旦包含 `.tsx`、`.vue`、样式文件或可见组件目录，就必须恢复逐组件声明与工作包矩阵归属。

### 3.2 组件 Props 契约（关键共享组件）

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

## 8. 共享职责目录树

> 仅记录跨工作包共享文件；每个非空目录或文件条目都要独立标注 `[新增|修改|复用|不变][共享]`、单一职责和允许/禁止的修改约束。工作包私有文件继续由各自的 `COMPONENTS.md` 和 TDD 管理。

### 8.1 共享文件职责

```
src/                                        # [不变][共享] 应用源码根目录；禁止借共享架构扩大工作包私有范围
├── layouts/                                # [修改][共享] 全局布局目录；负责统一导航、权限出口和路由容器
│   └── AppLayout.tsx                       # [修改][共享] 全局布局入口；负责承载各工作包页面出口
├── components/ui/                          # [复用][共享] 基础 UI 目录；只允许扩展已确认的共享 Props 契约
│   ├── StatusBadge/index.tsx               # [修改][共享] 状态标签入口；负责统一跨工作包状态视觉
│   ├── Pagination/index.tsx                # [复用][共享] 分页入口；保持既有分页交互与事件契约
│   ├── SearchBar/index.tsx                 # [复用][共享] 搜索入口；保持既有搜索与筛选契约
│   └── ConfirmModal/index.tsx              # [复用][共享] 确认弹窗入口；保持既有确认与取消契约
├── components/business/                    # [修改][共享] 业务共享组件目录；仅承载至少两个工作包复用的视觉组件
│   ├── EntryDetailModal/index.tsx          # [新增][共享] 词条详情弹窗；负责统一查看与编辑入口
│   └── EntryForm/index.tsx                 # [新增][共享] 词条表单；负责统一字段渲染和提交事件
├── services/entry.ts                       # [修改][共享] 词条接口边界；负责跨工作包 GET/POST 契约
├── stores/permission.ts                    # [复用][共享] 权限状态边界；禁止写入工作包局部 UI 状态
├── types/entry.ts                          # [新增][共享] 统一词条模型；负责跨工作包类型契约
└── styles/tokens.css                       # [修改][共享] 设计 Token 映射；负责共享视觉变量
```

### 8.2 共享可见组件设计归属

> 全局架构不维护第二份设计覆盖矩阵；每个共享可见组件必须映射到具体工作包的 `COMPONENTS.md` 矩阵。

| 组件名 | 工作包设计矩阵 |
|---|---|
| StatusBadge | WP01 COMPONENTS.md、WP02 COMPONENTS.md |
| Pagination | WP01 COMPONENTS.md、WP02 COMPONENTS.md |
| SearchBar | WP01 COMPONENTS.md、WP02 COMPONENTS.md |
| ConfirmModal | WP02 COMPONENTS.md |
| EntryDetailModal | WP01 COMPONENTS.md、WP02 COMPONENTS.md |
| EntryForm | WP01 COMPONENTS.md、WP02 COMPONENTS.md |

纯非视觉共享分支改为填写：

- **设计归属结论**：`不适用：无共享可见组件`

> 运行产物只保留适用分支：有共享可见组件时逐项映射每个使用工作包的 `COMPONENTS.md`；纯非视觉时保留结构化结论与具体路径证明，不得笼统写“无”。

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

## 11. 技术方案确认

> 只有任务拆分确认存在跨工作包共享契约或关键基础时，才启用 Architect 完成本方案。先使用 `global-architecture-proposal` 完成结构与一致性校验，再向用户展示共享职责目录树、共享可见组件设计归属、风险和方案摘要；用户确认不替代技术正确性审核。只有用户明确确认后，才允许各工作包继续组件确认与开发前设计补水。

> 确认依据只接受固定肯定句式：“用户于 YYYY-MM-DD 明确确认当前技术方案。”或“用户明确确认本方案。”

**方案确认状态**：`PENDING_USER_CONFIRMATION` / `CONFIRMED`

**确认依据**：{按上方固定肯定句式填写}

**确认版本**：v{N}
