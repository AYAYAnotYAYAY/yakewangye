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
- 本地可用的 Admin 后台
- 可视化首页文字编辑
- AI 问诊、AI 改内容、截图/多图改站
- 素材库管理与素材 AI 描述
- 访问日志面板
- 后台备份恢复与 `yk.sh` 全量备份
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
- API 健康检查：`http://localhost:4000/health`
- Metabase：`http://localhost:3001`

## 生产部署注意事项

- 前端静态站点在生产环境有两种合法接法：
  - 同域部署：nginx 把 `/api` 和 `/uploads` 反代到 API 服务，例如 `http://127.0.0.1:4000`
  - 异域部署：在执行 `pnpm run build` 之前设置 `VITE_API_BASE_URL=https://你的-api-域名`
- `VITE_API_BASE_URL` 是 Vite 构建时变量。静态文件已经构建完成后，再去服务器上修改 `.env` 不会自动改变前端请求地址。
- 根目录的 `deploy.sh` 只适合“静态文件 + 已存在 API 服务”的场景；如果你需要一并校正 PM2 / nginx / API 编译产物、环境变量和健康检查，应该使用 `yk.sh`。
- `yk.sh` 现在支持首次部署/修复部署、健康检查、安全更新、备份和还原，适合作为线上默认运维入口。
- 线上建议显式设置 `YK_DATA_DIR=/你的独立数据目录`，把内容 JSON、管理员配置、聊天记录、素材库索引和上传文件都放到代码目录外。这样更新代码不会覆盖已有数据。
- 也可以在仓库根目录创建 git 忽略的 `local/project-paths.json`，内容例如 `{"dataRoot":"/opt/yakewangye-local"}`。

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
- [后台运营与 AI 使用说明](./docs/admin-operations.md)

## 说明

- 根目录仍保留原始 `index.html` 作为历史参考页面，但新的开发入口已经切换到 `apps/web`。
- 当前前台运行时为 `React + Vite`，目的是先保证工作区稳定可跑；生产 SSR 与更强 SEO 能力后续可演进到 `Next.js`。
- 当前后台是本地 JSON CMS 最小版，但数据目录已经支持独立配置。默认会优先使用 `YK_DATA_DIR` 或 `local/project-paths.json`，否则回退到仓库同级目录 `../yakewangye-local/`。
- 内容、AI 配置、管理员配置、聊天记录、素材库索引和上传文件都会写入独立数据目录，而不是写死在代码仓库里。
- 老版本放在仓库内的 `data/` 与 `apps/api/uploads/` 会在首次启动时自动迁移到新的本地数据目录。
- 后台所有媒体字段都支持三种来源：直接填 URL、本地上传、从素材库选择；上传后的图片和视频会自动进入素材库复用。
- 素材库可以给每个图片/视频保存 AI 描述和适用范围，AI 改站时会读取这些分析结果来选择素材。
- 访问日志会记录前台访客 IP、浏览器、设备、来源和停留时间；正式上线请同步隐私说明。
