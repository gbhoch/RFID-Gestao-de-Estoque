#!/usr/bin/env bash
# Script de implantação para ambiente Linux.
set -euo pipefail

echo ">> Construindo e subindo containers..."
docker compose up -d --build

echo ">> Aguardando banco ficar saudável..."
until docker compose exec -T postgres pg_isready -U rfid -d rfid_assets >/dev/null 2>&1; do
  sleep 2
done

echo ">> Executando seed inicial (perfis, permissões, admin)..."
docker compose exec -T backend node -e "require('./dist/config/seed.js')" || \
  docker compose exec -T backend npm run seed || true

echo ">> Pronto."
echo "   Frontend:  http://localhost:8080"
echo "   API/Swagger: http://localhost:3000/api/docs"
echo "   Login: admin / Admin@123"
