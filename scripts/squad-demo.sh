#!/usr/bin/env bash
# Squads on testnet: group gacha with a Sputnik DAO v2 (sputnikv2.testnet), no custom multisig. Every transaction is
# logged with a nearblocks link in scripts/out/squad-demo-<time>.md. Safe to re-run: finished steps are skipped where
# the chain shows them done (the DAO exists, storage is paid, the Machine NFT is already the DAO's).
#
#   ./scripts/squad-demo.sh
#
# Story: ROOT creates the DAO "gaballs-squad" (council: OWNER, buyer1, buyer2; 2 of 3 approvals) → anyone pays its
# storage on USDT and on the flagship token → members chip in USDT → proposal: open 5 packs (ft_transfer_call from the
# DAO) → 2 approvals → the VRF proof settles and the prize lands in the DAO → proposal: split part of it equally →
# proposal: sell the rest back to the curve (USDT returns to the treasury) → the Machine NFT is given to the DAO → a
# pull creates fees → sweep_fees → proposal: claim(token_id), so the fees land in the treasury by vote.
#
# The council includes OWNER (the human, who votes from the app); this script votes with buyer1 + buyer2.
source "$(dirname "$0")/lib.sh"

SPUTNIK="${SPUTNIK:-sputnikv2.testnet}"   # https://docs.near.org/primitives/dao
DAO_NAME="${DAO_NAME:-gaballs-squad}"
DAO="$DAO_NAME.$SPUTNIK"
OWNER="${OWNER:-swarna2003.testnet}"
B1="buyer1.$ROOT"
B2="buyer2.$ROOT"
MACHINE="${MACHINE:-gaballs.$ROOT}"
TOKEN_ID="machine:$MACHINE"
PACK=10000000
CHIP=$((25 * PACK / 10))               # each member chips in 25 USDT
PACK_TGAS="${PACK_TGAS:-270}"           # sandbox minimum 230 Tgas (tests/sandbox), with margin
BOND_YOCTO=100000000000000000000000     # 0.1 NEAR proposal bond (set in the DAO policy below)
YOCTO1='1 yoctoNEAR'

start_log squad-demo
b64() { node -e 'process.stdout.write(Buffer.from(process.argv[1]).toString("base64"))' "$1"; }
usdt_of() { view "$USDT_ID" ft_balance_of "{\"account_id\":\"$1\"}" | tr -d '"'; }
tok_of() { view "$MACHINE" ft_balance_of "{\"account_id\":\"$1\"}" | tr -d '"'; }
tokens() { node -e 'console.log((BigInt(process.argv[1]) / 10n ** 18n).toLocaleString("en-US"))' "$1"; }

# act <label> <signer> <dao method json> — add_proposal / act_proposal with full gas (execution runs inside the vote).
propose() { # label proposer description receiver actions_json → sets PID
  local kind="{\"FunctionCall\":{\"receiver_id\":\"$4\",\"actions\":$5}}"
  call "$1" "$2" "$DAO" add_proposal "{\"proposal\":{\"description\":\"$3\",\"kind\":$kind}}" '0.1 NEAR'
  PID=$(( $(view "$DAO" get_last_proposal_id) - 1 ))
  note "↳ proposal #$PID: $3"
}
vote() { # proposal_id voter
  call "$2 approves proposal #$1" "$2" "$DAO" act_proposal "{\"id\":$1,\"action\":\"VoteApprove\"}" '0 NEAR'
}
status() { view "$DAO" get_proposal "{\"id\":$1}" | js 'd.status'; }
action() { # method args_json deposit_yocto tgas
  printf '{"method_name":"%s","args":"%s","deposit":"%s","gas":"%s"}' "$1" "$(b64 "$2")" "$3" "$(( $4 ))000000000000"
}

# ---- 1. The DAO -------------------------------------------------------------------------------------------------
if account_exists "$DAO"; then
  note "$DAO already exists"
else
  policy=$(cat <<JSON
{"roles":[{"name":"council","kind":{"Group":["$OWNER","$B1","$B2"]},
 "permissions":["*:AddProposal","*:VoteApprove","*:VoteReject","*:VoteRemove","*:Finalize"],"vote_policy":{}}],
 "default_vote_policy":{"weight_kind":"RoleWeight","quorum":"0","threshold":"2"},
 "proposal_bond":"$BOND_YOCTO","proposal_period":"604800000000000",
 "bounty_bond":"$BOND_YOCTO","bounty_forgiveness_period":"86400000000000"}
JSON
)
  init=$(node -e 'console.log(JSON.stringify({config:{name:"Gaballs Squad",purpose:"Group gacha on the Gaballs machine",metadata:""},policy:JSON.parse(process.argv[1])}))' "$policy")
  tx "$ROOT creates $DAO on $SPUTNIK (6 NEAR; council $OWNER, $B1, $B2; 2 of 3; bond 0.1 NEAR)" \
    contract call-function as-transaction "$SPUTNIK" create json-args "{\"name\":\"$DAO_NAME\",\"args\":\"$(b64 "$init")\"}" \
    prepaid-gas '150.0 Tgas' attached-deposit '6 NEAR' sign-as "$ROOT" network-config "$NETWORK" sign-with-legacy-keychain send
fi
pol="$(view "$DAO" get_policy)"
note "check: threshold $(js 'd.default_vote_policy.threshold' <<<"$pol"), council $(js 'd.roles[0].kind.Group.join(", ")' <<<"$pol"), bond $(js 'd.proposal_bond' <<<"$pol") yocto; DAO code hash \`$(near account view-account-summary "$DAO" network-config "$NETWORK" now 2>&1 | grep -oE 'Contract \(SHA-256 checksum hex\) +[0-9a-f]{64}' | awk '{print $NF}')\`"

# ---- 2. Storage (anyone can pay) and chip-ins ---------------------------------------------------------------------
if [[ "$(view "$USDT_ID" storage_balance_of "{\"account_id\":\"$DAO\"}")" == "null" ]]; then
  call "$ROOT pays the DAO's storage on mock USDT" "$ROOT" "$USDT_ID" storage_deposit "{\"account_id\":\"$DAO\"}" '0.0125 NEAR'
fi
if [[ "$(view "$MACHINE" storage_balance_of "{\"account_id\":\"$DAO\"}")" == "null" ]]; then
  call "$ROOT pays the DAO's storage on the $MACHINE token" "$ROOT" "$MACHINE" storage_deposit "{\"account_id\":\"$DAO\"}" '0.01 NEAR'
fi
# Each member chips in up to CHIP; together they must cover 5 packs (50 USDT). buyer1 tops up whatever buyer2 can't.
NEED_TREASURY=$((5 * PACK))
have_dao="$(usdt_of "$DAO")"
if (( have_dao < NEED_TREASURY )); then
  b2_has="$(usdt_of "$B2")"
  c2=$(( b2_has < CHIP ? b2_has : CHIP ))
  c1=$(( NEED_TREASURY - have_dao - c2 ))
  (( c1 <= $(usdt_of "$B1") )) || { echo "members are short of mock USDT for 5 packs; use the faucet (1 h cooldown) and re-run" >&2; exit 1; }
  for pair in "$B1:$c1" "$B2:$c2"; do
    m="${pair%%:*}"; amt="${pair#*:}"
    (( amt > 0 )) || continue
    call "$m chips in $(usdt_amount "$amt") USDT" "$m" "$USDT_ID" ft_transfer "{\"receiver_id\":\"$DAO\",\"amount\":\"$amt\",\"memo\":\"squad chip-in\"}" "$YOCTO1"
  done
fi
note "treasury: $(usdt_amount "$(usdt_of "$DAO")") USDT"

# ---- 3. Open 5 packs by vote ---------------------------------------------------------------------------------------
msg='{"action":"open_pack","count":5}'
open_args=$(node -e 'console.log(JSON.stringify({receiver_id:process.argv[1],amount:String(5*10000000),msg:process.argv[2]}))' "$MACHINE" "$msg")
propose "$B1 proposes: open 5 packs (ft_transfer_call, $PACK_TGAS Tgas)" "$B1" "Open 5 packs on $MACHINE" "$USDT_ID" \
  "[$(action ft_transfer_call "$open_args" 1 "$PACK_TGAS")]"
OPEN_ID=$PID

vote "$OPEN_ID" "$B1"
vote "$OPEN_ID" "$B2"   # the deciding vote executes the proposal; this transaction waits for the VRF proof (~1 min)
note "↳ proposal #$OPEN_ID status: $(status "$OPEN_ID")"
pulls="$(view "$MACHINE" get_recent_pulls)"
mine="$(js "d.filter(p => p.buyer === '$DAO').slice(0, 5).reverse()" <<<"$pulls")"
[[ "$(js 'd.length' <<<"$mine")" == "5" ]] || { echo "the DAO's packs did not settle: $(js 'd.slice(0,2)' <<<"$pulls")" >&2; exit 1; }
note "↳ $(js 'd.map(p => p.tier + " " + (p.multiplier_bps / 10000) + "x").join(", ")' <<<"$mine") — VRF alpha \`$(js 'd[0].vrf_alpha' <<<"$mine")\` (signed by the deciding voter, paid to the DAO)"
note "↳ prize in the treasury: $(tokens "$(tok_of "$DAO")") GABALLS"
mythic="$(js 'd.find(p => p.tier === "Mythic")?.pull_id ?? ""' <<<"$mine")"
if [[ -n "$mythic" ]]; then
  note "↳ Mythic! certificate cert:$MACHINE:$mythic owner: $(view "$NFT_ID" nft_token "{\"token_id\":\"cert:$MACHINE:$mythic\"}" | js 'd.owner_id')"
fi

# ---- 4. Split 60% equally, sell the rest back ----------------------------------------------------------------------
held="$(tok_of "$DAO")"
share=$(node -e 'console.log((BigInt(process.argv[1]) / 5n).toString())' "$held")
min_storage="$(view "$MACHINE" storage_balance_bounds | js 'd.min')"
acts=""
for m in "$OWNER" "$B1" "$B2"; do acts+="$(action storage_deposit "{\"account_id\":\"$m\",\"registration_only\":true}" "$min_storage" 10),"; done
for m in "$OWNER" "$B1" "$B2"; do acts+="$(action ft_transfer "{\"receiver_id\":\"$m\",\"amount\":\"$share\",\"memo\":\"squad split\"}" 1 15),"; done
propose "$B2 proposes: split $(tokens "$share") GABALLS to each member" "$B2" "Split the prize: 20% each" "$MACHINE" "[${acts%,}]"
SPLIT_ID=$PID
vote "$SPLIT_ID" "$B1"
vote "$SPLIT_ID" "$B2"
note "↳ proposal #$SPLIT_ID status: $(status "$SPLIT_ID"); balances: $OWNER $(tokens "$(tok_of "$OWNER")"), $B1 $(tokens "$(tok_of "$B1")"), $B2 $(tokens "$(tok_of "$B2")")"

left="$(tok_of "$DAO")"
quote="$(view "$MACHINE" quote_sell "{\"amount\":\"$left\"}")"
min_out=$(node -e 'console.log((BigInt(process.argv[1]) * 99n / 100n).toString())' "$(js 'd.usdt_out' <<<"$quote")")
usdt_before="$(usdt_of "$DAO")"
propose "$B1 proposes: sell the remaining $(tokens "$left") GABALLS (quote $(usdt_amount "$(js 'd.usdt_out' <<<"$quote")") USDT, min 99%)" "$B1" \
  "Sell the rest back to the curve" "$MACHINE" "[$(action sell "{\"amount\":\"$left\",\"min_usdt_out\":\"$min_out\"}" 1 100)]"
SELL_ID=$PID
vote "$SELL_ID" "$B1"
vote "$SELL_ID" "$B2"
note "↳ proposal #$SELL_ID status: $(status "$SELL_ID"); USDT back in the treasury: $(usdt_amount $(( $(usdt_of "$DAO") - usdt_before )))"

# ---- 5. Co-own the machine: its Machine NFT earns fees for the squad ------------------------------------------------
owner_now="$(view "$NFT_ID" nft_token "{\"token_id\":\"$TOKEN_ID\"}" | js 'd.owner_id')"
if [[ "$owner_now" != "$DAO" ]]; then
  call "$owner_now gives the Machine NFT $TOKEN_ID to the DAO" "$owner_now" "$NFT_ID" nft_transfer "{\"receiver_id\":\"$DAO\",\"token_id\":\"$TOKEN_ID\"}" "$YOCTO1"
fi
if (( $(usdt_of "$B1") >= PACK )); then
  call "$B1 opens 1 pack (fees for the squad's machine)" "$B1" "$USDT_ID" ft_transfer_call \
    "{\"receiver_id\":\"$MACHINE\",\"amount\":\"$PACK\",\"msg\":\"{\\\"action\\\":\\\"open_pack\\\",\\\"count\\\":1}\"}" "$YOCTO1"
fi
call "$B2 calls sweep_fees (accrued fees → the Machine NFT)" "$B2" "$MACHINE" sweep_fees '{}' '0 NEAR'
fees="$(view "$NFT_ID" get_fee_balance "{\"token_id\":\"$TOKEN_ID\"}" | tr -d '"')"
note "↳ fee balance on $TOKEN_ID (owned by the DAO): $(usdt_amount "$fees") USDT"
usdt_before="$(usdt_of "$DAO")"
propose "$B2 proposes: claim the machine's fees" "$B2" "Claim machine fees" "$NFT_ID" "[$(action claim "{\"token_id\":\"$TOKEN_ID\"}" 1 60)]"
CLAIM_ID=$PID
vote "$CLAIM_ID" "$B1"
vote "$CLAIM_ID" "$B2"
note "↳ proposal #$CLAIM_ID status: $(status "$CLAIM_ID"); fees claimed into the treasury: $(usdt_amount $(( $(usdt_of "$DAO") - usdt_before ))) USDT"

# ---- Summary ------------------------------------------------------------------------------------------------------
{
  printf '\n## Result\n\n'
  printf -- '- DAO: `%s` (Sputnik DAO v2 via `%s`), council %s, %s, %s; 2 of 3\n' "$DAO" "$SPUTNIK" "$OWNER" "$B1" "$B2"
  printf -- '- treasury: %s USDT, %s GABALLS; owns `%s` (fee balance %s USDT)\n' "$(usdt_amount "$(usdt_of "$DAO")")" \
    "$(tokens "$(tok_of "$DAO")")" "$TOKEN_ID" "$(usdt_amount "$(view "$NFT_ID" get_fee_balance "{\"token_id\":\"$TOKEN_ID\"}" | tr -d '"')")"
  printf -- '- proposals: open packs #%s, split #%s, sell #%s, claim fees #%s — all %s\n' "$OPEN_ID" "$SPLIT_ID" "$SELL_ID" "$CLAIM_ID" \
    "$(for i in $OPEN_ID $SPLIT_ID $SELL_ID $CLAIM_ID; do status $i; done | sort -u | tr '\n' ' ')"
  printf -- '- certificates owned by the DAO: %s\n' "$(view "$NFT_ID" nft_tokens_for_owner "{\"account_id\":\"$DAO\"}" | js 'd.filter(t => t.token_id.startsWith("cert:")).map(t => t.token_id).join(", ") || "none"')"
} | tee -a "$LOG"
echo "done. log: $LOG"
