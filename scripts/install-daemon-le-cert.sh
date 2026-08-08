#!/usr/bin/env bash
# Issue / renew Let's Encrypt cert for the public daemon hostname (default node1.$PUBLIC_HOST)
# via Cloudflare DNS-01, then keep the DNS A record DNS-only (grey cloud) so the panel
# talks HTTPS to the daemon without Cloudflare bot challenges.
#
# Requires: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID in .env
#   sudo bash scripts/install-daemon-le-cert.sh
# Optional: DAEMON_PUBLIC_HOST=node1.guartrix.com
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
load_env_file "$ROOT/.env"

DOMAIN="${DAEMON_PUBLIC_HOST:-node1.${PUBLIC_HOST:-guartrix.com}}"
DOMAIN="${DOMAIN,,}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@${PUBLIC_HOST:-guartrix.com}}"
CREDS="$ROOT/data/certs/cloudflare-dns.ini"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/install-daemon-le-cert.sh" >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ZONE_ID:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID required in .env" >&2
  exit 1
fi

command -v certbot >/dev/null || {
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-dns-cloudflare
}

mkdir -p "$ROOT/data/certs"
umask 077
printf 'dns_cloudflare_api_token = %s\n' "$CLOUDFLARE_API_TOKEN" >"$CREDS"
chmod 600 "$CREDS"

certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CREDS" \
  --dns-cloudflare-propagation-seconds 30 \
  -d "$DOMAIN" \
  --agree-tos \
  --non-interactive \
  --email "$EMAIL" \
  --keep-until-expiring

HOOK="/etc/letsencrypt/renewal-hooks/deploy/guartrix-daemon-tls.sh"
mkdir -p "$(dirname "$HOOK")"
cat >"$HOOK" <<EOF
#!/usr/bin/env bash
# Reload Guartrix web after LE renew so SNI picks up new daemon cert.
set -euo pipefail
ROOT="$ROOT"
if [[ -x "\$ROOT/build/start.sh" ]]; then
  bash "\$ROOT/build/start.sh" || true
elif [[ -x "\$ROOT/scripts/start.sh" ]]; then
  bash "\$ROOT/scripts/start.sh" || true
fi
EOF
chmod 755 "$HOOK"

# DNS-only so panel→daemon HTTPS hits origin TLS (LE) instead of CF challenge HTML
RESP=$(curl -sS "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${DOMAIN}&type=A" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
RECORD_ID=$(node -e 'const j=JSON.parse(process.argv[1]); console.log(j.result?.[0]?.id||"")' "$RESP")
CONTENT=$(node -e 'const j=JSON.parse(process.argv[1]); console.log(j.result?.[0]?.content||"")' "$RESP")
if [[ -z "$RECORD_ID" ]]; then
  echo "WARN: no A record for $DOMAIN — create it manually (DNS-only → this host)" >&2
else
  curl -sS -X PATCH "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "content-type: application/json" \
    --data "{\"proxied\":false,\"ttl\":300,\"content\":\"${CONTENT}\"}" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d); if(!j.success){console.error(j.errors); process.exit(1);} console.log("DNS", j.result.name, "proxied="+j.result.proxied, "→", j.result.content);});'
fi

echo "Cert: /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
echo "Set DAEMON_PUBLIC_HOST=$DOMAIN in .env, then restart: bash build/start.sh"
echo "Update the node in Admin → System to https://$DOMAIN (port 443)."
