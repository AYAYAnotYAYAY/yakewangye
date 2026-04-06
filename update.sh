#!/usr/bin/env bash
set -euo pipefail

# Zero-downtime updater for static site from GitHub
# - Does NOT touch HTTPS/Certbot/Nginx config
# - Pulls latest code from GitHub
# - Syncs files to live web directory without stopping service

REPO_URL=""
BRANCH="main"
SITE_DIR="/var/www/quanyu-dental"
KEEP_BACKUP="true"
BACKUP_DIR="/var/backups/quanyu-dental"
TMP_BASE="/tmp"

print_usage() {
  cat <<EOF
Usage:
  sudo ./update.sh --repo <github_repo_url> [options]

Required:
  --repo <url>              GitHub repository URL (https://... or git@...)

Options:
  --branch <name>           Branch to deploy (default: ${BRANCH})
  --site-dir <path>         Live site directory (default: ${SITE_DIR})
  --no-backup               Disable backup before update
  --backup-dir <path>       Backup directory (default: ${BACKUP_DIR})
  -h, --help                Show this help

Example:
  sudo ./update.sh --repo https://github.com/yourname/your-dental-site.git --branch main
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --site-dir) SITE_DIR="${2:-}"; shift 2 ;;
    --no-backup) KEEP_BACKUP="false"; shift 1 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1"; print_usage; exit 1 ;;
  esac
done

if [[ -z "${REPO_URL}" ]]; then
  echo "ERROR: --repo is required"
  print_usage
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Please run as root (sudo)."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "==> Installing git and rsync..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y git rsync
  else
    echo "ERROR: git is required. Install git and rsync first."
    exit 1
  fi
fi

if [[ ! -d "${SITE_DIR}" ]]; then
  echo "ERROR: site directory not found: ${SITE_DIR}"
  echo "Run deploy.sh first to initialize server."
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
TMP_DIR="${TMP_BASE}/quanyu-update-${TS}"

cleanup() {
  rm -rf "${TMP_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Cloning latest code..."
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${TMP_DIR}"

# Optional: backup current site
if [[ "${KEEP_BACKUP}" == "true" ]]; then
  mkdir -p "${BACKUP_DIR}"
  BACKUP_FILE="${BACKUP_DIR}/site-backup-${TS}.tar.gz"
  echo "==> Creating backup: ${BACKUP_FILE}"
  tar -czf "${BACKUP_FILE}" -C "${SITE_DIR}" .
fi

echo "==> Updating website files (no service stop)..."
# --delay-updates + --delete-delay reduce inconsistent window
rsync -a --delete-delay --delay-updates \
  --exclude ".git" \
  --exclude ".github" \
  --exclude "node_modules" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh" \
  --exclude "update.sh" \
  "${TMP_DIR}/" "${SITE_DIR}/"

chown -R www-data:www-data "${SITE_DIR}" || true

echo "✅ Update completed successfully."
echo "Repo: ${REPO_URL}"
echo "Branch: ${BRANCH}"
echo "Site: ${SITE_DIR}"
if [[ "${KEEP_BACKUP}" == "true" ]]; then
  echo "Backup: ${BACKUP_FILE}"
fi
echo "Note: Nginx/HTTPS configuration was not changed."
