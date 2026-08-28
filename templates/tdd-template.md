# TDD（技术设计文档）

> 基于 PRD：`.dev-flow/runs/{需求编号}/PRD.md`
> 生成时间：{timestamp}
> 版本：v1.0

---

## 1. 技术方案概览

| 项目 | 选择 |
|------|------|
| 框架 | {React 18 / Vue 3 / 其他} |
| 语言 | TypeScript |
| 构建工具 | {Vite / Webpack / 其他} |
| CSS 方案 | {Tailwind CSS / CSS Modules / styled-components} |
| 状态管理 | {Zustand / Redux Toolkit / Pinia / Context} |
| 服务端状态 | {React Query / SWR / Apollo Client} |
| 路由 | {React Router / Vue Router} |
| 测试框架 | {Vitest + Testing Library / Jest} |
| 组件库 | {Ant Design / 自研 / 无} |

---

## 2. 组件树

### 2.1 页面级组件树

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── UserMenu
│   ├── Sidebar (可选)
│   └── Content
│       └── <Outlet /> (路由出口)
│
├── FeatureListPage
│   ├── PageHeader
│   │   ├── Title
│   │   └── ActionButton (新建)
│   ├── SearchBar
│   │   ├── SearchInput
│   │   └── FilterSelect
│   ├── FeatureTable
│   │   ├── TableHeader
│   │   └── TableRow (× N)
│   │       ├── StatusBadge
│   │       └── ActionDropdown
│   └── Pagination
│
├── FeatureDetailPage
│   ├── PageHeader (with back button)
│   ├── DetailCard
│   │   ├── FieldGroup
│   │   └── StatusTimeline
│   └── ActionBar
│
└── FeatureCreatePage / FeatureEditPage
    └── FeatureForm
        ├── FormSection (基本信息)
        ├── FormSection (详细配置)
        └── FormActions (提交/取消)
```

### 2.2 通用组件清单

| 组件 | 路径 | 用途 | 是否新增 |
|------|------|------|---------|
| StatusBadge | `components/ui/StatusBadge` | 状态标签 | 新增 |
| SearchBar | `components/business/SearchBar` | 通用搜索栏 | 新增 |
| ... | ... | ... | ... |

### 2.3 组件 Props 契约

#### FeatureTable

```typescript
interface FeatureTableProps {
  data: Feature[];
  loading: boolean;
  error?: Error | null;
  onRowClick?: (item: Feature) => void;
  onAction?: (action: string, item: Feature) => void;
  pagination?: PaginationProps;
}
```

#### StatusBadge

```typescript
interface StatusBadgeProps {
  status: FeatureStatus;
  size?: 'small' | 'default';
}
```

（每个关键组件都需要定义 Props 契约）

---

## 3. 数据流设计

### 3.1 数据流概览

```mermaid
graph TD
    A[API Layer] --> B[React Query Cache]
    B --> C[Custom Hooks]
    C --> D[Page Components]
    D --> E[Business Components]
    E --> F[UI Components]
    F --> G[User Event]
    G --> H[Mutation Hook]
    H --> A
```

### 3.2 状态归属

| 状态 | 类型 | 管理方式 | 所属组件/Hook |
|------|------|---------|-------------|
| 列表数据 | 服务端 | React Query | `useFeatureList` |
| 筛选条件 | URL 参数 | useSearchParams | `useFeatureFilters` |
| 表单数据 | 临时 | useState | `FeatureForm` |
| 提交状态 | 临时 | useMutation | `useFeatureMutation` |
| 全局通知 | 全局 | Context | `NotificationContext` |

### 3.3 关键数据流路径

**列表页搜索流程：**
```
用户输入关键词 → SearchInput onChange → useFeatureFilters 更新 URL 参数
→ useFeatureList queryKey 变化 → React Query 自动 refetch
→ FeatureTable 重新渲染
```

**表单提交流程：**
```
用户点击提交 → FeatureForm validate → useFeatureMutation.mutate
→ API 调用 → onSuccess: 更新缓存 + 跳转列表页
→ onError: 显示错误提示
```

---

## 4. 路由设计

```
/feature
├── /feature/list              → FeatureListPage     (懒加载)
├── /feature/:id               → FeatureDetailPage   (懒加载)
│   └── /feature/:id/edit      → FeatureEditPage     (懒加载，权限守卫)
└── /feature/create            → FeatureCreatePage   (懒加载，权限守卫)
```

**路由配置：**
```typescript
const featureRoutes = [
  {
    path: '/feature',
    element: <FeatureLayout />,
    children: [
      { index: true, element: <Navigate to="list" /> },
      { path: 'list', element: <FeatureListPage /> },
      { path: ':id', element: <FeatureDetailPage /> },
      { path: ':id/edit', element: <AuthGuard><FeatureEditPage /></AuthGuard> },
      { path: 'create', element: <AuthGuard><FeatureCreatePage /></AuthGuard> },
    ],
  },
];
```

---

## 5. API 契约

### 5.1 获取列表

```
GET /api/features
```

```typescript
// 请求
interface GetFeatureListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: FeatureStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 响应
interface GetFeatureListResponse {
  code: number;
  message: string;
  data: {
    list: Feature[];
    total: number;
    page: number;
    pageSize: number;
  };
}

// 错误码
// 401: 未登录
// 403: 无权限
// 500: 服务器错误
```

### 5.2 创建

```typescript
interface CreateFeatureRequest {
  name: string;
  description?: string;
  status: FeatureStatus;
  // ...
}

interface CreateFeatureResponse {
  code: number;
  message: string;
  data: Feature;
}
```

（每个 API 都需要定义请求/响应/错误处理）

---

## 6. 状态管理策略

### 6.1 服务端状态（React Query）

```typescript
// hooks/useFeatureList.ts
export const useFeatureList = (params: FeatureListParams) => {
  return useQuery({
    queryKey: ['features', 'list', params],
    queryFn: () => getFeatureList(params),
    staleTime: 5 * 60 * 1000,   // 5 分钟内不重新请求
    placeholderData: keepPreviousData, // 翻页时保留旧数据
  });
};

// hooks/useFeatureMutation.ts
export const useCreateFeature = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFeature,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features', 'list'] });
    },
  });
};
```

### 6.2 全局 UI 状态（Context / Zustand）

```typescript
// stores/notificationStore.ts
interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  removeNotification: (id: string) => void;
}
```

### 6.3 表单状态

使用组件内 `useState` + `useReducer`（复杂表单），不使用全局状态。

---

## 7. 性能策略

| 优化点 | 策略 | 位置 |
|--------|------|------|
| 路由懒加载 | `React.lazy` + `Suspense` | 所有非首页路由 |
| 列表虚拟化 | `@tanstack/react-virtual` | 超过 100 条的列表 |
| 搜索防抖 | `useDebounce` 300ms | `SearchInput` |
| 组件缓存 | `React.memo` | `TableRow`、`StatusBadge` |
| 计算缓存 | `useMemo` | 表格列定义、格式化数据 |
| 图片懒加载 | `loading="lazy"` + WebP | 所有内容图片 |
| API 缓存 | React Query staleTime | 按数据类型设置 |

---

## 8. 目录结构

```
src/
├── pages/
│   └── feature/
│       ├── FeatureListPage/
│       │   ├── index.tsx
│       │   ├── FeatureListPage.test.tsx
│       │   └── components/
│       │       ├── SearchBar.tsx
│       │       └── FeatureTable.tsx
│       ├── FeatureDetailPage/
│       │   ├── index.tsx
│       │   └── FeatureDetailPage.test.tsx
│       ├── FeatureCreatePage/
│       │   ├── index.tsx
│       │   └── FeatureCreatePage.test.tsx
│       └── FeatureEditPage/
│           ├── index.tsx
│           └── FeatureEditPage.test.tsx
├── components/
│   ├── ui/
│   │   └── StatusBadge/
│   │       ├── index.tsx
│   │       └── StatusBadge.test.tsx
│   └── business/
│       └── FeatureForm/
│           ├── index.tsx
│           └── FeatureForm.test.tsx
├── hooks/
│   ├── useFeatureList.ts
│   ├── useFeatureDetail.ts
│   └── useFeatureMutation.ts
├── services/
│   └── feature.ts
├── types/
│   └── feature.ts
└── constants/
    └── feature.ts
```

---

## 9. 设计 Token 映射

（将 PRD 中的设计 Token 映射到具体实现方案）

| 设计 Token | CSS 变量 | Tailwind 类（如使用） |
|-----------|---------|---------------------|
| `--color-primary` | `var(--color-primary)` | `text-primary` |
| `--spacing-md` | `var(--spacing-md)` | `p-4` |
| ... | ... | ... |

---

## 10. 风险评估

> 风险分数 = 影响 × 发生可能性 × 不确定性，每项取 1–3。

| 风险/关键假设 | 影响 | 可能性 | 不确定性 | 分数 | 反例或触发条件 | 缓解/回滚方案 |
|---------------|------|--------|-----------|------|---------------|--------------|
| ... | 1-3 | 1-3 | 1-3 | ... | ... | ... |

**审查深度**：低风险（1–8）/ 中风险（9–18）/ 高风险（19–27 或关键共享架构）

> 任何包含异步读写、mutation、提交、重试或状态切换的路径，乱序响应和重复提交风险不得低于 9 分；若不适用，必须记录可核验证明。

**异步风险判定**：适用（乱序响应：{N} 分；重复提交：{N} 分）/ 不适用（证明：{可核验证据}）

## 11. 技术方案确认

> 架构师完成本方案后，先使用 `tdd-proposal` 类型校验正文，再呈现给用户确认。只有用户明确确认后，才允许进入架构对抗审查。

**方案确认状态**：`PENDING_USER_CONFIRMATION` / `CONFIRMED`

**确认依据**：{用户明确确认的时间与原话摘要}

**确认版本**：v{N}

## 12. 架构对抗审查

> 本节只能在“技术方案确认”为 `CONFIRMED` 后填写。所有风险级别均由独立挑战视角执行；低风险使用限时轻量挑战，中高风险使用完整挑战。

| 编号 | 挑战问题 | 反例/证据 | 是否违反目标或不变量 | 修改建议 |
|------|---------|----------|---------------------|---------|
| AR-01 | 是否存在更少组件、状态或依赖的方案？ | ... | 是/否 | ... |
| AR-02 | 哪个假设失败会推翻当前方案？ | ... | 是/否 | ... |
| AR-03 | 乱序、重试、重复提交、部分失败时会怎样？ | ... | 是/否 | ... |

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
- 全部为 `RESOLVED`、`WAIVED_BY_USER` 或 `NO_CHANGES_REQUESTED`：记录残余风险并进入下一阶段。

## 14. 附录

### 14.1 关键决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| ... | ... | ... | ... |

### 14.2 其他风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| ... | ... | ... | ... |
