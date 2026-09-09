#!/usr/bin/env bash
# Все прогоны подряд. Падение любого — ненулевой код возврата.
#
# SEED=<число> повторяет конкретный прогон: случайность в стенде
# предсказуемая, и упавший тест воспроизводится тем же зерном.
set -uo pipefail
cd "$(dirname "$0")"

if [[ ! -d node_modules/jsdom ]]; then
  echo "Нет jsdom. Поставь: cd tools/dom-tests && npm install jsdom" >&2
  exit 2
fi

fail=0
for t in test-smoke.js test-invariants.js test-fixes.js test-double.js test-irr.js; do
  printf '%-22s ' "$t"
  if out=$(node "$t" 2>&1); then
    echo "${out##*$'\n'}"
  else
    echo "ПРОВАЛ"
    echo "$out" | grep '✗' | sed 's/^/    /'
    fail=1
  fi
done
exit $fail
