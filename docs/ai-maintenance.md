# AI 与开发者维护说明

本文件面向后续继续接手此仓库的 AI 代理或开发者。目标不是介绍业务，而是降低修改成本和误改风险。

## 先看什么

接手后优先阅读：

1. `docs/architecture.md`
2. `packages/shared/src/index.ts`
3. `apps/web/components/section-renderer.tsx`
4. `apps/api/src/main.ts`

这四处可以帮助你在最短时间内理解当前系统边界。

## 当前真实状态

当前仓库不是完整生产系统，而是"第一版可运行骨架"。

已经具备：

- 前台模块化渲染
- 首页长单页落地页结构
- API 模块边界
- 本地 Admin 后台
- 后台登录鉴权
- AI 提供商和提示词后台配置
- AI 问诊越界限制
- AI 改站草稿与差异预览
- 截图/多图/纯文字 AI 改站
- 素材库 AI 描述与素材适用范围
- 访问日志面板
- 服务端本地聊天记录存储
- 共享 schema 与种子数据
- Docker 本地依赖
- 可直接运行的开发环境
- 全局 CSS 设计系统（医疗风格，含 design token、响应式、scroll-reveal 动效）
- sticky 毛玻璃 Header + 移动端汉堡菜单
- 深色品牌 Footer（三栏布局，移动端折叠）
- Admin 移动端横向 tab 与折叠式内容编辑
- 菜单式运维脚本 `yk.sh`（自动安装为 `yk` 全局命令）

尚未具备或仍建议后续增强：

- PostgreSQL/对象存储生产化
- Telegram Bot 全量生产转接策略
- 视频逐帧理解或视频模型接入
- 更细角色权限
- 数据脱敏/日志保留策略后台配置

不要把当前占位接口误判为已完成能力。

## 前端样式系统

### 设计 Token（`apps/web/src/globals.css`）

所有颜色、间距、阴影、圆角、过渡时间均通过 CSS 变量统一管理，修改品牌色只需改 `:root` 中的 `--primary` 和 `--accent`。

关键变量：

| 变量 | 用途 |
|------|------|
| `--primary` | 主品牌蓝 `#0b5cff` |
| `--accent` | 辅助绿 `#14c2a3` |
| `--bg` | 页面背景 `#f0f4f8` |
| `--surface-alt` | Footer 深色背景 `#071a2e` |
| `--radius` / `--radius-sm` | 圆角 20px / 12px |
| `--container` | 最大宽度 `min(1180px, 100vw - 32px)` |

### Scroll-reveal

`apps/web/src/main.tsx` 中通过 `IntersectionObserver` 自动为所有 `section` 和 `.reveal` 元素添加入场动效（淡入上移）。延迟类：`.reveal-delay-1` ~ `.reveal-delay-4`（0.1s 步进）。

### 响应式断点

| 断点 | 行为 |
|------|------|
| `≤ 768px` | Header 切换为汉堡菜单 |
| `≤ 980px` | 三列网格变两列，Footer 变两列 |
| `≤ 640px` | 所有网格变单列，字体 clamp 缩小 |

## 代码边界规则

### Web 端

- 当前入口是 `apps/web/src/App.tsx`
- `apps/web/src/App.tsx` 不应该继续堆业务逻辑
- 新增页面模块时，先在 `packages/shared` 定义 schema，再在 `section-renderer` 挂载组件
- 页面内容优先来自 API 或 CMS，不要重新写死到组件内部

### API 端

- 每个业务域一个 module 目录
- 路由负责校验和响应，复杂逻辑应下沉到 service 层
- 当前没有 service/repository 层，是因为还没有持久化接入；接数据库时优先补齐
- 所有新接口都要明确属于内容、业务还是分析
- 目前 `admin` 与 `content` 都基于 [`data/content.json`](/Users/ayaya/Code/yakewangye/data/content.json) 工作
- 当前聊天记录存于 [`data/chat-sessions.json`](/Users/ayaya/Code/yakewangye/data/chat-sessions.json)
- 当前管理员鉴权位于 [`apps/api/src/lib/auth.ts`](/Users/ayaya/Code/yakewangye/apps/api/src/lib/auth.ts)
- 当前内容和聊天存储抽象位于：
  - [`apps/api/src/lib/storage/content-repository.ts`](/Users/ayaya/Code/yakewangye/apps/api/src/lib/storage/content-repository.ts)
  - [`apps/api/src/lib/storage/chat-repository.ts`](/Users/ayaya/Code/yakewangye/apps/api/src/lib/storage/chat-repository.ts)
- 如果后续改 PostgreSQL，优先替换 repository，不要直接改路由

### Shared 包

- 这里是协议层
- 任何被前台和 API 同时使用的类型、枚举、schema，都放这里
- 新增 section 类型必须在这里补上 schema 和 TypeScript 类型

## 新功能推荐接入顺序

### 1. CMS 接入

优先事项：

- 新建 `apps/cms` 或独立部署 Strapi
- 为 `site_settings`、`pages`、`sections`、`articles`、`media_assets` 建模
- API 层从本地 JSON 存储切换到 CMS 拉取

修改点：

- `apps/api/src/modules/content`
- `packages/shared/src/index.ts`
- `apps/web/src/App.tsx`

## 当前运行方式

统一使用：

```bash
corepack pnpm install
corepack pnpm run dev
```

不要再假设当前仓库通过 `npm install` 作为主路径运行。这个仓库现在使用 `pnpm workspace` 管理依赖。

## 当前后台入口

- 前台后台共用同一个 web 应用
- 后台入口为 `http://localhost:3000/admin`
- 内容保存到 `data/content.json`
- 上传文件保存到 `apps/api/uploads/`
- 聊天记录保存到 `data/chat-sessions.json`
- 访问日志保存到 `data/visitor-logs.json`
- 后台现在需要先登录；如果未配置管理员，会先走初始化流程
- 管理员状态接口：
  - `GET /api/admin/status`
  - `POST /api/admin/setup`
- 如果未使用环境变量，初始化后的管理员信息保存到 `data/admin-config.json`
- 如果使用环境变量，则读取 `.env`：
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `ADMIN_TOKEN_SECRET`

### 2. 埋点与统计

优先事项：

- 当前已采集 page view/page leave、访客、会话、来源、设备、浏览器、停留时间
- 下一步应补 CTA click、chat start、telegram click
- API 端应从本地 JSON 迁移到 PostgreSQL/ClickHouse/日志系统

修改点：

- `apps/web/src/App.tsx`
- `apps/api/src/modules/analytics`
- `apps/api/src/lib/storage/visitor-log-repository.ts`

### 3. 素材库 AI 描述

当前素材库支持对图片/视频写入 `aiAnalysis`：

- 图片：优先走视觉模型；如果模型不支持图片，退回元数据分析
- 视频：当前只做元数据分析，不做逐帧识别
- AI 改站提示词会读取 `aiAnalysis.summary/tags/suggestedUseCases/placementSuggestions`
- AI 只能把素材库已有 URL 写入白名单媒体字段
- 若素材 AI 标注显示存在当前网站未覆盖的新服务或展示场景，AI 改站可以通过 `create.services` 新增服务，或通过 `create.gallery` 新增图册/视频展示；这些新增项仍会进入后台差异预览，由管理员勾选后才应用。

相关文件：

- `packages/shared/src/index.ts`
- `apps/api/src/lib/admin-ai-gateway.ts`
- `apps/api/src/modules/admin/routes.ts`
- `apps/web/src/components/admin-media.tsx`

### 4. AI 导诊

优先事项：

- 当前已完成 prompt 配置源、本地模型网关层、本地文件会话存储
- 下一步应补真实 AI 提供商适配分层、失败重试、审计日志
- 高意向用户转 Telegram

修改点：

- `apps/api/src/modules/chat`
- `apps/api/src/modules/telegram`

## 部署脚本维护

脚本位于 `yk.sh`，安装后路径为 `/usr/local/bin/yk`。

修改脚本后需要：
1. 提交到 GitHub main 分支
2. 在服务器上运行一次 `sudo bash yk.sh` 或 `yk`，让脚本自我复制到 `/usr/local/bin/yk`

**当前菜单项**

1. 状态检查
2. 首次部署 / 修复部署
3. 安全更新代码
4. 健康检查
5. 创建备份
6. 还原备份

**脚本维护原则**

- 不要再把“首次部署”和“日常更新”混成同一条无脑流程
- 日常更新不能用 `git reset --hard`
- 日常更新必须先检测 PM2 和 nginx，再决定是否重启 / reload
- PM2 启动时必须带上项目 `.env` 与 `PROJECT_ROOT`
- nginx 配置必须同时覆盖 `/api` 和 `/uploads`，并且 `proxy_pass` 不能写成会吞路径前缀的尾部斜杠版本
- 日常更新不能删除 `data`、`uploads`、`postgres-data` 等本地数据
- 还原前必须先自动备份当前状态

## 文档维护要求

每次新增重要功能后，至少同步更新：

- `docs/architecture.md`
- `docs/ai-maintenance.md`

如果变更了目录边界、协议字段、运行方式，但不更新文档，后续 AI 会更容易做出破坏性修改。

## 禁止事项

- 不要把业务数据重新写死回前端组件
- 不要把埋点、AI、内容逻辑混写在同一个 API 文件
- 不要让页面组件直接依赖未来的数据库 ORM
- 不要在没有协议定义的情况下临时塞字段

## 推荐下一步

如果接手者要继续推进，优先顺序建议如下：

1. 完成 CMS 模型与内容读取
2. 为 analytics 事件接 PostgreSQL
3. 接 Telegram Bot
4. 接 AI 模型与会话存储
5. 落后台管理面板或直接接 Strapi Admin
