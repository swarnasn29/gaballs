# CLAUDE.md — Gaballs (NEAR HACKATHON 2026)

You are the senior engineer on this repo. The human is a product designer with no development background.
Explain decisions in plain words, show proof (test output, explorer links) instead of claims, and stop at
every checkpoint named in the phase prompt you were given.

## 0. Hackathon rules you must follow

- Read https://nearhackathon.com/HACKATHON.md at the start of the first session and again before submission.
  Follow its "Never without the human's explicit confirmation" list exactly: never submit, post, make the repo
  public, push, sign mainnet transactions, spend tokens or commit secrets without a clear yes from the human.
- Deadline: 2026-11-14T23:59:00Z (= Sun Nov 15, 05:29 IST). Internal target: contracts frozen Fri Nov 13 night IST.
- AI judges (Claude Code, Codex) screen the repo first: the README must let a machine reproduce every claim
  with numbered "do X, see Y" steps. No marketing copy.
- Look up contract addresses, endpoints and SDK versions in the docs (https://docs.near.org/llms.txt,
  https://docs.near-intents.org/llms.txt, the NEAR agent skills). Never guess them.
- Testnet first. Keys live in ~/.near-credentials or .env; .env is in .gitignore. Never print private keys.
- Keep a running "Built with" list (libraries, templates, AI-generated code) for the README.

## 1. Product in one paragraph

Gaballs is a gacha launchpad. A creator launches a memecoin together with a gacha machine. Every 10 USDT pack is
a market buy of that coin on the machine's own bonding curve; a random draw from a fixed, public odds table then
multiplies what the buyer receives. Commons feed a prize vault; Rare/Epic/Mythic pulls draw from it. The creator
gets a transferable Machine Ownership NFT that accrues the creator fees in its own balance. Mythic pulls also mint
a soulbound certificate NFT.

Tracks claimed: `memecoins` (primary), `nfts` (secondary), `social` only if the Sputnik DAO shared pot works.

## 2. Fixed economics (all set at launch, no admin setters, readable via views)

| Tier | Chance (bps of 10,000) | Multiplier |
| --- | --- | --- |
| Common | 7,500 | 0.70x |
| Rare | 2,000 | 1.25x |
| Epic | 400 | 2.50x |
| Mythic | 100 | 8.00x (+ certificate NFT) |

Expected multiplier 0.955. Expected vault drift per pack = +0.045 x `bought`.

- Supply: 1,000,000,000 tokens, 18 decimals. Split at launch: `curve_inventory` (default 800M), `vault_seed`
  (default 100M), `creator_allocation` (0–100M, creator chooses; remainder goes to the curve).
- Pack price: 10 USDT (USDT has 6 decimals → 10_000_000). Parameter `pack_price` set at launch.
- Fees, taken from the USDT before it enters the curve: 50 bps to the Machine NFT, 20 bps to platform.
- Curve: constant product with virtual USDT reserve `V` (launch parameter, default 3,000 USDT), real USDT reserve
  `R` (starts 0), tokens on curve `T`.
  - price = (V + R) / T
  - buy with u USDT: bought = T - (V+R)*T / (V+R+u); then R += u, T -= bought
  - sell s tokens: usdt_out = (V+R) - (V+R)*T / (T+s); reject if usdt_out > R; then R -= usdt_out, T += s;
    fees taken from usdt_out.
- Pull: payout = bought * m. If m < 1 → (bought - payout) to vault. If m > 1 → extra = payout - bought taken
  from the vault, capped at `max_vault_draw_bps` of the current vault (default 2,500 = 25%). Capped pulls are
  flagged in the event.
- Use U256 (e.g. `primitive-types` or `uint`) for curve maths; (V+R)*T overflows u128. Round in the contract's
  favour (buyer gets floor).
- Final defaults for V, vault seed and cap are chosen by the human after the Phase 0 simulation. Record the
  chosen values in docs/PARAMETERS.md.

## 3. Contracts (Rust, near-sdk, built with cargo-near)

Account layout on testnet (replace `gaballs` with the human's chosen root account):

| Contract | Account | Notes |
| --- | --- | --- |
| Factory | `gaballs.testnet` | Holds the machine wasm; `launch()` deploys `<symbol>.gaballs.testnet` |
| Machine + token (one per launch) | `<symbol>.gaballs.testnet` | NEP-141 + NEP-145 + NEP-148 + machine logic |
| NFT | `nft.gaballs.testnet` | NEP-171/177/178/181 |
| Mock USDT | `usdt.gaballs.testnet` | NEP-141, 6 decimals, `faucet()` mints 100 USDT per call, rate limited per account |

### 3.1 Machine + token (the core)

The token and the machine are ONE contract, so a pull settles in one receipt and the prize is an internal
balance move. State: token ledger, curve (V, R, T), vault balance, odds table, fee accruals, nft_token_id,
usdt contract id, nft contract id, platform account, recent pulls ring buffer (last 50), pull nonce.

Entry points:
- `ft_on_transfer(sender_id, amount, msg)` — MUST assert `env::predecessor_account_id() == usdt_contract`
  (otherwise anyone could fake a payment). `msg` = `{"action":"open_pack","count":1}` (count 1–5). Amount must
  equal `pack_price * count`, otherwise return the full amount (refund). Executes the pull(s), returns "0".
  Never panic after state changes in a way that would refund USDT while keeping a payout.
- `sell(amount, min_usdt_out)` — sell-back (Phase 5). Burns from caller into curve, sends USDT via ft_transfer.
  Handle the failed-transfer callback by restoring state.
- `sweep_fees()` — anyone can call; sends accrued NFT fees as `ft_transfer_call` to the NFT contract with
  msg `{"token_id": "<machine nft id>"}` and platform fees to the platform account. Restore accruals if the
  transfer fails (callback).
- Views: `get_machine()` (all parameters, curve state, vault, price, totals), `get_odds()`,
  `quote_pack(count)` (expected bought at current price), `get_recent_pulls()`, `ft_*` views.

Randomness (Phase 1): `seed = sha256(env::random_seed() ++ buyer ++ nonce)`; roll = first 8 bytes as u64 % 10,000;
tiers by cumulative bps. Store seed hex and block height in the pull record. Keep randomness behind one function
`draw_roll(...)` so Phase 5 can swap in OutLayer VRF without touching the rest.

Storage: buyers must be registered on the machine token (NEP-145) before a pull pays out. If not registered,
refund the USDT. The frontend batches `storage_deposit` before the first pack.

Mythic: call `nft_contract.mint_certificate(receiver, machine, pull_id)` with the needed storage deposit paid from
the machine's NEAR balance. A failed mint must not undo the token payout.

Events (NEP-297, standard "gaballs", version "1.0.0"): `machine_launched`, `pack_opened` (buyer, usdt_in, tier,
multiplier_bps, bought, payout, vault_after, price_before, price_after, capped, seed, block), `fees_swept`,
`tokens_sold`.

No owner methods that change economics. No upgrade key after launch (deploy and init in the factory, then the
machine account has no full-access key). Document this in the README with a command judges can run to check
(`near account list-keys`).

### 3.2 NFT contract

- Two kinds of token: `machine:<machine_account>` (transferable) and `cert:<machine>:<pull_id>` (soulbound:
  `nft_transfer` and `nft_transfer_call` panic for these).
- `mint_machine_nft(receiver, machine)` — callable only by the factory.
- `mint_certificate(receiver, machine, pull_id)` — callable only by a machine registered by the factory.
- Fee balances: `ft_on_transfer` accepts only from the USDT contract, only when `sender_id` is the machine bound to
  that token id; credits `fee_balance[token_id]`.
- `claim(token_id)` — only the current owner; set balance to 0 before the transfer, restore in the failure callback.
  Unclaimed balance stays with the token on transfer: that is the "NFT holds money" mechanic.
- Views: `get_fee_balance(token_id)`, `get_fee_history(token_id)` (last 20 credits/claims), standard enumeration.
- Write the transfer threat model in docs/THREAT_MODEL.md before coding (every way a seller could try to keep the
  money: claim front-run, approval left behind, transfer during sweep, etc.) and a test for each.

### 3.3 Factory

- Stores the machine wasm (deploy it with a method like `set_machine_code`, owner-only, before launches).
- `launch(name, symbol, icon, creator_allocation, ...)` payable: requires enough deposit for account + storage
  (compute it, expose `get_launch_cost()` view). Creates the sub-account, deploys, initializes with fixed
  parameters, registers the machine with the NFT contract, mints the Machine NFT to the creator.
- `get_machines()` view for the frontend list.

### 3.4 Mock USDT

Standard NEP-141 with 6 decimals and `faucet()`. Clearly named "Mock USDT (testnet)" in metadata and UI.

## 4. Tests (required, run before every checkpoint)

- Unit tests: curve buy/sell maths against a reference implementation, rounding, overflow at large R.
- Odds: 100,000 simulated rolls land within 0.5 percentage points of each tier's chance.
- Pull accounting invariant after every pull: token supply constant; curve + vault + all balances = 1B.
- USDT invariant: R + accrued fees + swept fees = total USDT received - USDT paid out by sells.
- Security: fake `ft_on_transfer` from a non-USDT caller is rejected; wrong amount refunds; unregistered buyer
  refunds; vault cap respected; certificate cannot be transferred; only NFT owner can claim; sale mid-sweep.
- Sandbox integration tests with near-workspaces covering launch → pack → sweep → transfer NFT → new owner claims.

## 5. Frontend

- Next.js (App Router) + TypeScript + Tailwind. Wallet connection and RPC per the `near-dapp` agent skill;
  look up the current recommended wallet library there.
- Screens (the human provides designs): Home (machine list), Launch, Machine page (odds table, price, vault
  health, recent pulls log, "Open pack"), Pack reveal (animation, tier, tokens received, USD value, link to tx),
  My stuff (balances, Machine NFTs with fee balance + Claim, certificates, Sell), Faucet button for mock USDT.
- Every number shown links to its source (view call or tx). Odds and a risk notice are always visible near the
  buy button.
- Deploy to Vercel. Contract ids come from env vars.

## 6. Optional parts (only in the phase that names them)

- OutLayer VRF: https://outlayer.fastnear.com/docs/vrf — verify signatures on-chain with `env::ed25519_verify`;
  the pull becomes request → callback with a pending state and a refund path on timeout.
- NEAR Intents 1Click (mainnet only, no testnet exists): https://docs.near-intents.org/near-intents/1click-api —
  "Top up from any chain" panel: tokens list → dry quote → real quote (deposit address) → status polling.
  USDT is delivered to the buyer's NEAR account. JWT is optional (0.2% fee without it). Tiny amounts only, human
  watching.
- Sputnik DAO shared pot: a testnet DAO that owns a Machine NFT (claims via proposal) and opens packs via a
  FunctionCall proposal to `usdt.ft_transfer_call`. Do not write a new multisig.

## 7. Repo layout

```
contracts/machine  contracts/nft  contracts/factory  contracts/mock-usdt
tests/sandbox      sim/ (simulation)  app/ (Next.js)  scripts/ (deploy + demo run)
docs/PARAMETERS.md docs/THREAT_MODEL.md docs/DEPLOYMENTS.md (tx links)  README.md  LICENSE (MIT)
```

## 8. Working style

- One phase per session. At the checkpoint: summarize in plain words, show test output and explorer links,
  list what is left, then stop and wait.
- Commit after each green checkpoint (ask first before pushing).
- If you hit the same error three times, stop and explain the blocker in plain words with two options.
- Never widen scope beyond the current phase. Never change the economics in section 2 without the human's yes.

## 9. Cut list (if behind schedule, drop in this order)

1. Sputnik DAO shared pot  2. Intents top-up (keep a dry-quote screen)  3. OutLayer VRF  4. Sell-back
5. Mythic certificate NFT.
Never cut: curve + pull + vault, fees on the Machine NFT with claim, machine page with pull log, README judge
steps, demo video.
