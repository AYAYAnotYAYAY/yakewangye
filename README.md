# 泉寓门诊平台工作区

这是一个从静态牙科官网重构而来的平台型仓库，目标是逐步演进为：

- 模块化多语言官网
- CMS 内容管理
- AI 导诊与 Telegram 转接
- SEO 与文章运营
- 访客行为分析与可视化面板

## 当前已完成

- React + Vite 前台骨架
- Fastify API 骨架
- 本地可用的 Admin 后台最小版
- 共享 schema / 种子数据
- Docker 本地依赖（PostgreSQL / Redis / Metabase）
- 架构文档与 AI 维护文档

## 快速开始

```bash
cp .env.example .env
corepack pnpm install
docker compose up -d
corepack pnpm run dev
```

## 本地地址

- 前台：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`
- API：`http://localhost:4000/health`
- Metabase：`http://localhost:3001`

## 目录

```text
apps/
  api/
  web/
packages/
  shared/
docs/
```

## 文档

- [架构说明](./docs/architecture.md)
- [AI 维护说明](./docs/ai-maintenance.md)

## 说明

- 根目录仍保留原始 `index.html` 作为历史参考页面，但新的开发入口已经切换到 `apps/web`。
- 当前前台运行时为 `React + Vite`，目的是先保证工作区稳定可跑；生产 SSR 与更强 SEO 能力后续可演进到 `Next.js`。
- 当前后台是本地 JSON CMS 最小版，内容保存在 [`data/content.json`](./data/content.json)，上传文件保存在 `apps/api/uploads/`。
- AI 配置也保存在 [`data/content.json`](./data/content.json) 的 `aiConfig` 字段。
- 聊天记录当前保存在 [`data/chat-sessions.json`](./data/chat-sessions.json)。
