#!/usr/bin/env bash
# =============================================================
#  yk — 牙科网站一键部署 / 更新脚本
#  用法:
#    首次部署:  sudo bash yk.sh
#    日常更新:  yk          (安装后直接用命令)
# =============================================================
set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────
REPO_URL="https://github.com/AYAYAnotYAYAY/yakewangye.git"
APP_DIR="/opt/yakewangye"
CERT_DIR="/root/ygkkkca"
CERT_CRT="${CERT_DIR}/cert.crt"
CERT_KEY="${CERT_DIR}/private.key"
DOMAIN_PRIMARY="proclinicheihe.ru"
DOMAIN_SECONDARY="prodentalheihe.ru"
NGINX_CONF_NAME="yakewangye"
WEB_ROOT="/var/www/yakewangye"
API_PORT="4000"
NODE_MIN_MAJOR=20
SCRIPT_INSTALL_PATH="/usr/local/bin/yk"

# ── 颜色 ──────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

# ── Root 检查 ─────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "请用 root 运行: sudo bash yk.sh"
  exit 1
fi

# ── --reset 选项：清除所有配置，保留证书，推倒重来 ────────────
if [[ "${1:-}" == "--reset" ]]; then
  step "重置：清除所有配置（证书保留）"

  # 停止并删除 PM2 进程
  if command -v pm2 &>/dev/null; then
    pm2 delete yakewangye-api 2>/dev/null || true
    pm2 save --force >/dev/null 2>&1 || true
    info "PM2 进程已清除"
  fi

  # 删除 nginx 配置
  rm -f "/etc/nginx/sites-enabled/${NGINX_CONF_NAME}.conf"
  rm -f "/etc/nginx/sites-available/${NGINX_CONF_NAME}.conf"
  # 恢复 default 站点（避免 nginx 无配置报错）
  if [[ -f /etc/nginx/sites-available/default ]]; then
    ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
  fi
  nginx -t -q 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  info "Nginx 配置已清除"

  # 删除网站静态文件
  rm -rf "${WEB_ROOT}"
  info "静态文件已清除: ${WEB_ROOT}"

  # 删除项目代码
  rm -rf "${APP_DIR}"
  info "项目代码已清除: ${APP_DIR}"

  # 删除 .env（如果在项目目录外有备份则跳过）
  echo ""
  success "重置完成，证书目录 ${CERT_DIR} 已保留"
  echo -e "  现在直接运行 ${BOLD}yk${RESET} 重新部署"
  echo ""
  exit 0
fi

# ── 自安装为 yk 命令 ──────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" != "${SCRIPT_INSTALL_PATH}" ]]; then
  info "将脚本安装为全局命令 yk ..."
  cp -f "${BASH_SOURCE[0]}" "${SCRIPT_INSTALL_PATH}"
  chmod +x "${SCRIPT_INSTALL_PATH}"
  success "已安装: 以后直接运行 'yk' 即可"
fi

# ═════════════════════════════════════════════════════════════
step "1 / 7  检查系统依赖"
# ═════════════════════════════════════════════════════════════

if ! command -v apt-get &>/dev/null; then
  error "仅支持 Debian / Ubuntu (apt)"
  exit 1
fi

# 修复可能损坏的 backports 源，避免 apt update 报错
_disable_backports() {
  find /etc/apt/sources.list.d/ -name "*.list" \
    -exec sed -i 's|^\(deb .*bullseye-backports.*\)|# \1|g' {} \; 2>/dev/null || true
  sed -i 's|^\(deb .*bullseye-backports.*\)|# \1|g' /etc/apt/sources.list 2>/dev/null || true
}
if grep -rq "^deb .*bullseye-backports" /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null; then
  info "检测到 bullseye-backports 源，禁用以避免 apt 报错 ..."
  _disable_backports
fi

info "更新软件包索引 ..."
apt-get update -y -qq 2>&1 | grep -v "^W:" || true

PKGS_NEEDED=()
for pkg in git curl nginx; do
  command -v "$pkg" &>/dev/null || PKGS_NEEDED+=("$pkg")
done

if [[ ${#PKGS_NEEDED[@]} -gt 0 ]]; then
  info "安装缺失包: ${PKGS_NEEDED[*]}"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${PKGS_NEEDED[@]}"
fi

# Node.js
if ! command -v node &>/dev/null || [[ "$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")" -lt "$NODE_MIN_MAJOR" ]]; then
  info "安装 Node.js ${NODE_MIN_MAJOR}.x ..."
  # 添加 nodesource 源（忽略其内部 apt update 的警告）
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x" | bash - 2>&1 | grep -v "^W:" || true
  # setup 脚本可能重新触发 backports 报错，再次禁用
  _disable_backports
  apt-get update -y -qq 2>&1 | grep -v "^W:" || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [[ "$NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ]]; then
  error "Node.js 版本过低 (当前 v${NODE_MAJOR}，需要 v${NODE_MIN_MAJOR}+)，请手动运行: curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x | bash - && apt-get install -y nodejs"
  exit 1
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "安装 pnpm ..."
  npm install -g pnpm --silent
fi

success "依赖检查完成 (node $(node -v), pnpm $(pnpm -v))"

# ═════════════════════════════════════════════════════════════
step "2 / 7  拉取 / 更新代码"
# ═════════════════════════════════════════════════════════════

if [[ -d "${APP_DIR}/.git" ]]; then
  info "已有仓库，执行 git pull ..."
  git -C "${APP_DIR}" fetch --all -q
  git -C "${APP_DIR}" reset --hard origin/main -q
  success "代码已更新到最新 main 分支"
else
  info "首次克隆仓库到 ${APP_DIR} ..."
  git clone --depth=1 "${REPO_URL}" "${APP_DIR}"
  success "克隆完成"
fi

# ═════════════════════════════════════════════════════════════
step "3 / 7  检查 SSL 证书"
# ═════════════════════════════════════════════════════════════

CERT_OK=false
if [[ -f "${CERT_CRT}" && -f "${CERT_KEY}" ]]; then
  success "证书已存在: ${CERT_DIR}"
  CERT_OK=true
else
  warn "未找到证书文件:"
  warn "  ${CERT_CRT}"
  warn "  ${CERT_KEY}"
  echo ""
  read -r -p "$(echo -e "${YELLOW}是否现在自动申请 Let's Encrypt 证书？[y/N]${RESET} ")" APPLY_CERT
  if [[ "${APPLY_CERT,,}" == "y" ]]; then
    # 安装 certbot
    if ! command -v certbot &>/dev/null; then
      info "安装 certbot ..."
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx
    fi

    read -r -p "$(echo -e "${CYAN}请输入 Let's Encrypt 邮箱: ${RESET}")" LE_EMAIL
    if [[ -z "${LE_EMAIL}" ]]; then
      error "邮箱不能为空，跳过证书申请，将使用 HTTP 模式"
    else
      info "申请证书 (${DOMAIN_PRIMARY}, ${DOMAIN_SECONDARY}) ..."
      # 先用 HTTP 模式启动 nginx 以通过 ACME 验证
      _tmp_conf="/etc/nginx/sites-available/_yk_tmp.conf"
      cat > "${_tmp_conf}" <<TMPEOF
server {
    listen 80;
    server_name ${DOMAIN_PRIMARY} ${DOMAIN_SECONDARY};
    root /var/www/html;
    location /.well-known/acme-challenge/ { root /var/www/html; }
}
TMPEOF
      ln -sfn "${_tmp_conf}" "/etc/nginx/sites-enabled/_yk_tmp.conf"
      nginx -t -q && systemctl reload nginx

      certbot certonly --nginx \
        -d "${DOMAIN_PRIMARY}" -d "${DOMAIN_SECONDARY}" \
        --agree-tos --non-interactive -m "${LE_EMAIL}" \
        --cert-name "${NGINX_CONF_NAME}"

      # 复制到约定目录
      mkdir -p "${CERT_DIR}"
      LE_LIVE="/etc/letsencrypt/live/${DOMAIN_PRIMARY}"
      cp -f "${LE_LIVE}/fullchain.pem" "${CERT_CRT}"
      cp -f "${LE_LIVE}/privkey.pem"   "${CERT_KEY}"
      chmod 600 "${CERT_KEY}"

      # 自动续期 hook
      DEPLOY_HOOK="/etc/letsencrypt/renewal-hooks/deploy/yk-copy-cert.sh"
      cat > "${DEPLOY_HOOK}" <<HOOKEOF
#!/bin/bash
cp -f /etc/letsencrypt/live/${DOMAIN_PRIMARY}/fullchain.pem ${CERT_CRT}
cp -f /etc/letsencrypt/live/${DOMAIN_PRIMARY}/privkey.pem   ${CERT_KEY}
chmod 600 ${CERT_KEY}
systemctl reload nginx
HOOKEOF
      chmod +x "${DEPLOY_HOOK}"

      rm -f "/etc/nginx/sites-enabled/_yk_tmp.conf" "${_tmp_conf}"
      CERT_OK=true
      success "证书申请成功，已复制到 ${CERT_DIR}"
    fi
  else
    warn "跳过证书申请，将以 HTTP 模式部署（不推荐用于生产）"
  fi
fi

# ═════════════════════════════════════════════════════════════
step "4 / 7  构建前端"
# ═════════════════════════════════════════════════════════════

cd "${APP_DIR}"

# 生成 .env（如果不存在）
if [[ ! -f ".env" ]]; then
  info "从 .env.example 生成 .env ..."
  cp .env.example .env
  warn "请检查并修改 ${APP_DIR}/.env 中的生产配置"
fi

info "安装依赖 (pnpm install) ..."
pnpm install --frozen-lockfile --silent

info "构建前端 (pnpm --filter web build) ..."
pnpm --filter web build

# 前端产物目录
WEB_DIST="${APP_DIR}/apps/web/dist"
if [[ ! -d "${WEB_DIST}" ]]; then
  error "前端构建产物不存在: ${WEB_DIST}"
  exit 1
fi

success "前端构建完成"

# ═════════════════════════════════════════════════════════════
step "5 / 7  部署静态文件"
# ═════════════════════════════════════════════════════════════

mkdir -p "${WEB_ROOT}"
rsync -a --delete "${WEB_DIST}/" "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"
success "静态文件已同步到 ${WEB_ROOT}"

# ═════════════════════════════════════════════════════════════
step "6 / 7  配置 Nginx"
# ═════════════════════════════════════════════════════════════

NGINX_AVAIL="/etc/nginx/sites-available/${NGINX_CONF_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_CONF_NAME}.conf"

if [[ "${CERT_OK}" == "true" ]]; then
  info "写入 HTTPS nginx 配置 ..."
  cat > "${NGINX_AVAIL}" <<NGINXEOF
# 自动生成 by yk.sh — 勿手动修改
server {
    listen 80;
    server_name ${DOMAIN_PRIMARY} ${DOMAIN_SECONDARY};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN_PRIMARY} ${DOMAIN_SECONDARY};

    ssl_certificate     ${CERT_CRT};
    ssl_certificate_key ${CERT_KEY};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    root  ${WEB_ROOT};
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API 反代
    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # 静态资源缓存
    location ~* \.(css|js|woff2?|ttf|svg|ico|png|jpg|jpeg|webp|gif)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        access_log off;
    }

    location = /robots.txt  { try_files \$uri =404; }
    location = /sitemap.xml { try_files \$uri =404; }

    # 安全头
    add_header X-Frame-Options       "SAMEORIGIN"   always;
    add_header X-Content-Type-Options "nosniff"     always;
    add_header Referrer-Policy       "strict-origin" always;
}
NGINXEOF
else
  info "写入 HTTP nginx 配置 ..."
  cat > "${NGINX_AVAIL}" <<NGINXEOF
# 自动生成 by yk.sh — 勿手动修改 (HTTP 模式)
server {
    listen 80;
    server_name ${DOMAIN_PRIMARY} ${DOMAIN_SECONDARY};

    root  ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ~* \.(css|js|woff2?|ttf|svg|ico|png|jpg|jpeg|webp|gif)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        access_log off;
    }

    location = /robots.txt  { try_files \$uri =404; }
    location = /sitemap.xml { try_files \$uri =404; }
}
NGINXEOF
fi

ln -sfn "${NGINX_AVAIL}" "${NGINX_ENABLED}"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx -q
systemctl reload nginx
success "Nginx 配置已应用"

# ═════════════════════════════════════════════════════════════
step "7 / 7  启动后端 API (PM2)"
# ═════════════════════════════════════════════════════════════

# 安装 PM2
if ! command -v pm2 &>/dev/null; then
  info "安装 PM2 ..."
  npm install -g pm2 --silent
fi

cd "${APP_DIR}"
info "构建后端 API ..."
pnpm --filter api build 2>/dev/null || warn "API 构建跳过（可能无需编译）"

PM2_APP="yakewangye-api"
if pm2 describe "${PM2_APP}" &>/dev/null; then
  info "重启 API 进程 ..."
  pm2 restart "${PM2_APP}" --update-env
else
  info "首次启动 API 进程 ..."
  pm2 start "${APP_DIR}/apps/api/dist/main.js" \
    --name "${PM2_APP}" \
    --cwd "${APP_DIR}" \
    --env production \
    -- 2>/dev/null || \
  pm2 start "${APP_DIR}/apps/api/src/main.ts" \
    --name "${PM2_APP}" \
    --interpreter "node" \
    --interpreter-args "--loader ts-node/esm" \
    --cwd "${APP_DIR}"
fi

pm2 save --force >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
success "API 进程已启动"

# ═════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║         ✅  部署完成！                        ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
if [[ "${CERT_OK}" == "true" ]]; then
  echo -e "  🌐  https://${DOMAIN_PRIMARY}"
  echo -e "  🌐  https://${DOMAIN_SECONDARY}"
else
  echo -e "  🌐  http://${DOMAIN_PRIMARY}  ${YELLOW}(HTTP 模式，建议配置证书)${RESET}"
fi
echo -e "  📁  网站目录: ${WEB_ROOT}"
echo -e "  📁  项目目录: ${APP_DIR}"
echo -e "  🔑  证书目录: ${CERT_DIR}"
echo -e "  🔧  API 端口: ${API_PORT}"
echo ""
echo -e "  下次更新只需运行: ${BOLD}yk${RESET}"
echo ""
