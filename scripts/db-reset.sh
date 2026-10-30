#!/usr/bin/env bash
# Rebuilds the local Docker database from nothing: a fresh database, the
# stand-ins for what Neon provides, every migration, then the seed.
set -euo pipefail
cd "$(dirname "$0")/.."

psql() { docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -d postgres -c "drop database if exists nexahub with (force)" -c "create database nexahub"
psql -d nexahub -f /db/local/setup.sql
DATABASE_OWNER_URL=postgres://postgres:postgres@127.0.0.1:54322/nexahub bun scripts/migrate.ts --seed
