#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/AYAYAnotYAYAY/yakewangye.git"
REPO_BRANCH="main"
APP_DIR="/opt/yakewangye"
WEB_ROOT="/var/www/yakewangye"
NGINX_CONF_NAME="yakewangye"
NGINX_CONF="/etc/nginx/sites-available/${NGINX_CONF_NAME}.conf"
PM2_APP="yakewangye-api"
SCRIPT_INSTALL_PATH="/usr/local/bin/yk"
BACKUP_ROOT="/opt/yk-backups"
DEFAULT_API_PORT="4000"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    error "请用 root 运行: sudo bash yk.sh"
    exit 1
  fi
}

install_self() {
  if [[ "${BASH_SOURCE[0]}" != "${SCRIPT_INSTALL_PATH}" ]]; then
    cp -f "${BASH_SOURCE[0]}" "${SCRIPT_INSTALL_PATH}"
    chmod +x "${SCRIPT_INSTALL_PATH}"
    success "已安装全局命令: yk"
  fi
}

pause() {
  echo ""
  read -r -p "按回车继续..." _
}

ask_yes_no() {
  local prompt="${1}"
  local answer=""
  read -r -p "$(echo -e "${YELLOW}${prompt} [y/N] ${RESET}")" answer
  [[ "${answer,,}" == "y" ]]
}

prompt_value() {
  local prompt="${1}"
  local default_value="${2:-}"
  local answer=""

  if [[ -n "${default_value}" ]]; then
    read -r -p "$(echo -e "${CYAN}${prompt} [默认: ${default_value}] ${RESET}")" answer
    printf '%s' "${answer:-${default_value}}"
    return 0
  fi

  read -r -p "$(echo -e "${CYAN}${prompt} ${RESET}")" answer
  printf '%s' "${answer}"
}

has_repo() {
  [[ -d "${APP_DIR}/.git" ]]
}

has_nginx_conf() {
  [[ -f "${NGINX_CONF}" ]]
}

has_pm2() {
  command_exists pm2
}

has_pnpm_runner() {
  command_exists pnpm || command_exists corepack
}

pnpm_version() {
  if command_exists pnpm; then
    pnpm -v
    return 0
  fi

  if command_exists corepack; then
    corepack pnpm -v
    return 0
  fi

  return 1
}

run_pnpm() {
  if command_exists pnpm; then
    pnpm "$@"
    return 0
  fi

  corepack pnpm "$@"
}

docker_compose_available() {
  command_exists docker && [[ -f "${APP_DIR}/docker-compose.yml" ]]
}

docker_services_running() {
  docker_compose_available && (cd "${APP_DIR}" && docker compose ps --status running --services 2>/dev/null | grep -q .)
}

nginx_installed() {
  command_exists nginx
}

nginx_active() {
  command_exists systemctl && systemctl is-active --quiet nginx
}

ensure_debian_family() {
  if ! command_exists apt-get; then
    error "当前脚本仅支持 Debian/Ubuntu 系。"
    return 1
  fi
}

install_apt_packages() {
  local packages=("$@")
  if [[ ${#packages[@]} -eq 0 ]]; then
    return 0
  fi

  ensure_debian_family || return 1
  info "安装系统依赖: ${packages[*]}"
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
}

ensure_basic_system_packages() {
  local missing=()

  command_exists git || missing+=("git")
  command_exists curl || missing+=("curl")
  command_exists rsync || missing+=("rsync")
  nginx_installed || missing+=("nginx")

  if [[ ${#missing[@]} -gt 0 ]]; then
    install_apt_packages "${missing[@]}"
  else
    success "基础系统依赖已满足"
  fi
}

ensure_pm2_installed() {
  if has_pm2; then
    success "pm2 已安装"
    return 0
  fi

  if ! command_exists npm; then
    warn "未检测到 npm，无法自动安装 pm2"
    return 1
  fi

  if ask_yes_no "未检测到 pm2，是否执行 npm install -g pm2？"; then
    npm install -g pm2
    success "pm2 已安装"
    return 0
  fi

  warn "已跳过 pm2 安装"
  return 1
}

read_env_value() {
  local file="${1}"
  local key="${2}"

  [[ -f "${file}" ]] || return 1

  awk -F= -v key="${key}" '
    $0 !~ /^[[:space:]]*#/ && $1 == key {
      sub(/^[^=]*=/, "", $0)
      print $0
      exit
    }
  ' "${file}" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

app_env_file() {
  printf '%s' "${APP_DIR}/.env"
}

load_app_env() {
  local env_file
  env_file="$(app_env_file)"

  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
  fi
}

get_api_port() {
  local env_file port
  env_file="$(app_env_file)"
  port="$(read_env_value "${env_file}" "API_PORT" 2>/dev/null || true)"
  printf '%s' "${port:-${DEFAULT_API_PORT}}"
}

get_vite_api_base_url() {
  local env_file value
  env_file="$(app_env_file)"
  value="$(read_env_value "${env_file}" "VITE_API_BASE_URL" 2>/dev/null || true)"
  printf '%s' "${value}"
}

ensure_repo_exists() {
  if has_repo; then
    return 0
  fi

  if ! command_exists git; then
    error "未检测到 git，无法克隆仓库"
    return 1
  fi

  warn "未检测到仓库: ${APP_DIR}"
  if ask_yes_no "是否先克隆仓库到 ${APP_DIR}？"; then
    mkdir -p "$(dirname "${APP_DIR}")"
    git clone --branch "${REPO_BRANCH}" --depth=1 "${REPO_URL}" "${APP_DIR}"
    success "仓库已克隆"
    return 0
  fi

  return 1
}

ensure_env_file() {
  if [[ -f "${APP_DIR}/.env" ]]; then
    success ".env 已存在"
    return 0
  fi

  if [[ -f "${APP_DIR}/.env.example" ]]; then
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    warn "未检测到 .env，已由 .env.example 生成，请马上检查生产配置"
    return 0
  fi

  warn "未找到 .env.example，无法自动生成 .env"
  return 1
}

current_server_names() {
  if ! has_nginx_conf; then
    return 1
  fi

  awk '
    $1 == "server_name" {
      for (i = 2; i <= NF; i++) {
        gsub(/;$/, "", $i)
        names = names (names ? " " : "") $i
      }
      print names
      exit
    }
  ' "${NGINX_CONF}"
}

write_nginx_conf() {
  local server_names="${1}"
  local api_port="${2}"

  mkdir -p "$(dirname "${NGINX_CONF}")"

  cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${server_names};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${api_port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:${api_port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /robots.txt {
        try_files \$uri =404;
    }

    location = /sitemap.xml {
        try_files \$uri =404;
    }

    location = /favicon.svg {
        try_files \$uri =404;
    }

    location ~* \.(css|js|jpg|jpeg|png|gif|webp|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        access_log off;
    }
}
EOF
}

activate_nginx_site() {
  mkdir -p /etc/nginx/sites-enabled
  ln -sfn "${NGINX_CONF}" "/etc/nginx/sites-enabled/${NGINX_CONF_NAME}.conf"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  command_exists systemctl && systemctl enable nginx >/dev/null 2>&1 || true
  if nginx_active; then
    systemctl reload nginx
    success "nginx 已重载"
  else
    command_exists systemctl && systemctl start nginx >/dev/null 2>&1 || true
    nginx_active && success "nginx 已启动" || warn "nginx 尚未运行，请手动检查"
  fi
}

ensure_nginx_api_proxy() {
  if ! has_nginx_conf; then
    return 1
  fi

  local api_port server_names changed=false
  api_port="$(get_api_port)"
  server_names="$(current_server_names || true)"

  if ! grep -q 'location /api/' "${NGINX_CONF}" || ! grep -q 'location /uploads/' "${NGINX_CONF}" || grep -Eq 'proxy_pass[[:space:]]+http://(127\.0\.0\.1|localhost):[0-9]+/;' "${NGINX_CONF}"; then
    warn "检测到 nginx 配置缺少 /api 或 /uploads 代理，或 proxy_pass 写法错误，正在重写为项目标准配置"
    write_nginx_conf "${server_names:-_}" "${api_port}"
    changed=true
  fi

  if [[ "${changed}" == "true" ]]; then
    success "nginx 站点配置已修正"
  fi

  return 0
}

pm2_app_exists() {
  has_pm2 && pm2 describe "${PM2_APP}" >/dev/null 2>&1
}

pm2_current_script() {
  if ! pm2_app_exists; then
    return 1
  fi

  pm2 jlist 2>/dev/null | node -e '
    const fs = require("fs");
    const input = fs.readFileSync(0, "utf8");
    const apps = JSON.parse(input || "[]");
    const target = apps.find((app) => app.name === process.argv[1]);
    if (target?.pm2_env?.pm_exec_path) {
      process.stdout.write(String(target.pm2_env.pm_exec_path));
    }
  ' "${PM2_APP}"
}

find_api_entrypoint() {
  local candidates=(
    "${APP_DIR}/apps/api/dist/main.js"
    "${APP_DIR}/apps/api/dist/apps/api/src/main.js"
    "${APP_DIR}/apps/api/dist/src/main.js"
  )

  local candidate=""
  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done

  candidate="$(find "${APP_DIR}/apps/api/dist" -type f -path '*/main.js' 2>/dev/null | head -n 1 || true)"
  if [[ -n "${candidate}" ]]; then
    printf '%s' "${candidate}"
    return 0
  fi

  return 1
}

ensure_pm2_api_process() {
  local target_script api_port
  target_script="$(find_api_entrypoint || true)"
  api_port="$(get_api_port)"

  if [[ -z "${target_script}" || ! -f "${target_script}" ]]; then
    warn "未找到 API 编译产物，已检查 apps/api/dist 下常见 main.js 路径"
    return 1
  fi

  ensure_pm2_installed || return 1

  load_app_env

  if pm2_app_exists; then
    local current_script=""
    current_script="$(pm2_current_script || true)"

    if [[ "${current_script}" != "${target_script}" ]]; then
      warn "检测到旧的 PM2 启动命令: ${current_script:-unknown}"
      warn "将删除旧进程并改为真实 dist/main.js 启动"
      pm2 delete "${PM2_APP}" || true
      PROJECT_ROOT="${APP_DIR}" NODE_ENV=production API_PORT="${api_port}" pm2 start "${target_script}" --name "${PM2_APP}" --cwd "${APP_DIR}"
    else
      info "检测到 PM2 进程已存在，执行带环境变量更新的重启 ..."
      PROJECT_ROOT="${APP_DIR}" NODE_ENV=production API_PORT="${api_port}" pm2 restart "${PM2_APP}" --update-env
    fi
  else
    info "未检测到 PM2 进程，使用 dist/main.js 启动 API ..."
    PROJECT_ROOT="${APP_DIR}" NODE_ENV=production API_PORT="${api_port}" pm2 start "${target_script}" --name "${PM2_APP}" --cwd "${APP_DIR}"
  fi

  pm2 save --force >/dev/null 2>&1 || true
  success "PM2 API 进程已校正并保存"
}

ensure_node_build_toolchain() {
  if ! command_exists node; then
    error "未检测到 Node.js，无法构建项目。"
    return 1
  fi

  if ! has_pnpm_runner; then
    error "未检测到 pnpm/corepack，无法构建项目。"
    return 1
  fi

  return 0
}

build_workspace() {
  ensure_node_build_toolchain || return 1
  cd "${APP_DIR}"
  info "安装依赖 ..."
  run_pnpm install --frozen-lockfile
  info "执行构建 ..."
  run_pnpm run build
}

sync_web_dist() {
  if [[ ! -d "${APP_DIR}/apps/web/dist" ]]; then
    warn "未找到前端产物目录，跳过静态文件同步"
    return 1
  fi

  mkdir -p "${WEB_ROOT}"
  rsync -a --delete "${APP_DIR}/apps/web/dist/" "${WEB_ROOT}/"

  if id -u www-data >/dev/null 2>&1; then
    chown -R www-data:www-data "${WEB_ROOT}"
  fi

  success "前端产物已同步到 ${WEB_ROOT}"
}

check_url() {
  local label="${1}"
  local url="${2}"

  if ! command_exists curl; then
    warn "未检测到 curl，跳过 ${label} 检查"
    return 1
  fi

  if curl --location --insecure --silent --show-error --fail --max-time 10 "${url}" >/dev/null; then
    success "${label}: ${url}"
    return 0
  fi

  warn "${label} 失败: ${url}"
  return 1
}

run_health_checks() {
  step "健康检查"

  local api_port vite_api_base_url failed=false
  api_port="$(get_api_port)"
  vite_api_base_url="$(get_vite_api_base_url)"

  check_url "本机 API 健康检查" "http://127.0.0.1:${api_port}/health" || failed=true
  check_url "本机内容接口" "http://127.0.0.1:${api_port}/api/content" || failed=true

  if nginx_active; then
    check_url "本机前台首页" "http://127.0.0.1/" || failed=true
    check_url "本机前台内容接口" "http://127.0.0.1/api/content" || failed=true
  else
    warn "nginx 未运行，跳过本机前台入口检查"
  fi

  if [[ -n "${vite_api_base_url}" ]]; then
    check_url "前端配置的远程 API" "${vite_api_base_url}/health" || failed=true
  fi

  if [[ "${failed}" == "true" ]]; then
    warn "健康检查存在失败项，请结合 PM2 / nginx / .env 配置继续排查"
    return 1
  fi

  success "健康检查通过"
}

show_status() {
  step "环境与服务状态"

  echo "脚本路径: ${SCRIPT_INSTALL_PATH}"
  echo "项目目录: ${APP_DIR}"
  echo "静态目录: ${WEB_ROOT}"
  echo "备份目录: ${BACKUP_ROOT}"
  echo "API 端口: $(get_api_port)"
  echo "VITE_API_BASE_URL: ${VITE_API_BASE_URL:-$(get_vite_api_base_url)}"
  echo ""

  command_exists git && success "git 已安装" || warn "git 未安装"
  command_exists node && success "Node.js: $(node -v)" || warn "Node.js 未安装"

  if has_pnpm_runner; then
    success "pnpm: $(pnpm_version)"
  else
    warn "pnpm/corepack 未安装"
  fi

  if has_repo; then
    success "仓库存在"
    echo "分支: $(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    echo "提交: $(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    if [[ -n "$(git -C "${APP_DIR}" status --porcelain 2>/dev/null)" ]]; then
      warn "工作区有未提交改动，安全更新将拒绝执行"
    else
      success "工作区干净"
    fi
  else
    warn "仓库不存在"
  fi

  [[ -f "${APP_DIR}/.env" ]] && success ".env 已存在" || warn ".env 不存在"
  [[ -d "${APP_DIR}/data" ]] && success "data 目录存在" || warn "data 目录不存在"
  [[ -d "${APP_DIR}/apps/api/uploads" ]] && success "上传目录存在" || warn "上传目录不存在"
  [[ -d "${WEB_ROOT}" ]] && success "静态目录存在" || warn "静态目录不存在"

  if nginx_installed; then
    success "nginx 已安装"
    has_nginx_conf && success "nginx 配置存在: ${NGINX_CONF}" || warn "nginx 配置不存在: ${NGINX_CONF}"
    nginx_active && success "nginx 正在运行" || warn "nginx 未运行"
    [[ -n "$(current_server_names || true)" ]] && echo "server_name: $(current_server_names)"
  else
    warn "nginx 未安装"
  fi

  if has_pm2; then
    success "pm2 已安装"
    if pm2_app_exists; then
      success "PM2 进程存在: ${PM2_APP}"
      pm2 describe "${PM2_APP}" | sed -n '1,20p'
    else
      warn "未检测到 PM2 进程: ${PM2_APP}"
    fi
  else
    warn "pm2 未安装"
  fi

  if docker_compose_available; then
    success "docker compose 可用"
    (cd "${APP_DIR}" && docker compose ps) || true
  else
    warn "docker compose 不可用，或项目目录下没有 docker-compose.yml"
  fi

  run_health_checks || true
}

safe_update_code() {
  step "安全更新代码"

  ensure_repo_exists || return 1

  if ! command_exists git; then
    error "未检测到 git，无法继续更新"
    return 1
  fi

  local local_sha remote_sha needs_runtime_repair=false

  if [[ -n "$(git -C "${APP_DIR}" status --porcelain 2>/dev/null)" ]]; then
    error "检测到本地未提交改动，已停止更新。请先提交、备份或手动处理。"
    return 1
  fi

  info "获取远程最新提交 ..."
  git -C "${APP_DIR}" fetch origin "${REPO_BRANCH}" --prune

  local_sha="$(git -C "${APP_DIR}" rev-parse HEAD)"
  remote_sha="$(git -C "${APP_DIR}" rev-parse "origin/${REPO_BRANCH}")"

  if ! pm2_app_exists; then
    warn "未检测到 PM2 API 进程，尽管代码已最新，仍将继续构建和启动"
    needs_runtime_repair=true
  fi

  if [[ ! -d "${WEB_ROOT}" ]]; then
    warn "未检测到前端静态目录 ${WEB_ROOT}，将继续构建和同步"
    needs_runtime_repair=true
  fi

  if ! find_api_entrypoint >/dev/null 2>&1; then
    warn "未检测到 API 编译产物，将继续构建"
    needs_runtime_repair=true
  fi

  if [[ "${local_sha}" == "${remote_sha}" && "${needs_runtime_repair}" == "false" ]]; then
    success "代码已是最新，且运行产物与进程状态正常，无需更新"
    run_health_checks || true
    return 0
  fi

  if [[ "${local_sha}" == "${remote_sha}" && "${needs_runtime_repair}" == "true" ]]; then
    info "代码已是最新，但运行环境需要修复，继续执行依赖安装、构建与启动 ..."
  else
    info "执行 fast-forward 更新 ..."
    git -C "${APP_DIR}" pull --ff-only origin "${REPO_BRANCH}"
  fi

  ensure_env_file || true
  build_workspace
  sync_web_dist || true
  ensure_pm2_api_process || true

  if nginx_installed && has_nginx_conf; then
    ensure_nginx_api_proxy || true
    info "检测到 nginx 配置，执行语法检查 ..."
    nginx -t
    if nginx_active; then
      systemctl reload nginx
      success "nginx 已重载"
    else
      warn "nginx 未运行，仅完成配置校验，不做 reload"
    fi
  else
    warn "未检测到 nginx 或配置文件，跳过 nginx 操作"
  fi

  run_health_checks || true
  success "安全更新完成。未触碰 data、uploads、postgres-data 等本地数据目录。"
}

configure_https_certificate() {
  local server_names="${1}"
  local email=""
  local domains=()
  local certbot_args=()
  local domain=""

  if [[ "${server_names}" == "_" ]]; then
    warn "server_name 为 `_`，跳过 HTTPS 证书申请"
    return 0
  fi

  if ! ask_yes_no "是否现在为当前域名申请 Let's Encrypt HTTPS 证书？"; then
    return 0
  fi

  install_apt_packages certbot python3-certbot-nginx
  email="$(prompt_value "请输入证书通知邮箱:")"

  if [[ -z "${email}" ]]; then
    warn "邮箱为空，跳过证书申请"
    return 0
  fi

  read -r -a domains <<< "${server_names}"
  if [[ ${#domains[@]} -eq 0 ]]; then
    warn "未解析到域名，跳过证书申请"
    return 0
  fi

  for domain in "${domains[@]}"; do
    certbot_args+=("-d" "${domain}")
  done

  certbot --nginx --agree-tos --non-interactive --redirect -m "${email}" "${certbot_args[@]}"

  if command_exists systemctl && systemctl list-unit-files | grep -q '^certbot.timer'; then
    systemctl enable certbot.timer >/dev/null 2>&1 || true
    systemctl start certbot.timer >/dev/null 2>&1 || true
  fi

  success "HTTPS 证书申请流程已执行"
}

bootstrap_or_repair_deploy() {
  step "首次部署 / 修复部署"

  ensure_basic_system_packages
  ensure_repo_exists || return 1
  ensure_env_file || true
  ensure_node_build_toolchain || return 1
  ensure_pm2_installed || true

  local current_names api_port server_names
  current_names="$(current_server_names || true)"
  api_port="$(get_api_port)"
  server_names="$(prompt_value "请输入 server_name，多个域名用空格分隔，留空则使用当前值或 `_`" "${current_names:-_}")"

  write_nginx_conf "${server_names:-_}" "${api_port}"
  activate_nginx_site

  build_workspace
  sync_web_dist
  ensure_pm2_api_process
  run_health_checks || true
  configure_https_certificate "${server_names:-_}"

  success "部署修复流程完成"
}

create_backup() {
  step "创建备份"

  ensure_repo_exists || return 1
  mkdir -p "${BACKUP_ROOT}"

  local ts tmp_dir payload_dir backup_file app_parent app_name
  ts="$(date +%Y%m%d-%H%M%S)"
  tmp_dir="$(mktemp -d /tmp/yk-backup.XXXXXX)"
  payload_dir="${tmp_dir}/payload"
  backup_file="${BACKUP_ROOT}/yk-backup-${ts}.tar.gz"
  app_parent="$(dirname "${APP_DIR}")"
  app_name="$(basename "${APP_DIR}")"

  mkdir -p "${payload_dir}"

  cat > "${payload_dir}/manifest.txt" <<EOF
created_at=$(date -Iseconds)
host=$(hostname)
repo_branch=$(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
repo_commit=$(git -C "${APP_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)
app_dir=${APP_DIR}
web_root=${WEB_ROOT}
nginx_conf=${NGINX_CONF}
pm2_app=${PM2_APP}
EOF

  info "打包项目目录（排除 .git / node_modules / dist 缓存）..."
  tar -C "${app_parent}" \
    --exclude="${app_name}/.git" \
    --exclude="${app_name}/node_modules" \
    --exclude="${app_name}/apps/web/node_modules" \
    --exclude="${app_name}/apps/api/node_modules" \
    --exclude="${app_name}/packages/shared/node_modules" \
    --exclude="${app_name}/apps/web/dist" \
    --exclude="${app_name}/apps/api/dist" \
    -czf "${payload_dir}/app.tar.gz" "${app_name}"

  if [[ -d "${WEB_ROOT}" ]]; then
    tar -C "$(dirname "${WEB_ROOT}")" -czf "${payload_dir}/web-root.tar.gz" "$(basename "${WEB_ROOT}")"
  fi

  if has_nginx_conf; then
    cp -f "${NGINX_CONF}" "${payload_dir}/nginx.conf"
  fi

  if [[ -f /root/.pm2/dump.pm2 ]]; then
    cp -f /root/.pm2/dump.pm2 "${payload_dir}/pm2-dump.pm2"
  fi

  tar -C "${tmp_dir}" -czf "${backup_file}" payload
  rm -rf "${tmp_dir}"

  success "备份已生成: ${backup_file}"
}

choose_backup_file() {
  mkdir -p "${BACKUP_ROOT}"
  mapfile -t BACKUP_FILES < <(find "${BACKUP_ROOT}" -maxdepth 1 -type f -name 'yk-backup-*.tar.gz' | sort -r)

  if [[ ${#BACKUP_FILES[@]} -eq 0 ]]; then
    error "未找到备份文件: ${BACKUP_ROOT}"
    return 1
  fi

  echo ""
  echo "可用备份:"
  local i=1
  for file in "${BACKUP_FILES[@]}"; do
    echo "  ${i}. ${file}"
    ((i++))
  done

  local choice=""
  read -r -p "请输入要还原的备份编号: " choice

  if [[ ! "${choice}" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#BACKUP_FILES[@]} )); then
    error "无效编号"
    return 1
  fi

  SELECTED_BACKUP_FILE="${BACKUP_FILES[$((choice - 1))]}"
  return 0
}

restore_backup() {
  step "还原备份"

  choose_backup_file || return 1

  warn "即将还原备份: ${SELECTED_BACKUP_FILE}"
  warn "还原前会先自动再备份一次当前状态"
  ask_yes_no "确认继续还原？" || return 0

  create_backup

  local had_pm2=false had_docker=false had_nginx=false
  pm2_app_exists && had_pm2=true
  docker_services_running && had_docker=true
  nginx_active && had_nginx=true

  if [[ "${had_pm2}" == "true" ]]; then
    pm2 stop "${PM2_APP}" >/dev/null 2>&1 || true
  fi

  if [[ "${had_docker}" == "true" ]]; then
    (cd "${APP_DIR}" && docker compose stop postgres redis metabase) || true
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d /tmp/yk-restore.XXXXXX)"
  tar -xzf "${SELECTED_BACKUP_FILE}" -C "${tmp_dir}"

  if [[ -f "${tmp_dir}/payload/app.tar.gz" ]]; then
    mkdir -p "${tmp_dir}/app"
    tar -xzf "${tmp_dir}/payload/app.tar.gz" -C "${tmp_dir}/app"
    mkdir -p "${APP_DIR}"
    rsync -a --delete "${tmp_dir}/app/$(basename "${APP_DIR}")/" "${APP_DIR}/"
  fi

  if [[ -f "${tmp_dir}/payload/web-root.tar.gz" ]]; then
    mkdir -p "${tmp_dir}/web"
    tar -xzf "${tmp_dir}/payload/web-root.tar.gz" -C "${tmp_dir}/web"
    mkdir -p "${WEB_ROOT}"
    rsync -a --delete "${tmp_dir}/web/$(basename "${WEB_ROOT}")/" "${WEB_ROOT}/"
  fi

  if [[ -f "${tmp_dir}/payload/nginx.conf" ]]; then
    cp -f "${tmp_dir}/payload/nginx.conf" "${NGINX_CONF}"
  fi

  if [[ -f "${tmp_dir}/payload/pm2-dump.pm2" && -d /root/.pm2 ]]; then
    cp -f "${tmp_dir}/payload/pm2-dump.pm2" /root/.pm2/dump.pm2
  fi

  rm -rf "${tmp_dir}"

  if [[ "${had_docker}" == "true" ]] && docker_compose_available; then
    (cd "${APP_DIR}" && docker compose up -d postgres redis metabase) || true
  fi

  if nginx_installed && has_nginx_conf; then
    nginx -t
    if [[ "${had_nginx}" == "true" ]]; then
      systemctl reload nginx
    fi
  fi

  if has_pm2; then
    ensure_pm2_api_process || true
  fi

  run_health_checks || true
  success "备份还原完成"
}

show_menu() {
  clear || true
  echo -e "${BOLD}yk 运维菜单${RESET}"
  echo ""
  echo "1. 检查环境 / 服务状态 / 健康检查"
  echo "2. 首次部署 / 修复部署"
  echo "3. 安全更新代码并按检测结果重启服务"
  echo "4. 单独执行健康检查"
  echo "5. 创建打包备份"
  echo "6. 从备份还原"
  echo "0. 退出"
  echo ""
}

main() {
  require_root
  install_self

  while true; do
    show_menu
    local choice=""
    read -r -p "请输入功能编号: " choice

    case "${choice}" in
      1)
        show_status
        pause
        ;;
      2)
        bootstrap_or_repair_deploy
        pause
        ;;
      3)
        safe_update_code
        pause
        ;;
      4)
        run_health_checks
        pause
        ;;
      5)
        create_backup
        pause
        ;;
      6)
        restore_backup
        pause
        ;;
      0)
        exit 0
        ;;
      *)
        warn "无效选项，请重新输入"
        pause
        ;;
    esac
  done
}

main "$@"
