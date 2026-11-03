#!/usr/bin/env bash
# Opätovné nasadenie kódu na Azure App Service (zdroje už existujú – pozri docs/azure-nasadenie.md).
#
# Použitie (z koreňa projektu, Git Bash, prihlásené `az login`):
#   bash deploy/azure/deploy.sh            # všetky tri aplikácie
#   bash deploy/azure/deploy.sh frontend   # iba jedna: frontend | backend-1 | backend-2
#
# Mení iba kód. Nastavenia aplikácií (heslá, URL) ostávajú v Azure.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash inak prepisuje cesty /subscriptions/... na C:/Program Files/Git/...

RG=IS_HR_system_AISPU
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
if command -v cygpath >/dev/null; then  # Windows Python nepozná cesty /c/... a /tmp/...
  ROOT="$(cygpath -m "$ROOT")"; TMP="$(cygpath -m "$TMP")"
fi
trap 'rm -rf "$TMP"' EXIT
TARGETS="${*:-frontend backend-1 backend-2}"

# Zip s lomkami "/" (Compress-Archive vo Windows PowerShell 5 dáva "\" a Linux ho rozbalí zle).
mkzip() {
  python - "$@" <<'EOF'
import sys, os, zipfile
out, root, *items = sys.argv[1:]
skip = {"node_modules", "__pycache__", ".venv", ".pytest_cache", "tests"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for item in items:
        src, _, dst = item.partition("=")
        dst, path = dst or src, os.path.join(root, src)
        keep_modules = src.endswith("node_modules")
        if os.path.isfile(path):
            z.write(path, dst); continue
        for d, dirs, files in os.walk(path):
            dirs[:] = [x for x in dirs if keep_modules or x not in skip]
            for f in files:
                full = os.path.join(d, f)
                z.write(full, os.path.join(dst, os.path.relpath(full, path)).replace("\\", "/"))
EOF
}

deploy() { az webapp deploy -g "$RG" -n "$1" --src-path "$2" --type zip --timeout 1500000 -o none; }

for target in $TARGETS; do
  case "$target" in
    frontend)
      (cd "$ROOT/frontend" && npm ci --no-audit --no-fund && npm run build)
      (cd "$ROOT/frontend/azure" && npm ci --omit=dev --no-audit --no-fund)
      mkzip "$TMP/frontend.zip" "$ROOT/frontend" azure/server.js=server.js azure/package.json=package.json \
        azure/package-lock.json=package-lock.json dist=dist azure/node_modules=node_modules
      deploy hr-frontend-frantisek "$TMP/frontend.zip" ;;
    backend-1)
      # bcrypt je natívny modul – node_modules zostaví Azure (SCM_DO_BUILD_DURING_DEPLOYMENT=true)
      mkzip "$TMP/backend1.zip" "$ROOT/backend-1" src package.json package-lock.json scripts
      deploy hr-backend1-frantisek "$TMP/backend1.zip" ;;
    backend-2)
      mkzip "$TMP/backend2.zip" "$ROOT/backend-2" app requirements-azure.txt=requirements.txt
      deploy hr-backend2-frantisek "$TMP/backend2.zip" ;;
    *) echo "Neznámy cieľ: $target (frontend | backend-1 | backend-2)" >&2; exit 1 ;;
  esac
  echo "✔ $target nasadený"
done
