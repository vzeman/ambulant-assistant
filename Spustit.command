#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin; do
    [[ -x "$candidate/node" ]] && export PATH="$candidate:$PATH"
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Nainštalujte Node.js 22 alebo novší z https://nodejs.org'
  read -k 1
  exit 1
fi
if ! command -v codex >/dev/null 2>&1; then
  echo 'Chýba Codex CLI. Nainštalujte ho: npm install -g @openai/codex'
  read -k 1
  exit 1
fi
if curl --silent --fail http://localhost:4317/api/status >/dev/null; then
  open http://localhost:4317
  exit 0
fi
(sleep 2; open http://localhost:4317) &
node server.mjs
