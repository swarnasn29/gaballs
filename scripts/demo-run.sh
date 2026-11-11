#!/usr/bin/env bash
# Scripted demo on testnet (after scripts/deploy-testnet.sh). Every transaction is logged with a nearblocks link
# in scripts/out/demo-run-<time>.md.
#
#   SYMBOL=GBALL ./scripts/demo-run.sh          # use a new SYMBOL for each run (a launched machine is permanent)
#   RESUME=1 SYMBOL=GBALL ./scripts/demo-run.sh # continue with an already-launched SYMBOL (skips the launch)
#
# Story (30 packs, 15 per buyer):
#   ROOT launches <SYMBOL> → buyers get mock USDT from the faucet → register on the machine token →
#   20 packs → sweep_fees → ROOT claims → ROOT transfers the Machine NFT to buyer2 → 10 more packs →
#   sweep_fees → ROOT's claim is rejected → buyer2 claims → buyer1 sells half its coins back to the curve.
#
# Randomness (Phase 5): each pack payment waits for an OutLayer VRF proof (about a minute on testnet); the CLI waits
# for the whole receipt chain, so each "opens N packs" step returns once the proof was verified and the packs settled.
#
# Mock USDT: the faucet gives 100 USDT per account per hour and each buyer needs 150. Each buyer uses its own
# faucet (100) and ROOT uses its faucet once and sends 50 to each buyer. No minting outside the faucet.
source "$(dirname "$0")/lib.sh"

SYMBOL="${SYMBOL:-GBALL}"
MACHINE="$(tr '[:upper:]' '[:lower:]' <<<"$SYMBOL").$ROOT"
TOKEN_ID="machine:$MACHINE"
B1="buyer1.$ROOT"
B2="buyer2.$ROOT"
PACK=10000000          # 10 USDT
NEED=$((15 * PACK))    # per buyer
YOCTO1='1 yoctoNEAR'

if account_exists "$MACHINE" && [[ "${RESUME:-}" != 1 ]]; then
  echo "$MACHINE already exists. A launched machine cannot be reset; run again with a new SYMBOL, e.g. SYMBOL=${SYMBOL}2," >&2
  echo "or with RESUME=1 to continue the demo on it." >&2
  exit 1
fi
start_log "demo-run-$SYMBOL"

# ---- 1. Launch -------------------------------------------------------------------------------------------
if [[ "${RESUME:-}" == 1 ]] && account_exists "$MACHINE"; then
  note "resuming with the already-launched $MACHINE (launch skipped)"
else
  cost_yocto="$(view "$ROOT" get_launch_cost | tr -d '"')"
  deposit="$(node -e 'const y = BigInt(process.argv[1]) + 10n ** 22n; console.log(`${y / 10n ** 24n}.${(y % 10n ** 24n).toString().padStart(24, "0").slice(0, 4)} NEAR`)' "$cost_yocto")"
  call "$ROOT launches $SYMBOL (attached $deposit; get_launch_cost = $cost_yocto yocto)" "$ROOT" "$ROOT" launch \
    "{\"name\":\"Gaballs\",\"symbol\":\"$SYMBOL\",\"icon\":null,\"creator_allocation\":\"100000000000000000000000000\"}" "$deposit"
fi

info="$(view "$ROOT" get_machine "{\"machine\":\"$MACHINE\"}")"
[[ "$(js 'd.nft_minted && d.usdt_registered' <<<"$info")" == "true" ]] || { echo "launch setup incomplete: $info" >&2; exit 1; }
keys="$(key_count "$MACHINE")"
deployed="$(code_sha256 "$MACHINE")"
stored="$(view "$ROOT" get_config | js 'd.machine_code_sha256')"
note "check: $MACHINE has $keys access keys"
note "check: $MACHINE code sha256 \`$deployed\` == factory machine_code_sha256 \`$stored\`: $([[ $deployed == "$stored" ]] && echo yes || echo NO)"
[[ "$keys" == "0" && "$deployed" == "$stored" ]] || { echo "machine verification failed" >&2; exit 1; }

# ---- 2. Mock USDT from the faucet -------------------------------------------------------------------------
now_ns() { node -e 'console.log((BigInt(Date.now()) * 1000000n).toString())'; }
faucet_ready() { # account → "yes" if its faucet cooldown (1 h) has passed
  local last; last="$(view "$USDT_ID" faucet_last_used "{\"account_id\":\"$1\"}")"
  node -e 'const [l, n] = process.argv.slice(1); console.log(l === "null" || BigInt(n) - BigInt(l) >= 3600n * 10n ** 9n ? "yes" : "no")' "$last" "$(now_ns)"
}
usdt_of() { view "$USDT_ID" ft_balance_of "{\"account_id\":\"$1\"}" | tr -d '"'; }

for b in "$B1" "$B2"; do
  if (( $(usdt_of "$b") < NEED )) && [[ "$(faucet_ready "$b")" == yes ]]; then
    call "$b uses the faucet (+100 USDT)" "$b" "$USDT_ID" faucet '{}' '0 NEAR'
  fi
done
short=0
for b in "$B1" "$B2"; do (( short += $(usdt_of "$b") < NEED ? NEED - $(usdt_of "$b") : 0 )); done
if (( short > 0 )) && (( $(usdt_of "$ROOT") < short )); then
  [[ "$(faucet_ready "$ROOT")" == yes ]] || { echo "faucet cooldown: buyers are $(usdt_amount $short) USDT short; retry in up to 1 hour" >&2; exit 1; }
  call "$ROOT uses the faucet (+100 USDT)" "$ROOT" "$USDT_ID" faucet '{}' '0 NEAR'
fi
for b in "$B1" "$B2"; do
  have="$(usdt_of "$b")"
  if (( have < NEED )); then
    gap=$((NEED - have))
    call "$ROOT sends $(usdt_amount $gap) USDT to $b" "$ROOT" "$USDT_ID" ft_transfer \
      "{\"receiver_id\":\"$b\",\"amount\":\"$gap\",\"memo\":\"demo top-up from ROOT's faucet\"}" "$YOCTO1"
  fi
done

# ---- 3. Register on the machine token ---------------------------------------------------------------------
for b in "$B1" "$B2"; do
  call "$b registers on the $SYMBOL token (storage_deposit)" "$b" "$MACHINE" storage_deposit '{}' '0.01 NEAR'
done

# ---- 4. Packs ---------------------------------------------------------------------------------------------
open_packs() { # buyer count
  call "$1 opens $2 packs" "$1" "$USDT_ID" ft_transfer_call \
    "{\"receiver_id\":\"$MACHINE\",\"amount\":\"$(($2 * PACK))\",\"msg\":\"{\\\"action\\\":\\\"open_pack\\\",\\\"count\\\":$2}\"}" "$YOCTO1"
  local pulls; pulls="$(view "$MACHINE" get_recent_pulls)"
  local tiers; tiers="$(js "d.slice(0, $2).reverse().map(p => p.tier + (p.capped ? '(capped)' : '')).join(', ')" <<<"$pulls")"
  local vrf; vrf="$(js "d.slice(0, $2).every(p => p.buyer === '$1' && /^vrf:\\d+:/.test(p.vrf_alpha) && p.vrf_signature.length === 128)" <<<"$pulls")"
  [[ "$vrf" == "true" ]] || { echo "packs did not settle with a VRF proof: $(js 'd.slice(0, 2)' <<<"$pulls")" >&2; exit 1; }
  note "↳ $tiers — VRF alpha \`$(js 'd[0].vrf_alpha' <<<"$pulls")\` (request $(js 'd[0].request_id' <<<"$pulls"))"
}
for round in 1 2; do open_packs "$B1" 5; open_packs "$B2" 5; done

# ---- 5. Sweep, claim, transfer ----------------------------------------------------------------------------
call "$B1 calls sweep_fees" "$B1" "$MACHINE" sweep_fees '{}' '0 NEAR'
note "NFT fee balance after sweep: $(usdt_amount "$(view "$NFT_ID" get_fee_balance "{\"token_id\":\"$TOKEN_ID\"}" | tr -d '"')") USDT"
call "$ROOT claims the Machine NFT fees" "$ROOT" "$NFT_ID" claim "{\"token_id\":\"$TOKEN_ID\"}" "$YOCTO1"
call "$ROOT transfers the Machine NFT to $B2" "$ROOT" "$NFT_ID" nft_transfer "{\"receiver_id\":\"$B2\",\"token_id\":\"$TOKEN_ID\"}" "$YOCTO1"

for b in "$B1" "$B2"; do open_packs "$b" 5; done
call "$B2 calls sweep_fees" "$B2" "$MACHINE" sweep_fees '{}' '0 NEAR'
note "NFT fee balance after second sweep: $(usdt_amount "$(view "$NFT_ID" get_fee_balance "{\"token_id\":\"$TOKEN_ID\"}" | tr -d '"')") USDT"
call_must_fail "$ROOT (old owner) tries to claim" "$ROOT" "$NFT_ID" claim "{\"token_id\":\"$TOKEN_ID\"}" "$YOCTO1"
call "$B2 (new owner) claims" "$B2" "$NFT_ID" claim "{\"token_id\":\"$TOKEN_ID\"}" "$YOCTO1"

# ---- 6. Sell-back ------------------------------------------------------------------------------------------
held="$(view "$MACHINE" ft_balance_of "{\"account_id\":\"$B1\"}" | tr -d '"')"
half="$(node -e 'console.log((BigInt(process.argv[1]) / 2n).toString())' "$held")"
quote="$(view "$MACHINE" quote_sell "{\"amount\":\"$half\"}")"
min_out="$(js 'd.usdt_out' <<<"$quote")"
usdt_before="$(usdt_of "$B1")"
call "$B1 sells half its $SYMBOL (quote: $(usdt_amount "$min_out") USDT; min_usdt_out = quote)" "$B1" "$MACHINE" sell \
  "{\"amount\":\"$half\",\"min_usdt_out\":\"$min_out\"}" "$YOCTO1"
got=$(( $(usdt_of "$B1") - usdt_before ))
note "↳ sold $(js '(BigInt(d.amount) / 10n ** 18n).toString()' <<<"$quote") tokens: $(usdt_amount "$(js 'd.usdt_gross' <<<"$quote")") USDT out of the curve, fees $(usdt_amount "$(js '(BigInt(d.nft_fee) + BigInt(d.platform_fee)).toString()' <<<"$quote")"), $B1 received $(usdt_amount "$got") USDT"
[[ "$got" == "$min_out" ]] || { echo "seller received $got, quote was $min_out" >&2; exit 1; }

# ---- 7. Summary -------------------------------------------------------------------------------------------
m="$(view "$MACHINE" get_machine)"
{
  printf '\n## Result\n\n'
  printf -- '- machine: `%s` (Machine NFT `%s`, owner now `%s`)\n' "$MACHINE" "$TOKEN_ID" \
    "$(view "$NFT_ID" nft_token "{\"token_id\":\"$TOKEN_ID\"}" | js 'd.owner_id')"
  printf -- '- randomness: OutLayer VRF (%s, project %s); pending pulls: %s; refunds: %s\n' \
    "$(js 'd.config.vrf.outlayer_contract' <<<"$m")" "$(js 'd.config.vrf.project_id' <<<"$m")" \
    "$(js 'd.pending_count' <<<"$m")" "$(js 'd.stats.refunds' <<<"$m")"
  printf -- '- sells: %s; tokens sold back: %s; USDT paid to sellers: %s\n' "$(js 'd.stats.sells' <<<"$m")" \
    "$(js '(BigInt(d.stats.total_tokens_sold) / 10n ** 18n).toString()' <<<"$m")" "$(usdt_amount "$(js 'd.stats.total_sell_usdt_paid' <<<"$m")")"
  printf -- '- packs opened: %s; tiers (Common, Rare, Epic, Mythic): %s; capped pulls: %s\n' \
    "$(js 'd.packs_opened' <<<"$m")" "$(js 'd.stats.tier_counts.join(", ")' <<<"$m")" "$(js 'd.stats.capped_pulls' <<<"$m")"
  printf -- '- best multiplier hit: %sx\n' "$(js 'd.best_multiplier_bps / 10000' <<<"$m")"
  printf -- '- price: %s USDT/token; market cap: %s USDT; vault: %s tokens\n' "$(js '(Number(d.price_usdt_wad) / 1e18).toFixed(10)' <<<"$m")" \
    "$(usdt_amount "$(js 'd.market_cap_usdt' <<<"$m")")" "$(js '(BigInt(d.vault) / 10n ** 18n).toString()' <<<"$m")"
  printf -- '- fee history of %s: %s\n' "$TOKEN_ID" \
    "$(view "$NFT_ID" get_fee_history "{\"token_id\":\"$TOKEN_ID\"}" | js 'd.map(e => e.kind + " " + (Number(e.amount) / 1e6).toFixed(2)).join(" → ")')"
  printf -- '- platform fees received by %s: %s USDT\n' "$PLATFORM_ID" "$(usdt_amount "$(usdt_of "$PLATFORM_ID")")"
  printf -- '- %s access keys: %s; %s NEAR left: %s\n' "$MACHINE" "$(key_count "$MACHINE")" "$ROOT" "$(near_balance "$ROOT")"
} | tee -a "$LOG"
echo "done. log: $LOG"
