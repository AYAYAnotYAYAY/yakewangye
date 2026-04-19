set -euo pipefail

# One-click deploy script for Quanyu Dental static website
# Supports:
# - Nginx install/config
# - Website publish to /var/www
# - Let's Encrypt HTTPS certificate issuance
# - Auto-renew setup

PRIMARY_DOMAIN="proclinicheihe.ru"
SECONDARY_DOMAIN="prodentalheihe.ru"
SITE_DIR="/var/www/quanyu-dental"
SITE_NAME="quanyu-dental"
EMAIL=""
SOURCE_DIR="$(pwd)"
OS_FAMILY=""

print_usage() {
  cat <<EOF
Usage:
  sudo ./deploy.sh --email you@example.com [options]

Options:
  --email <email>           Email for Let's Encrypt (required)
  --primary <domain>        Primary domain (default: ${PRIMARY_DOMAIN})
  --secondary <domain>      Secondary domain (default: ${SECONDARY_DOMAIN})
  --site-dir <path>         Deploy directory (default: ${SITE_DIR})
  --source-dir <path>       Source website directory (default: current dir)
  -h, --help                Show this help

Example:
  sudo ./deploy.sh --email admin@proclinicheihe.ru
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift 2 ;;
    --primary) PRIMARY_DOMAIN="${2:-}"; shift 2 ;;
    --secondary) SECONDARY_DOMAIN="${2:-}"; shift 2 ;;
    --site-dir) SITE_DIR="${2:-}"; shift 2 ;;
    --source-dir) SOURCE_DIR="${2:-}"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1"; print_usage; exit 1 ;;
  esac
done

if [[ -z "${EMAIL}" ]]; then
  echo "ERROR: --email is required"
  print_usage
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "ERROR: source dir not found: ${SOURCE_DIR}"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Please run as root (sudo)."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  OS_FAMILY="debian"
else
  echo "ERROR: This script currently supports Debian/Ubuntu (apt)."
  exit 1
fi

echo "==> Installing required packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx rsync curl

echo "==> Preparing web directory: ${SITE_DIR}"
mkdir -p "${SITE_DIR}"

echo "==> Syncing website files..."
rsync -av --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude "node_modules" \
  --exclude ".DS_Store" \
  "${SOURCE_DIR}/" "${SITE_DIR}/"

chown -R www-data:www-data "${SITE_DIR}"

NGINX_CONF="/etc/nginx/sites-available/${SITE_NAME}.conf"

echo "==> Writing nginx HTTP config: ${NGINX_CONF}"
cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${PRIMARY_DOMAIN} ${SECONDARY_DOMAIN};

    root ${SITE_DIR};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
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

ln -sfn "${NGINX_CONF}" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"
rm -f /etc/nginx/sites-enabled/default

echo "==> Checking and reloading nginx..."
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "==> Issuing HTTPS certificate with Certbot..."
certbot --nginx \
  -d "${PRIMARY_DOMAIN}" \
  -d "${SECONDARY_DOMAIN}" \
  --agree-tos \
  --non-interactive \
  --redirect \
  -m "${EMAIL}"

echo "==> Ensuring certbot auto-renew..."
# Systemd timer exists on modern Ubuntu/Debian, enable it:
if systemctl list-unit-files | grep -q '^certbot.timer'; then
  systemctl enable certbot.timer
  systemctl start certbot.timer
fi

# Add fallback cron (idempotent)
CRON_LINE='0 3 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"'
( crontab -l 2>/dev/null | grep -Fv 'certbot renew --quiet --deploy-hook "systemctl reload nginx"'; echo "${CRON_LINE}" ) | crontab -

echo "==> Testing renewal (dry-run)..."
certbot renew --dry-run || true

echo ""
echo "✅ Deployment complete!"
echo "Website dir: ${SITE_DIR}"
echo "Domains: https://${PRIMARY_DOMAIN}  https://${SECONDARY_DOMAIN}"
echo "Nginx conf: ${NGINX_CONF}"
echo "Renewal: certbot.timer + cron fallback configured"
]]>
