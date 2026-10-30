#!/usr/bin/env bash
# Adds shadcn components (Base UI primitives, see components.json), then points
# their `cn` import at src/lib/utils.ts instead of the CLI's `cn` package.
#   bun run ui:add dialog popover
set -euo pipefail
cd "$(dirname "$0")/.."
bunx --bun shadcn@latest add "$@" -y
sed -i 's#from "cn"#from "\#/lib/utils"#' src/components/ui/*.tsx
