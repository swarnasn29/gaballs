#!/usr/bin/env bash
# Deploys mock USDT, the NFT contract and the factory under $ROOT (default gaballs.testnet) and uploads the
# machine wasm to the factory. Safe to re-run: existing accounts are reused, and a contract that is already
# initialized is redeployed without calling `new` again.
#
#   ./scripts/build-wasm.sh        # (Windows: scripts\build-wasm.ps1)
#   ROOT=gaballs.testnet ./scripts/deploy-testnet.sh
#
# Needs the ROOT key in ~/.near-credentials/testnet/. Uses about 7 NEAR from ROOT on a first deploy.
source "$(dirname "$0")/lib.sh"

MACHINE_WASM="$WASM/gaballs_machine/gaballs_machine.wasm"
for f in gaballs_mock_usdt/gaballs_mock_usdt.wasm gaballs_nft/gaballs_nft.wasm gaballs_factory/gaballs_factory.wasm \
         gaballs_machine/gaballs_machine.wasm; do
  [[ -f "$WASM/$f" ]] || { echo "missing $WASM/$f — run scripts/build-wasm first" >&2; exit 1; }
done
# Never deploy the test-hooks build (it can force a Mythic or drop a VRF callback).
if grep -qaE 'test_force_next_tier|test_drop_next_vrf_callback' "$MACHINE_WASM"; then
  echo "refusing: $MACHINE_WASM contains a test-only hook; rebuild without --features test-hooks" >&2; exit 1
fi

# Verifiable randomness (OutLayer VRF, https://outlayer.fastnear.com/docs/vrf). The public key is fetched from
# OutLayer's own endpoint, never typed in. Every machine launched afterwards keeps these settings for good.
OUTLAYER_ID="${OUTLAYER_ID:-outlayer.testnet}"
VRF_PROJECT="${VRF_PROJECT:-zavodil2.testnet/vrf-ark}"
VRF_PUBKEY_URL="${VRF_PUBKEY_URL:-https://testnet-api.outlayer.ai/vrf/pubkey}"
VRF_PUBKEY="$(curl -fsS "$VRF_PUBKEY_URL" | js 'd.vrf_public_key_hex')"
[[ "$VRF_PUBKEY" =~ ^[0-9a-f]{64}$ ]] || { echo "could not read the VRF public key from $VRF_PUBKEY_URL" >&2; exit 1; }

start_log deploy-testnet
echo "root $ROOT: $(near_balance "$ROOT")"

# 1. Sub-accounts (funded from ROOT; each keeps a full-access key until the Phase 7 lock-down).
create_sub() { # id amount
  if account_exists "$1"; then note "$1 already exists"; return; fi
  tx "create $1 ($2)" account create-account fund-myself "$1" "$2" autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$ROOT" network-config "$NETWORK" sign-with-legacy-keychain send
}
create_sub "$USDT_ID" '2.5 NEAR'
create_sub "$NFT_ID" '4 NEAR'
create_sub "$PLATFORM_ID" '0.1 NEAR'

# 2. Contracts. `new` only on a first deploy.
deploy() { # account wasm init_json label
  if [[ -n "$(code_sha256 "$1")" ]]; then
    tx "redeploy $4 to $1 (no init)" contract deploy "$1" use-file "$2" without-init-call \
      network-config "$NETWORK" sign-with-legacy-keychain send
  else
    tx "deploy $4 to $1 + new()" contract deploy "$1" use-file "$2" with-init-call new json-args "$3" \
      prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-legacy-keychain send
  fi
}
deploy "$USDT_ID" "$WASM/gaballs_mock_usdt/gaballs_mock_usdt.wasm" '{}' "mock USDT"
deploy "$NFT_ID" "$WASM/gaballs_nft/gaballs_nft.wasm" "{\"factory\":\"$ROOT\",\"usdt_contract\":\"$USDT_ID\"}" "NFT"
deploy "$ROOT" "$WASM/gaballs_factory/gaballs_factory.wasm" \
  "{\"owner\":\"$ROOT\",\"nft_contract\":\"$NFT_ID\",\"usdt_contract\":\"$USDT_ID\",\"platform_account\":\"$PLATFORM_ID\"}" "factory"

# 3. Machine code into the factory (raw wasm bytes as the call input).
tx "factory.set_machine_code(gaballs_machine.wasm)" contract call-function as-transaction "$ROOT" set_machine_code \
  file-args "$MACHINE_WASM" prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' sign-as "$ROOT" \
  network-config "$NETWORK" sign-with-legacy-keychain send

# 3b. VRF settings for new machines.
call "factory.set_vrf_config($OUTLAYER_ID, $VRF_PROJECT, key from $VRF_PUBKEY_URL)" "$ROOT" "$ROOT" set_vrf_config   "{\"vrf\":{\"outlayer_contract\":\"$OUTLAYER_ID\",\"project_id\":\"$VRF_PROJECT\",\"pubkey_hex\":\"$VRF_PUBKEY\"}}" '0 NEAR'
note "VRF public key: \`$VRF_PUBKEY\` (factory get_vrf_config: \`$(view "$ROOT" get_vrf_config | js 'd.pubkey_hex')\`)"

# 4. USDT registrations: the NFT contract and platform receive fees; ROOT and the buyers use the faucet.
for who in "$NFT_ID" "$PLATFORM_ID" "$ROOT" "buyer1.$ROOT" "buyer2.$ROOT"; do
  if [[ "$(view "$USDT_ID" storage_balance_of "{\"account_id\":\"$who\"}")" == "null" ]]; then
    call "register $who on mock USDT" "$ROOT" "$USDT_ID" storage_deposit "{\"account_id\":\"$who\"}" '0.01 NEAR'
  else
    note "$who already registered on mock USDT"
  fi
done

# 5. Verification table: deployed code hash vs local build.
{
  printf '\n## Code hashes (SHA-256 hex)\n\n| Account | Deployed | Local build | Match |\n| --- | --- | --- | --- |\n'
  for pair in "$USDT_ID:gaballs_mock_usdt/gaballs_mock_usdt.wasm" "$NFT_ID:gaballs_nft/gaballs_nft.wasm" \
              "$ROOT:gaballs_factory/gaballs_factory.wasm"; do
    acct="${pair%%:*}"; deployed="$(code_sha256 "$acct")"; local_hash="$(sha256sum "$WASM/${pair#*:}" | awk '{print $1}')"
    printf '| %s | `%s` | `%s` | %s |\n' "$acct" "$deployed" "$local_hash" "$([[ $deployed == "$local_hash" ]] && echo yes || echo NO)"
  done
  stored="$(view "$ROOT" get_config | js 'd.machine_code_sha256')"
  printf '| machine code stored in %s | `%s` | `%s` | %s |\n' "$ROOT" "$stored" "$(sha256sum "$MACHINE_WASM" | awk '{print $1}')" \
    "$([[ $stored == "$(sha256sum "$MACHINE_WASM" | awk '{print $1}')" ]] && echo yes || echo NO)"
  printf '\nROOT balance after deploy: %s\n' "$(near_balance "$ROOT")"
} | tee -a "$LOG"
echo "done. log: $LOG"
