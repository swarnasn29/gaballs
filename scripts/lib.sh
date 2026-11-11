# Shared helpers for scripts/deploy-testnet.sh and scripts/demo-run.sh. Source it; do not run it.
# Needs: near (near-cli-rs >= 0.14), node (JSON parsing), sha256sum. Keys come from ~/.near-credentials
# (legacy keychain); nothing secret is printed or written.

set -euo pipefail

NETWORK="${NETWORK:-testnet}"
EXPLORER="${EXPLORER:-https://testnet.nearblocks.io}"
ROOT="${ROOT:-gaballs.testnet}"
USDT_ID="usdt.$ROOT"
NFT_ID="nft.$ROOT"
PLATFORM_ID="platform.$ROOT"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM="$REPO/target/near"

for bin in near node sha256sum; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin" >&2; exit 1; }
done

# Every signed transaction is appended to $LOG as a markdown table row: | step | tx link |
start_log() {
  mkdir -p "$REPO/scripts/out"
  LOG="$REPO/scripts/out/$1-$(date -u +%Y%m%dT%H%M%SZ).md"
  printf '# %s on %s (%s UTC)\n\n| Step | Transaction |\n| --- | --- |\n' "$1" "$NETWORK" "$(date -u '+%F %T')" > "$LOG"
  echo "log: $LOG"
}

note() { printf '| %s | — |\n' "$*" >> "$LOG"; echo "  --  $*"; }

_record() { # label hash suffix
  local link="—"
  [[ -n "$2" ]] && link="[${2:0:8}…]($EXPLORER/txns/$2)"
  printf '| %s%s | %s |\n' "$1" "$3" "$link" >> "$LOG"
  echo "  ok  $1$3  ${2:+$EXPLORER/txns/$2}"
}

# tx <label> <near args...> — runs a signed near command; exits the script if the transaction fails.
tx() {
  local label="$1"; shift
  local out code=0
  out="$(near "$@" 2>&1)" || code=$?
  LAST_TX="$(grep -oE 'Transaction ID: [1-9A-HJ-NP-Za-km-z]+' <<<"$out" | tail -1 | awk '{print $3}')" || true
  if [[ $code -ne 0 ]] || grep -qE 'Failure|panicked|ExecutionError|Error:' <<<"$out"; then
    echo "$out" | tail -30 >&2
    echo "FAILED: $label" >&2
    exit 1
  fi
  _record "$label" "$LAST_TX" ""
}

# tx_must_fail <label> <near args...> — the transaction is expected to be rejected (e.g. old owner's claim).
tx_must_fail() {
  local label="$1"; shift
  local out code=0
  out="$(near "$@" 2>&1)" || code=$?
  LAST_TX="$(grep -oE 'Transaction ID: [1-9A-HJ-NP-Za-km-z]+' <<<"$out" | tail -1 | awk '{print $3}')" || true
  if [[ $code -eq 0 ]] && ! grep -qE 'Failure|panicked|ExecutionError|Error:' <<<"$out"; then
    echo "$out" | tail -20 >&2
    echo "UNEXPECTED SUCCESS: $label" >&2
    exit 1
  fi
  local reason
  reason="$(grep -oE 'Smart contract panicked: [^"\\]*' <<<"$out" | head -1 || true)"
  _record "$label" "$LAST_TX" " — rejected as expected${reason:+ (${reason#Smart contract panicked: })}"
}

# call <label> <signer> <contract> <method> <json> <deposit>
call() {
  tx "$1" contract call-function as-transaction "$3" "$4" json-args "$5" prepaid-gas '300.0 Tgas' \
    attached-deposit "$6" sign-as "$2" network-config "$NETWORK" sign-with-legacy-keychain send
}

call_must_fail() {
  tx_must_fail "$1" contract call-function as-transaction "$3" "$4" json-args "$5" prepaid-gas '300.0 Tgas' \
    attached-deposit "$6" sign-as "$2" network-config "$NETWORK" sign-with-legacy-keychain send
}

# view <contract> <method> [json] — prints the JSON result.
view() {
  near contract call-function as-read-only "$1" "$2" json-args "${3:-{\}}" network-config "$NETWORK" now 2>/dev/null
}

# jq-lite: `view ... | js 'd.stats.packs_opened'`
js() {
  node -e 'const d = JSON.parse(require("fs").readFileSync(0, "utf8")); const r = eval(process.argv[1]);
           console.log(typeof r === "object" ? JSON.stringify(r) : r)' "$1"
}

account_exists() {
  local out; out="$(near account view-account-summary "$1" network-config "$NETWORK" now 2>&1 || true)"
  ! grep -q 'does not exist' <<<"$out"
}

code_sha256() { # deployed contract's SHA-256 (hex), empty if none
  near account view-account-summary "$1" network-config "$NETWORK" now 2>&1 \
    | grep -oE 'Contract \(SHA-256 checksum hex\) +[0-9a-f]{64}' | awk '{print $NF}' || true
}

near_balance() {
  near account view-account-summary "$1" network-config "$NETWORK" now 2>&1 | grep 'Native account balance' \
    | sed -E 's/.*balance +//; s/ +$//'
}

key_count() { # number of access keys on an account
  near account list-keys "$1" network-config "$NETWORK" now 2>&1 | grep -cE '^\| [0-9]+ +\| ed25519:' || true
}

usdt_amount() { node -e 'const u = BigInt(process.argv[1]); console.log(`${u / 1000000n}.${(u % 1000000n).toString().padStart(6, "0")}`)' "$1"; }
