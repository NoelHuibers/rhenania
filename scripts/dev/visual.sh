#!/usr/bin/env bash
# Runs the visual regression project inside the official Playwright image so
# screenshots render with the same fonts as CI. Extra args go to Playwright:
#
#   pnpm test:visual                       # compare against baselines
#   pnpm test:visual --update-snapshots    # (re)generate baselines
#
# node_modules, .next and the pnpm store live in container volumes, so the host checkout's
# own node_modules (Fedora/macOS binaries) are never touched.
set -euo pipefail

cd "$(dirname "$0")/../.."
VERSION=$(node -p 'require("@playwright/test/package.json").version')
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
RUNTIME=$(command -v podman || command -v docker || true)
if [[ -z "$RUNTIME" ]]; then
	echo "podman or docker is required for visual tests" >&2
	exit 1
fi

exec "$RUNTIME" run --rm --ipc=host --init \
	--security-opt label=disable \
	-v "$PWD":/work \
	-v rhenania-visual-node-modules:/work/node_modules \
	-v rhenania-visual-next:/work/.next \
	-v rhenania-visual-pnpm-store:/pnpm-store \
	-e npm_config_store_dir=/pnpm-store \
	-w /work \
	-e CI="${CI:-}" \
	"$IMAGE" \
	bash -c 'corepack enable >/dev/null && pnpm install --frozen-lockfile --config.confirm-modules-purge=false --reporter=append-only >/tmp/pnpm-install.log || (tail -30 /tmp/pnpm-install.log; exit 1) && pnpm exec playwright test --project=visual "$@"' \
	-- "$@"
