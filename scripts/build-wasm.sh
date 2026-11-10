#!/usr/bin/env bash
# Builds every contract to target/near/. macOS / Linux. (Windows: scripts/build-wasm.ps1)
# The test-hooks machine is ONLY for sandbox tests; it is never deployed.
set -euo pipefail
cd "$(dirname "$0")/.."
for c in mock-usdt nft machine factory; do
  (cd "contracts/$c" && cargo near build non-reproducible-wasm "$@")
done
(cd contracts/machine && cargo near build non-reproducible-wasm --features test-hooks --out-dir ../../target/near/machine_test_hooks "$@")
ls -l target/near/*/*.wasm
