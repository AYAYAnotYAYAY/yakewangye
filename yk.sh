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

has_repo() {
  [[ -d "${APP_DIR}/.git" ]]
}

has_nginx_conf() {
  [[ -f "${NGINX_CONF}" ]]
}

has_pm2() {
  command -v pm2 >/dev/null 2>&1
}

pm2_app_exists() {
  has_pm2 && pm2 describe "${PM2_APP}" >/dev/null 2>&1
}

nginx_installed() {
  command -v nginx >/dev/null 2>&1
}

nginx_active() {
  command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx
}

docker_compose_available() {
  command -v docker >/dev/null 2>&1 && [[ -f "${APP_DIR}/docker-compose.yml" ]]
}

docker_services_running() {
  docker_compose_available && (cd "${APP_DIR}" && docker compose ps --status running --services 2>/dev/null | grep -q .)
}

ensure_repo_exists() {
  if has_repo; then
    return 0
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

show_status() {
  step "环境与服务状态"

  echo "脚本路径: ${SCRIPT_INSTALL_PATH}"
  echo "项目目录: ${APP_DIR}"
  echo "静态目录: ${WEB_ROOT}"
  echo "备份目录: ${BACKUP_ROOT}"
  echo ""

  if command -v git >/dev/null 2>&1; then
    success "git 已安装"
  else
    warn "git 未安装"
  fi

  if command -v node >/dev/null 2>&1; then
    success "Node.js: $(node -v)"
  else
    warn "Node.js 未安装"
  fi

  if command -v pnpm >/dev/null 2>&1; then
    success "pnpm: $(pnpm -v)"
  else
    warn "pnpm 未安装"
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
  [[ -d "${APP_DIR}/postgres-data" ]] && success "postgres-data 目录存在" || warn "postgres-data 目录不存在"

  if nginx_installed; then
    success "nginx 已安装"
    has_nginx_conf && success "nginx 配置存在: ${NGINX_CONF}" || warn "nginx 配置不存在: ${NGINX_CONF}"
    nginx_active && success "nginx 正在运行" || warn "nginx 未运行"
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
}

safe_update_code() {
  step "安全更新代码"

  ensure_repo_exists || return 1

  if [[ -n "$(git -C "${APP_DIR}" status --porcelain 2>/dev/null)" ]]; then
    error "检测到本地未提交改动，已停止更新。请先提交、备份或手动处理。"
    return 1
  fi

  info "获取远程最新提交 ..."
  git -C "${APP_DIR}" fetch origin "${REPO_BRANCH}" --prune

  local local_sha remote_sha
  local_sha="$(git -C "${APP_DIR}" rev-parse HEAD)"
  remote_sha="$(git -C "${APP_DIR}" rev-parse "origin/${REPO_BRANCH}")"

  if [[ "${local_sha}" == "${remote_sha}" ]]; then
    success "代码已是最新，无需更新"
    return 0
  fi

  info "执行 fast-forward 更新 ..."
  git -C "${APP_DIR}" pull --ff-only origin "${REPO_BRANCH}"

  if ! command -v pnpm >/dev/null 2>&1; then
    error "pnpm 未安装，无法继续构建"
    return 1
  fi

  cd "${APP_DIR}"

  if [[ -f ".env.example" && ! -f ".env" ]]; then
    cp .env.example .env
    warn "未找到 .env，已从 .env.example 生成，请检查生产配置"
  fi

  info "安装依赖 ..."
  pnpm install --frozen-lockfile

  info "执行构建 ..."
  pnpm run build

  if [[ -d "${APP_DIR}/apps/web/dist" ]]; then
    mkdir -p "${WEB_ROOT}"
    rsync -a --delete "${APP_DIR}/apps/web/dist/" "${WEB_ROOT}/"
    if id -u www-data >/dev/null 2>&1; then
      chown -R www-data:www-data "${WEB_ROOT}"
    fi
    success "前端产物已同步到 ${WEB_ROOT}"
  else
    warn "未找到前端产物目录，跳过静态文件同步"
  fi

  if pm2_app_exists; then
    info "检测到 PM2 进程，执行重启 ..."
    pm2 restart "${PM2_APP}" --update-env
    pm2 save --force >/dev/null 2>&1 || true
    success "PM2 进程已重启"
  else
    warn "未检测到 PM2 进程 ${PM2_APP}，跳过后端重启"
  fi

  if nginx_installed && has_nginx_conf; then
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

  success "安全更新完成。未触碰 data、uploads、postgres-data 等本地数据目录。"
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

  local choice
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
    if pm2_app_exists; then
      pm2 restart "${PM2_APP}" --update-env || true
    elif [[ -f "${APP_DIR}/apps/api/dist/main.js" ]]; then
      pm2 start "${APP_DIR}/apps/api/dist/main.js" --name "${PM2_APP}" --cwd "${APP_DIR}" || true
    fi
    pm2 save --force >/dev/null 2>&1 || true
  fi

  success "备份还原完成"
}

show_menu() {
  clear || true
  echo -e "${BOLD}yk 运维菜单${RESET}"
  echo ""
  echo "1. 检查环境 / PM2 / nginx / 仓库状态"
  echo "2. 安全更新代码并按检测结果重启服务"
  echo "3. 创建打包备份"
  echo "4. 从备份还原"
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
        safe_update_code
        pause
        ;;
      3)
        create_backup
        pause
        ;;
      4)
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
