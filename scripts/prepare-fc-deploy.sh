#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEPLOY_DIR="$ROOT_DIR/.fc-deploy"

rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/apps/server" "$DEPLOY_DIR/apps"

cp "$ROOT_DIR/apps/server/package.json" "$DEPLOY_DIR/package.json"
cp -R "$ROOT_DIR/apps/server/dist" "$DEPLOY_DIR/apps/server/dist"

cd "$DEPLOY_DIR"
npm install --omit=dev
