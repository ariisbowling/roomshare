#!/usr/bin/env bash
# Run ON THE LENOVO as root:  sudo bash server/install.sh
# Installs Docker, stops the lid from suspending, and starts LiveKit + Caddy + DuckDNS.
set -euo pipefail
cd "$(dirname "$0")"

[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }

read -rp "DuckDNS subdomain (the part before .duckdns.org): " SUB
read -rp "DuckDNS token: " TOKEN
DOMAIN="${SUB}.duckdns.org"

# --- docker ---
if ! command -v docker >/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# --- laptop lid: keep running when closed ---
mkdir -p /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/lid.conf <<CONF
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
CONF
systemctl restart systemd-logind || true
# never sleep
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true

# --- keys + config ---
if [ -f livekit.yaml ]; then
  echo "livekit.yaml exists, keeping existing keys"
  API_KEY=$(grep -A1 '^keys:' livekit.yaml | tail -1 | awk '{print $1}' | tr -d ':')
  API_SECRET=$(grep -A1 '^keys:' livekit.yaml | tail -1 | awk '{print $2}')
else
  API_KEY="API$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 12)"
  API_SECRET="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 43)"
  sed "s|__API_KEY__|$API_KEY|; s|__API_SECRET__|$API_SECRET|; s|__DOMAIN__|$DOMAIN|" livekit.yaml.template > livekit.yaml
fi
sed "s|__DOMAIN__|$DOMAIN|" Caddyfile.template > Caddyfile
printf 'SUBDOMAINS=%s\nTOKEN=%s\n' "$SUB" "$TOKEN" > .env
chmod 600 livekit.yaml .env

# --- go ---
docker compose pull -q
docker compose up -d

echo
echo "================ DONE ================"
echo "Put these in Vercel / .env.local:"
echo
echo "NEXT_PUBLIC_LIVEKIT_URL=wss://$DOMAIN"
echo "LIVEKIT_API_KEY=$API_KEY"
echo "LIVEKIT_API_SECRET=$API_SECRET"
echo
echo "Check:  docker compose logs -f"
echo "Test:   https://$DOMAIN  should say OK once the cert is issued (~30s)"
