# 项目组件索引表（Component Index）

> 项目根目录：{project_root}
> 索引版本：{sourceFingerprint}
> 最后扫描时间：{timestamp}
> 生命周期：项目级；源码指纹不变时跨需求复用

---

## 0. 项目结构概览

- **架构类型**：{单体 / Monorepo}（如是 Monorepo，列出 workspaces 包清单）
- **包管理工具**：{npm / yarn / pnpm}
- **Monorepo 工具**：{无 / Lerna / Nx / Turborepo / pnpm workspace}
- **第三方 UI 组件库**：{Ant Design 5.x / Element Plus / 无 / 其他}
- **CSS 方案**：{Tailwind CSS / CSS Modules / styled-components / 其他}

### Monorepo 包清单（如有）

| 包名 | 路径 | 用途 |
|------|------|------|
| `@company/ui-kit` | `packages/ui-kit` | 共享 UI 组件库 |
| `@company/shared` | `packages/shared` | 共享工具/Hooks/类型 |

---

## 1. 组件索引（按来源分类）

> 每个组件的"可复用性"分三级：✅ 可直接复用 / ⚠️ 需适配 / ❌ 不可复用（但不要重复造轮子）

### 1.1 项目内公共组件（`src/components/` 或 `components/`）

| 组件名 | 导入路径 | 用途（一句话） | 关键 Props | 可复用性 | 关联 Skill |
|--------|---------|---------------|-----------|---------|-----------|
| StatusBadge | `@/components/ui/StatusBadge` | 状态标签展示 | `status, size?` | ✅ | - |
| Pagination | `@/components/ui/Pagination` | 分页控件 | `current, total, onChange` | ✅ | - |
| ConfirmModal | `@/components/ui/ConfirmModal` | 确认弹窗 | `title, content, onConfirm` | ✅ | - |

### 1.2 Monorepo 组件库包（如 `packages/ui-kit/`）

| 组件名 | 导入路径 | 用途（一句话） | 关键 Props | 可复用性 | 关联 Skill |
|--------|---------|---------------|-----------|---------|-----------|
| Button | `@company/ui-kit/Button` | 统一按钮 | `variant, size, loading` | ✅ | - |
| DataTable | `@company/ui-kit/DataTable` | 数据表格 | `columns, dataSource, pagination` | ✅ | - |

### 1.3 内部 npm 包（`@company/*` 在 `dependencies` 中）

| 包名 | 版本 | 导入方式 | 用途 | 关联 Skill |
|------|------|---------|------|-----------|
| `@company/ui-kit` | `^2.3.0` | `import { Button } from '@company/ui-kit'` | 企业级 UI 组件库 | `ui-kit-skill`（如有） |
| `@company/hooks` | `^1.0.0` | `import { useAuth } from '@company/hooks'` | 企业级 Hooks 集合 | - |

### 1.4 第三方组件库（已安装的）

| 库名 | 版本 | 常用组件举例 | 已有全局配置 |
|------|------|------------|------------|
| `antd` | `5.12.0` | Button, Table, Modal, Form, Select | `ConfigProvider` 全局主题 |
| `@ant-design/icons` | `5.2.0` | SearchOutlined, EditOutlined | - |

### 1.5 全局注册组件（Vue 项目）

| 组件名 | 注册方式 | 用途 |
|--------|---------|------|
| `GlobalHeader` | `app.component('GlobalHeader', ...)` | 全局头部 |

---

## 2. 工具函数 / Hooks 索引

| 名称 | 导入路径 | 用途 |
|------|---------|------|
| `useAuth` | `@/hooks/useAuth` | 获取当前用户权限 |
| `formatDate` | `@/utils/format` | 日期格式化 |
| `useRequest` | `@/hooks/useRequest` | 通用请求封装 |

---

## 3. 关联 Skill 映射

> 扫描项目中的 skill 文件，将组件库与 skill 关联。

| 组件库/包 | 关联 Skill | Skill 用途 |
|----------|-----------|-----------|
| `@company/ui-kit` | `skills/ui-kit-usage.md` | 组件库最佳实践、主题定制、常见模式 |
| （无 skill） | - | 按通用方式使用 |

---

## 4. 扫描日志

| 扫描项 | 结果 |
|--------|------|
| `package.json` 解析 | ✅ 成功 |
| Monorepo 检测 | ✅ 检测到 {N} 个 workspaces 包 |
| `src/components/` 遍历 | ✅ 发现 {N} 个组件目录/文件 |
| `packages/*/src/components/` 遍历 | ✅ 发现 {N} 个组件 |
| 内部 npm 包识别 | ✅ 识别 {N} 个内部包 |
| 第三方 UI 库检测 | ✅ 检测到 {N} 个库 |
| 项目 Skill 扫描 | ✅ 发现 {N} 个关联 Skill |
| 组件 Props 提取 | ⚠️ 部分组件 Props 类型为外部引用，需手动确认 |

---

## 5. 使用说明

### 给 Architect（组件拆分时）

1. 设计新组件前，**先查本索引表**，确认是否已有可复用组件
2. 如果索引表中有匹配组件 → 标注"复用（已有）"，写清导入路径
3. 如果索引表中没有 → 标注"新增"，并给出路径建议
4. 如果索引表中有但需要适配 → 标注"复用（需适配）"，说明适配方案

### 给 Developer（开发时）

1. 实现组件前，**先查本索引表**，确认组件是否存在
2. 使用索引表中列出的导入路径，不要自己造新的
3. 如果组件有关联 Skill，加载 Skill 获取最佳实践

### 给 Code Reviewer（审查时）

1. 检查是否有重复实现索引表中已有的组件
2. 如果发现重复 → 记录为带稳定编号的 P0 高影响问题，完整呈现证据后交由用户选择是否修改
