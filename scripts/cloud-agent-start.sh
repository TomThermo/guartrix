#!/usr/bin/env bash
# Boot deps for Cursor Cloud Agents (called from .cursor/environment.json `start`).
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v service >/dev/null 2>&1; then
  sudo service docker start || true
fi
if ! docker info >/dev/null 2>&1; then
  sudo dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

docker compose -f docker-compose.dev.yml up -d
until docker compose -f docker-compose.dev.yml exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -proot --silent; do
  sleep 2
done

if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i \
    -e 's|MYSQL_PASSWORD=change-me|MYSQL_PASSWORD=guartrix|' \
    -e 's|DATABASE_URL=mysql://guartrix:change-me@127.0.0.1:3306/guartrix_panel|DATABASE_URL=mysql://guartrix:guartrix@127.0.0.1:3306/guartrix_panel|' \
    -e 's|SESSION_SECRET=change-this-secret-to-something-random|SESSION_SECRET=cloud-dev-session-secret-not-for-prod|' \
    .env
fi

bash scripts/db-migrate.sh || true
