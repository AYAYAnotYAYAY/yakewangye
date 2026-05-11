# 泉寓门诊平台架构说明

## 目标

本仓库将当前单页静态官网重构为一个可长期运营的平台，覆盖以下能力：

- 模块化官网渲染
- 未来可接入 CMS 的内容管理
- AI 导诊与 Telegram 转人工
- SEO 与文章系统
- 访客埋点、来源分析、行为统计
- 面向后续 AI 代理持续开发的清晰边界

## 当前阶段

当前已落地的是第一版骨架：

- `apps/web`：React + Vite 前台
- `apps/api`：统一 API 服务，提供内容、分析、AI、Telegram 接口占位
- `packages/shared`：共享 schema、种子数据、类型
- `docker-compose.yml`：PostgreSQL、Redis、Metabase 本地依赖
- `data/content.json`：当前阶段的本地 CMS 内容存储

尚未在本次提交内落地：

- 数据库持久化
- Telegram Bot 实际推送
- 大模型调用
- 埋点 SDK 注入

已经落地的后台是“本地 JSON CMS 最小版”，用于当前阶段快速验证后台工作流；后续可以切换到 Strapi/PostgreSQL，而不需要推翻前台结构。

## 目录约定

```text
apps/
  web/                 前台站点
  api/                 统一 API 服务
packages/
  shared/              共享类型、schema、种子数据
docs/
  architecture.md      架构说明
  ai-maintenance.md    面向 AI/开发者维护文档
infra/                 预留基础设施配置
```

## 核心设计原则

### 1. 页面必须数据驱动

前台页面不直接写死业务内容，而是依赖 `Page -> Section[] -> SectionRenderer` 结构渲染。

这样做的好处：

- 后续接 CMS 时只需替换数据来源
- 新增模块时不会污染现有页面代码
- AI 修改功能时可以快速定位新增 section 类型

### 2. API 按领域拆分，而不是按控制器随意堆叠

当前 API 模块包含：

- `content`
- `admin`
- `analytics`
- `chat`
- `telegram`
- `health`

后续可继续扩展：

- `articles`
- `media`
- `seo`
- `admin`
- `crm`

### 3. 内容、业务、分析必须分层

- 内容层：页面、文章、媒体、SEO
- 业务层：AI 会话、Telegram lead、预约/表单
- 分析层：访问行为、来源、设备、地区、转化

这三层不能混表、不能混职责，否则后续维护会迅速失控。

## 后续推荐演进路线

### 阶段 2

- 引入正式 CMS，优先 `Strapi`
- API 从本地 JSON 存储切换到 CMS 或 PostgreSQL
- 前台接 API 拉取页面与文章数据
- 落地文章页、列表页、多语言页

### 阶段 3

- 引入 PostgreSQL 持久化业务表
- 接 Redis 队列
- 接 Telegram Bot
- 接 AI 模型服务
- 写入会话、lead、转接记录

### 阶段 4

- 引入分析持久层
- 上报 page view、session、referrer、source、chat、cta 等事件
- Metabase 做运营看板
- 增加线索评分、漏斗分析、落地页对比

## 数据分层建议

### 业务库 PostgreSQL

建议表：

- `site_settings`
- `navigation_items`
- `pages`
- `page_sections`
- `articles`
- `media_assets`
- `chat_sessions`
- `chat_messages`
- `leads`
- `telegram_events`

### 分析库 PostgreSQL 或 ClickHouse

建议表：

- `visitor_sessions`
- `page_views`
- `analytics_events`
- `traffic_sources`
- `geo_dimensions`
- `device_dimensions`

## 部署方式

### 一键部署脚本 `yk.sh`

项目根目录提供 `yk.sh`，安装后会变成全局命令 `yk`。当前版本已经改成“菜单式运维脚本”，重点是避免无脑重复部署。

**运行方式**

```bash
sudo bash yk.sh
yk
```

**当前菜单功能**

1. 检查环境、仓库、PM2、nginx、docker compose 状态
2. 首次部署 / 修复部署
3. 安全更新代码
4. 健康检查
5. 创建打包备份
6. 从备份还原

**首次部署 / 修复部署行为**

- 自动安装 `git`、`curl`、`rsync`、`nginx` 等基础系统依赖
- 仓库不存在时可直接克隆到 `/opt/yakewangye`
- 缺少 `.env` 时会从 `.env.example` 生成
- 会生成或重写项目标准 nginx 配置，确保 `/api` 与 `/uploads` 反代存在且不吞前缀
- 会构建工作区、同步前端静态产物、校正 PM2 启动脚本
- PM2 启动时会显式注入项目 `.env`、`PROJECT_ROOT`、`NODE_ENV`、`API_PORT`
- 可以选择继续申请 Let's Encrypt HTTPS 证书

**健康检查行为**

- 检查本机 API `http://127.0.0.1:<API_PORT>/health`
- 检查本机内容接口 `http://127.0.0.1:<API_PORT>/api/content`
- 如果 nginx 正在运行，再检查本机首页和同域 `/api/content`
- 如果配置了 `VITE_API_BASE_URL`，额外检查该远程 API 的 `/health`

**安全更新代码**

- 只做 `git fetch` + `git pull --ff-only`
- 本地工作区有改动时拒绝继续
- 不会执行 `git reset --hard`
- 不会删除 `data`、`uploads`、`postgres-data` 等本地数据目录

**安全更新行为**

- 拉取最新代码后执行 `pnpm install` 和 `pnpm run build`
- 如果机器没有全局 `pnpm`，`yk.sh` 应该退回到 `corepack pnpm`
- 即使代码已是最新，只要 PM2 进程、API 编译产物或前端静态目录缺失，脚本也会继续执行修复流程
- 如果检测到前端产物，则同步到 `/var/www/yakewangye`
- PM2 会校验当前启动脚本；如果检测到旧的 `ts-node/src/main.ts` 方式，会自动删除并改为真实的 `dist/**/main.js` 编译产物
- PM2 启动不再依赖“当前 shell 恰好带着环境变量”，而是明确加载项目 `.env`
- 如果检测到 nginx 的 `/api` 反代使用了错误的 `proxy_pass .../;` 尾部斜杠，也会自动修正
- 只有检测到已有 nginx 配置和运行中的 nginx 时才会执行 reload
- 如果 PM2 或 nginx 不存在，只提示，不强行部署
- 生产环境必须满足下面两种部署方式之一：
  - nginx 同域反代 `/api` 和 `/uploads` 到 `127.0.0.1:4000`
  - 或者在前端构建前显式设置 `VITE_API_BASE_URL=https://api.example.com`
- `VITE_API_BASE_URL` 是前端构建时变量，构建后的静态文件不会在服务器启动时重新读取 `.env`
- API 的 JSON 数据、管理员配置和上传目录必须解析到项目根目录下的 `data/` 与 `apps/api/uploads/`，不能依赖 `process.cwd() -> ../../` 这种脆弱推导

**备份与还原**

- 备份默认输出到 `/opt/yk-backups`
- 备份内容包括：
  - 项目目录（排除 `.git`、`node_modules`、构建缓存）
  - 前端静态目录
  - nginx 配置
  - PM2 dump 文件（如果存在）
- 还原前会先自动再备份一次当前状态
- 如果检测到 docker compose 里的 `postgres/redis/metabase` 正在运行，还原时会先停再起

**部署产物位置**

| 内容 | 路径 |
|------|------|
| 前端静态文件 | `/var/www/yakewangye` |
| 项目代码 | `/opt/yakewangye` |
| nginx 配置 | `/etc/nginx/sites-available/yakewangye.conf` |
| 全局命令 | `/usr/local/bin/yk` |

## 本地开发方式

### 启动依赖服务

```bash
cp .env.example .env
corepack pnpm install
docker compose up -d
```

如果本机 Docker 守护进程未启动，`docker compose up -d` 会失败，这是环境问题，不是仓库代码问题。

### 启动应用

```bash
corepack pnpm run dev
```

前台地址：

- `http://localhost:3000`
- `http://localhost:3000/admin`

API 地址：

- `http://localhost:4000/health`
- `http://localhost:4000/api/content/pages/home`
- `http://localhost:4000/api/admin/content`

Metabase 地址：

- `http://localhost:3001`

## 当前实现与目标架构的关系

当前前台没有直接使用 Next.js，而是先用 React + Vite 保证本地开发链稳定。理由很简单：

- 当前阶段重点是把模块化页面、共享 schema、API 边界和开发文档先固定下来
- 在当前机器的 `npm` 环境里，Next 安装链出现了多次损坏与不完整落盘
- 这不会影响后续再切到 Next，因为页面结构已经是数据驱动的

也就是说，当前仓库已经把“业务边界”和“模块化结构”定好，后续前台运行时可以替换，但不需要重做内容模型和 API 规划。

## 当前前台呈现方式

当前官网首页已经改为“长单页宣传页”模式，而不是依赖用户频繁点击二级页面：

- 首屏 Hero
- AI 导诊流程说明
- 服务项目
- 医生团队
- 价格说明
- 图册视频
- 文章内容
- 底部联系转化区

这个顺序更适合手机端宣传、广告落地和 Telegram 转人工。

## 当前后台能力

现在后台已经支持：

- 修改站点设置
- 修改首页 Hero 与 SEO
- 新增、编辑、删除文章
- 新增、编辑、删除医生
- 新增、编辑、删除服务
- 新增、编辑、删除价格项
- 新增、编辑、删除图册/视频条目
- 新增、编辑、删除自定义页面
- 图片上传到本地目录
- AI 提供商、接口地址、模型、提示词配置
- 服务器端聊天记录保存与查看
- 移动端横向 tab 导航
- 移动端底部固定操作条
- 列表型内容的折叠式编辑卡片

当前后台还没有做：

- 角色权限
- 富文本编辑器
- 多语言内容拆分
- 拖拽排序
- API Key 加密存储

这些属于下一阶段增强项，不影响现在先验证内容运营工作流。

## 当前后台鉴权

当前后台已经补上最小可用的管理员鉴权和首次初始化：

- `GET /api/admin/status`
- `POST /api/admin/setup`
- `POST /api/admin/login`
- `GET /api/admin/me`
- `GET /api/admin/content`
- `PUT /api/admin/content`
- `POST /api/admin/upload`
- `GET /api/chat/sessions`

其中后 4 个接口都要求 `Authorization: Bearer <token>`。

初始化规则如下：

- 如果配置了 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，后台直接使用环境变量账号
- 如果没有配置环境变量，第一次打开 `/admin` 会进入初始化页面
- 初始化成功后，管理员信息会写入 `data/admin-config.json`

环境变量仍然支持：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`

正式环境必须覆盖这些默认值。

文件型管理员密码现在兼容两种格式：

- 新初始化账号使用 `scrypt` 加盐哈希。
- 老版本 SHA256 派生哈希仍可登录，便于平滑升级。

生产环境必须设置高强度 `ADMIN_TOKEN_SECRET`，否则 token 签名和旧哈希派生都只适合开发环境。

## AI 问诊配置与聊天存储

当前 AI 配置项包括：

- provider
- endpoint
- apiKey
- model
- systemPrompt
- triagePrompt
- leadPrompt
- fallbackReply
- temperature
- maxTokens

当前问诊服务端已经做了几层限制：

- `/api/chat/triage` 对单条消息做长度限制，并按 IP + visitorId 做基础限流
- `ai-gateway` 先用本地关键词白名单/黑名单判断话题，越界内容不调用外部模型
- 允许话题只覆盖牙齿/口腔问题、牙科治疗、门诊/医院信息、医生与接待流程、价格预约、跨境到诊、路线翻译、住宿环境和 Telegram 转人工
- 中文、俄语、英语会按前端传入的 `language` 生成本地兜底话术，并要求模型使用同一语言回复
- `openai_compatible` 使用 Chat Completions 格式；`openai_responses` 使用 Responses 格式，都会优先要求模型返回结构化 JSON，再由服务端解析 triage
- 模型不可用或输出不可解析时，会退回本地牙科问诊兜底回复，不把异常直接暴露给访客

聊天记录当前存储在服务端 [`data/chat-sessions.json`](/Users/ayaya/Code/yakewangye/data/chat-sessions.json)，内容后台存储在 [`data/content.json`](/Users/ayaya/Code/yakewangye/data/content.json)。这两个 JSON 存储现在都已经通过 repository 抽象包了一层，后续切 PostgreSQL 时优先替换：

- [`apps/api/src/lib/storage/content-repository.ts`](/Users/ayaya/Code/yakewangye/apps/api/src/lib/storage/content-repository.ts)
- [`apps/api/src/lib/storage/chat-repository.ts`](/Users/ayaya/Code/yakewangye/apps/api/src/lib/storage/chat-repository.ts)

这样可以尽量避免直接重写路由层。

当前保存位置：

- AI 配置：`data/content.json`
- 聊天记录：`data/chat-sessions.json`
- 访问日志：`data/visitor-logs.json`
- 素材库索引：`data/media-library.json`
- 上传文件：`data/uploads/`

为什么聊天记录放服务端：

- 浏览器本地存储不适合长期留档
- 服务端存储才能在部署后统一查看全部访客会话
- 后续接 Telegram 转人工、线索评分、分析面板都需要服务端历史数据

当前实现是本地文件存储，适合开发验证。正式环境建议迁移到 PostgreSQL。

## AI 改站与素材库分析

后台当前支持两类 AI 网站维护能力：

1. `AI 改内容`
   - 纯文字描述改站
   - 0 到多张截图 + 描述改站
   - 外部 AI 文案包导入/导出
   - 所有结果先进入差异预览，由管理员确认后应用

2. `素材库管理`
   - 每个素材可生成 `aiAnalysis`
   - 图片优先走视觉模型
   - 视频当前走元数据分析
   - AI 改站时读取素材描述、标签、适用范围、建议放置位置

服务端白名单限制：

- 只允许 AI 修改 `admin-ai-gateway.ts` 中 `buildAllowedUpdates` 列出的 path
- 媒体字段只能引用素材库已有 URL
- 图册素材会同步校正 `mediaType`
- 电话、地址、Telegram、API Key、模型配置、id、slug、href 不允许被 AI 改写

## 访问日志

访问日志由前台自动上报，后台 `访问日志` 面板读取。

当前记录：

- visitorId / sessionId
- 页面路径、标题、来源
- 停留时间
- IP、User-Agent、浏览器、系统、设备类型
- 语言、时区、屏幕和窗口尺寸

后台页面不会写入访客日志。生产环境必须在隐私政策中说明 IP、浏览器和访问行为记录。
