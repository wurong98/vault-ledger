#!/usr/bin/env bash
set -euo pipefail

# 在普通用户的终端执行；仅安装 systemd 配置时使用 sudo。
if (( EUID == 0 )); then
  echo '请以平时运行账本的普通用户执行：bash scripts/install-service.sh' >&2
  exit 1
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="$(command -v node || true)"
if [[ -z "$node_bin" ]] || ! command -v npm >/dev/null; then
  echo '请先安装 Node.js >= 22.12 和 npm。' >&2
  exit 1
fi
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' || {
  echo '需要 Node.js >= 22.12。' >&2
  exit 1
}
command -v systemctl >/dev/null || { echo '需要使用 systemd 的 Ubuntu 系统。' >&2; exit 1; }

port="${PORT:-8000}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo 'PORT 必须为 1 到 65535 的整数。' >&2
  exit 1
fi
lan_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' || true)"
origin="${APP_ORIGIN:-http://${lan_ip:-127.0.0.1}:$port}"
data_dir="${DATA_DIR:-$HOME/.local/share/ledgerbox}"
[[ "$data_dir" = /* ]] || { echo 'DATA_DIR 请使用绝对路径。' >&2; exit 1; }
if [[ ! "$origin" =~ ^https?://[^/[:space:]]+$ ]]; then
  echo 'APP_ORIGIN 应为不带路径及末尾斜杠的 http(s) 地址。' >&2
  exit 1
fi

# systemd 双引号值：转义特殊字符，并拒绝换行。
unit_quote() {
  local value="$1"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//%/%%}"
  printf '"%s"' "$value"
}

unit_path() {
  local quoted
  quoted="$(unit_quote "$1")"
  printf '%s' "${quoted:1:${#quoted}-2}"
}

cd "$project_dir"
echo '安装依赖并构建……'
npm ci --include=dev
npm run build

unit_file="$(mktemp)"
trap 'rm -f "$unit_file"' EXIT
cat > "$unit_file" <<EOF
[Unit]
Description=LedgerBox personal ledger
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$(id -un)
Group=$(id -gn)
WorkingDirectory=$(unit_path "$project_dir")
ExecStart=$(unit_quote "$node_bin") $(unit_quote "$project_dir/apps/server/dist/index.js")
Environment="NODE_ENV=production"
Environment="HOST=0.0.0.0"
Environment="PORT=$port"
Environment=$(unit_quote "APP_ORIGIN=$origin")
Environment=$(unit_quote "DATA_DIR=$data_dir")
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

echo '安装系统服务（可能需要输入 sudo 密码）……'
sudo install -m 0644 "$unit_file" /etc/systemd/system/ledgerbox.service
sudo systemctl daemon-reload
sudo systemctl enable ledgerbox.service
sudo systemctl restart ledgerbox.service
sleep 2
if ! systemctl is-active --quiet ledgerbox.service; then
  sudo journalctl -u ledgerbox.service -n 30 --no-pager
  exit 1
fi
echo "安装完成，已设置开机启动。访问：$origin"
echo '状态：systemctl status ledgerbox'
echo '日志：sudo journalctl -u ledgerbox -f'
echo '停止：sudo systemctl stop ledgerbox'
