# Gaballs

A gacha launchpad on NEAR. A creator launches a memecoin together with a gacha machine. Every 10 USDT pack is a
market buy of that coin on the machine's own bonding curve; a random draw from a fixed, public odds table then
multiplies what the buyer receives. Commons feed a prize vault; Rare/Epic/Mythic pulls draw from it. The creator
holds a transferable Machine Ownership NFT that accrues creator fees in its own balance.

Built at NEAR HACKATHON 2026. Tracks: `memecoins` (primary), `nfts` (secondary).

> Status: contracts on testnet, frontend live (Phases 0–4). Sections marked _TBD_ are filled in as each phase lands.

**Live app (testnet):** https://gaballs.vercel.app — connect a NEAR testnet wallet; get mock USDT on "My stuff".

## 1. What to check in 5 minutes (judge quick path)

_TBD — numbered "do X, see Y" steps against the live testnet deployment._

## 2. Problem and mechanic

_TBD_

## 3. Economics (fixed at launch, readable on-chain)

| Tier | Chance | Multiplier |
| --- | --- | --- |
| Common | 75% | 0.70x |
| Rare | 20% | 1.25x |
| Epic | 4% | 2.50x |
| Mythic | 1% | 8.00x (+ certificate NFT) |

Chosen curve / vault / cap parameters and the simulation behind them: [docs/PARAMETERS.md](docs/PARAMETERS.md).
Re-run the simulation: see [sim/README.md](sim/README.md).

## 4. Architecture

| Contract | Testnet account | Source | What it does |
| --- | --- | --- | --- |
| Factory | _TBD_ | `contracts/factory` | Stores the machine wasm; `launch()` creates `<symbol>.<factory>` with no access keys, registers it on USDT, mints its Machine NFT |
| Machine + token (one per launch) | _TBD_ | `contracts/machine` | NEP-141/145/148 memecoin + bonding curve + gacha pulls + prize vault; `sweep_fees()` sends fees to the NFT |
| NFT (Machine NFT + Mythic certificates) | _TBD_ | `contracts/nft` | NEP-171/177/178/181; Machine NFTs hold a USDT fee balance only the current owner can claim; certificates are soulbound |
| Mock USDT (testnet) | _TBD_ | `contracts/mock-usdt` | NEP-141, 6 decimals, `faucet()` = 100 USDT per account per hour |
| OutLayer (external, not ours) | `outlayer.testnet`, project `zavodil2.testnet/vrf-ark` | [out-layer/vrf-example](https://github.com/out-layer/vrf-example) | Runs the VRF module; returns an Ed25519 signature over `vrf:{request_id}:{buyer}:{seed}` |

How the money flows: buyer → `usdt.ft_transfer_call(machine, 10 USDT)` → machine keeps 9.93 USDT in its curve, accrues
0.05 USDT for the Machine NFT and 0.02 USDT for the platform → `sweep_fees()` → `usdt.ft_transfer_call(nft, fees,
{"token_id":"machine:<machine>"})` → the NFT contract credits that token → its current owner calls `claim`.

**Randomness (OutLayer VRF).** Paying for packs does not roll anything yet: `ft_on_transfer` records a *pending pull*
(event `pack_requested`) and asks OutLayer for one VRF proof (the machine pays ~0.0012 NEAR from its own balance;
unused deposit is refunded to it). OutLayer's worker signs `alpha = vrf:{request_id}:{buyer}:{machine}-{n}` with its VRF
key. About a minute later the machine's callback checks, on-chain:

1. `env::ed25519_verify(signature, alpha, pubkey)` against the OutLayer public key fixed at launch
   (`get_machine().config.vrf.pubkey_hex`, fetched from `https://testnet-api.outlayer.ai/vrf/pubkey` at deploy time);
2. that `alpha` is for this buyer and this pull's unique seed (a valid proof from another request is rejected);
3. then rolls pack *i* as `SHA-256(SHA-256(signature) ++ [i])`, first 8 bytes mod 10,000. OutLayer's own `value`
   field is ignored.

Any failure refunds the USDT (`pack_refunded`, never a panic). If no answer arrives, anyone can call
`refund_expired(request_id)` after 300 blocks (~5 minutes). Each pull stores its `vrf_alpha` and `vrf_signature`, and
the app's "Verifiable randomness proof" link (`/proof`) re-checks both in the browser.

**Sell-back.** `sell(amount, min_usdt_out)` (attach 1 yoctoNEAR) returns tokens to the curve at
`usdt_out = (V+R) - (V+R)·T/(T+s)` (seller gets the floor), takes the same 0.5% + 0.2% fees out of it, and fails if the
curve would need more USDT than it holds or if the payout is below `min_usdt_out`. `quote_sell(amount)` shows the numbers
first. If the USDT transfer fails, the callback puts the tokens, curve and fees back.

Machines launched before Phase 5 (`gball`, `lfg`, `lfgg`) keep block randomness and have no sell-back: they are keyless
and can never be upgraded, so the app labels them "v1 · block randomness".

## 5. Reproduce locally

### Prerequisites
_TBD — exact versions of Rust, cargo-near, near-cli-rs, Node._

### Build and test
1. Unit tests: `cargo test --workspace` → four `test result: ok` lines: factory 16, machine 23, mock-usdt 5, nft 27.
2. Build all contracts to wasm:
   - macOS / Linux: `./scripts/build-wasm.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts\build-wasm.ps1` (adds `--no-abi`: cargo-near's ABI
     step fails to link natively on Windows; the wasm itself is identical.)

   Output: `target/near/{gaballs_factory,gaballs_machine,gaballs_nft,gaballs_mock_usdt}/*.wasm`, plus
   `target/near/machine_test_hooks/gaballs_machine.wasm` (sandbox tests only, never deployed).
3. Sandbox integration tests (Linux/macOS, or WSL on Windows): `cd tests/sandbox && cargo test -- --nocapture --test-threads=1`
   → `test result: ok. 5 passed`. See [tests/sandbox/README.md](tests/sandbox/README.md).

Windows note: `.cargo/config.toml` sets `AWS_LC_SYS_PREBUILT_NASM_x86_64_pc_windows_msvc` so the test
dependencies build without installing NASM. The variable is target-specific and is ignored on macOS/Linux.

### Frontend

1. `cd app && cp .env.example .env.local && npm install`
2. `npm run dev` → http://localhost:3000 (connect a NEAR **testnet** wallet; get mock USDT on "My stuff").
3. `npm run build` → also runs `scripts/check-no-dev-signer.mjs` →
   `check-no-dev-signer: OK — scanned N build files, no dev signer code`.

Deployed with the Vercel CLI from `app/` (`vercel deploy --prod`). Vercel holds only the six public
`NEXT_PUBLIC_*` contract ids from `.env.example`; `app/.vercelignore` keeps `.env*` from being uploaded. Check the live
build: `curl -s -o /dev/null -w '%{http_code}' -X POST https://gaballs.vercel.app/api/dev-signer` → `404`.

**Performance (Lighthouse 12.8 mobile, measured 2026-11-11).** Home, Launch and My stuff score 86–93 (median) on the
live site. The machine page scores a median of ~71 in Lighthouse's default *simulated* mode and 83–94 with real
(DevTools) 4× CPU throttling; layout shift is 0.001. The simulated gap comes from one ~0.4 s task that only appears
while Lighthouse traces the page: the same page under Lighthouse's phone emulation in plain Chrome has no task over
50 ms. On phones (small touch screens) the machine starts in 2D; "Switch to 3D" loads the 3D engine (~1 MB).

Self-check scripts (`app/scripts/`): `screens.mjs` (390/1440 screenshots + styling checks), `machine-stills.mjs`
(3D stills), `record-pull.mjs` (records a real testnet pull), `fps-check.mjs` (frame rate, desktop and throttled phone).

**Dev test signer (local automation only).** With `DEV_SIGNER=1` in `app/.env.local` and `npm run dev:signer`
(listens on 127.0.0.1 only), the app can sign as a test account using its key from `~/.near-credentials`; the key
stays on the local server and is never sent to the browser, and a striped "DEV SIGNER" banner is always shown.
All three are required: `npm run dev:signer` sets a launcher-only flag, so plain `npm run dev` keeps the signer off
(`/api/dev-signer` returns 404) even when `DEV_SIGNER=1` is in `.env.local`.
Production builds don't contain it: `.dev.ts(x)` files are only routes in that mode, the browser import resolves to an
empty stub, and the post-build check fails the build if any trace remains.

## 6. Verify the trust claims

_TBD — e.g. `near account list-keys <machine>.testnet` shows no full-access key; odds readable via `get_odds`._

**Check a pull's randomness yourself** (any Phase 5 machine, e.g. `gumball.gaballs.testnet`):

1. `near contract call-function as-read-only gumball.gaballs.testnet get_recent_pulls json-args '{}' network-config testnet now`
   → each pull has `vrf_alpha`, `vrf_signature`, `roll`, `request_id`.
2. `curl -s https://testnet-api.outlayer.ai/vrf/pubkey` → the same key as `get_machine().config.vrf.pubkey_hex`.
3. In Node (no packages needed), with `A` = the alpha, `S` = the signature hex, `K` = the key hex:
   `node -e "const c=require('crypto');const k=c.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(K,'hex')]),format:'der',type:'spki'});console.log(c.verify(null,Buffer.from(A),k,Buffer.from(S,'hex')))"`
   → `true`. The roll: `SHA-256(SHA-256(sig bytes) ++ [i])`, first 8 bytes big-endian mod 10,000, where `i` is the
   pull's position within its request.

Or open the pull's "Verifiable randomness proof" link in the app, which runs the same checks in the browser.

## 7. Deployments and transaction links

See [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

## 8. Security notes

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## 9. Built with

- near-sdk 5.30.1 and near-contract-standards 5.30.1 (NEP-141/145/148 implementation) — contracts
- uint 0.10.2 — 256-bit integers for the curve maths
- OutLayer VRF (outlayer.testnet, the OutLayer team's `zavodil2.testnet/vrf-ark` project) — verifiable randomness;
  the request/callback pattern follows [out-layer/vrf-example](https://github.com/out-layer/vrf-example)
- ed25519-dalek 2.2 — tests only: signs stand-in VRF proofs (unit tests, `contracts/mock-outlayer` sandbox tests)
- near-sandbox 0.4.0 + near-api 0.8 — sandbox integration tests (`tests/sandbox`)
- Next.js 16, React 19, Tailwind CSS 4, Motion 14 — frontend (`app/`, scaffolded with `create-next-app`)
- @hot-labs/near-connect 0.11 + near-api-js 7 — wallet connection (per the NEAR `near-dapp` agent skill and the
  `create-near-app` Next.js template)
- three 0.187, @react-three/fiber 9, @react-three/drei 10, @react-three/rapier 2 — the 3D gumball machine, modelled in
  code (`app/src/components/machine/scene3d.tsx`); Playwright — screenshots, recordings and checks
- Fonts: Fredoka, Nunito (Google Fonts via `next/font`)
- `cargo near new` template (cargo-near 0.23.0) — crate manifests and toolchain pin
- Python 3.12, numpy, matplotlib — economics simulation (`sim/`)
- AI-assisted: code in this repository was written with Claude Code (Anthropic)
- _More added per phase._

## 10. Phase 7 checklist (Saturday, before submission — not done yet)

Only after the README steps above have been verified on a fresh clone:

- [ ] Delete the access keys on the NFT contract account and the factory account.
- [ ] Make sure no owner-only method can still change anything afterwards (e.g. `set_machine_code` and
      `set_vrf_config` become one-time-only or the owner role is removed). Report any owner method that remains.
- [ ] Add a judge command that shows every contract account has no access keys, e.g.
      `near account list-keys <account> network-config testnet now` for the factory, NFT, mock USDT and each machine.

## 11. License

MIT — see [LICENSE](LICENSE).
