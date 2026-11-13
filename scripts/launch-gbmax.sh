#!/usr/bin/env bash
# Launches the variable-pack-size flagship (Gaballs Max, $GBMAX) from the factory and opens two packs of different
# sizes on it with real OutLayer VRF. Every transaction is logged to scripts/out/launch-gbmax-*.md.
#   ./scripts/launch-gbmax.sh             # launch + packs
#   RESUME=1 ./scripts/launch-gbmax.sh    # machine already launched: only the packs
# Needs the gaballs.testnet, buyer1 and buyer2 keys in ~/.near-credentials/testnet/.
source "$(dirname "$0")/lib.sh"

SYMBOL=GBMAX
MACHINE="$(tr '[:upper:]' '[:lower:]' <<<"$SYMBOL").$ROOT"
start_log launch-gbmax

# ---- 1. Launch ---------------------------------------------------------------------------------------------
if [[ "${RESUME:-}" == 1 ]] && account_exists "$MACHINE"; then
  note "resuming with the already-launched $MACHINE (launch skipped)"
else
  cost_yocto="$(view "$ROOT" get_launch_cost | tr -d '"')"
  deposit="$(node -e 'const y = BigInt(process.argv[1]) + 10n ** 22n; console.log(`${y / 10n ** 24n}.${(y % 10n ** 24n).toString().padStart(24, "0").slice(0, 4)} NEAR`)' "$cost_yocto")"
  call "$ROOT launches $SYMBOL (attached $deposit; get_launch_cost = $cost_yocto yocto)" "$ROOT" "$ROOT" launch \
    "{\"name\":\"Gaballs Max\",\"symbol\":\"$SYMBOL\",\"icon\":null,\"creator_allocation\":\"100000000000000000000000000\"}" "$deposit"
fi

info="$(view "$ROOT" get_machine "{\"machine\":\"$MACHINE\"}")"
[[ "$(js 'd.nft_minted && d.usdt_registered' <<<"$info")" == "true" ]] || { echo "launch setup incomplete: $info" >&2; exit 1; }
keys="$(key_count "$MACHINE")"
deployed="$(code_sha256 "$MACHINE")"
stored="$(view "$ROOT" get_config | js 'd.machine_code_sha256')"
range="$(view "$MACHINE" get_machine | js '`${d.config.pack_price} to ${d.config.max_pack_price}`')"
note "check: $MACHINE has $keys access keys"
note "check: $MACHINE code sha256 \`$deployed\` == factory machine_code_sha256 \`$stored\`: $([[ $deployed == "$stored" ]] && echo yes || echo NO)"
note "check: $MACHINE pack range (USDT units) $range"
[[ "$keys" == "0" && "$deployed" == "$stored" ]] || { echo "machine verification failed" >&2; exit 1; }

# ---- 2. Two packs of different sizes ------------------------------------------------------------------------
open_pack() { # buyer amount_units
  local buyer=$1 amount=$2 before after
  if [[ "$(view "$MACHINE" storage_balance_of "{\"account_id\":\"$buyer\"}")" == "null" ]]; then
    call "$buyer registers on $SYMBOL" "$buyer" "$MACHINE" storage_deposit "{\"account_id\":\"$buyer\"}" '0.01 NEAR'
  fi
  local have; have="$(view "$USDT_ID" ft_balance_of "{\"account_id\":\"$buyer\"}" | tr -d '"')"
  if (( have < amount )); then
    call "$buyer: mock USDT faucet (+100)" "$buyer" "$USDT_ID" faucet '{}' '0 NEAR'
  fi
  before="$(view "$MACHINE" get_machine | js 'd.request_nonce')"
  call "$buyer opens ONE pack of $(usdt_amount "$amount") USDT (msg {\"action\":\"open_pack\"})" "$buyer" "$USDT_ID" ft_transfer_call \
    "{\"receiver_id\":\"$MACHINE\",\"amount\":\"$amount\",\"msg\":\"{\\\"action\\\":\\\"open_pack\\\"}\"}" '1 yoctoNEAR'
  for _ in $(seq 1 40); do
    local pull; pull="$(view "$MACHINE" get_recent_pulls | js "JSON.stringify(d.find(p => p.request_id === $before) || null)")"
    if [[ "$pull" != "null" ]]; then
      note "↳ request $before: $(js '`${d.tier} ${d.multiplier_bps / 10000}x, usdt_in ${d.usdt_in}, bought ${d.bought}, payout ${d.payout}, capped ${d.capped}, pull #${d.pull_id}`' <<<"$pull")"
      return
    fi
    if [[ "$(view "$MACHINE" get_pending_pull "{\"request_id\":$before}")" == "null" ]]; then
      note "↳ request $before: refunded (see the transaction's pack_refunded event)"; return
    fi
    sleep 3
  done
  note "↳ request $before: still pending after 2 minutes"
}

open_pack buyer1.gaballs.testnet 75000000    # 75 USDT
open_pack buyer2.gaballs.testnet 37500000    # 37.5 USDT

m="$(view "$MACHINE" get_machine)"
note "after: packs_opened $(js 'd.packs_opened' <<<"$m"), total_usdt_in $(js 'd.stats.total_usdt_in' <<<"$m"), vault $(js 'd.vault' <<<"$m"), refunds $(js 'd.stats.refunds' <<<"$m")"
echo "done. log: $LOG"
