# Status (handoff for a fresh session)

Written 2026-11-12 (IST), after Phase 6B. Read this first, then CLAUDE.md, then the phase prompt you are given.
Deadline: 2026-11-14T23:59:00Z (Sun Nov 15, 05:29 IST). Repo: private, branch `main`, last pushed commit before this
file: `8c5eb6a`.

## 1. Live ids (testnet)

| What | Id | Code SHA-256 | Access keys (checked 2026-11-12) |
| --- | --- | --- | --- |
| App (Vercel, project `gaballs`) | https://gaballs.vercel.app | — | — |
| Factory | `gaballs.testnet` (owner = itself) | `291af832af06fe62057bc7ed2578daeadc17c2591441464c1afadd81f0c70539` | 1 |
| Flagship machine + token $GABALLS | `gaballs.gaballs.testnet` | `a43447c8f8323d0643fc70e0cb6108b5be63b14083f805e40ea7e6d81a025935` (= factory `machine_code_sha256`) | **0** |
| Machine NFT of the flagship | `machine:gaballs.gaballs.testnet` on `nft.gaballs.testnet` | — | — |
| NFT contract | `nft.gaballs.testnet` | `afb4e0ee…2e75` | 1 |
| Mock USDT (6 decimals, `faucet()`) | `usdt.gaballs.testnet` | `6343ee95…8f47` | 1 |
| Platform fee account | `platform.gaballs.testnet` | (no contract) | 1 |
| Demo squad (Sputnik DAO v2, v3.31) | `gaballs-squad.sputnikv2.testnet` | `880bae9a…52da` (factory default) | 0 |
| Sputnik factory | `sputnikv2.testnet` | — | — |
| Randomness | OutLayer `outlayer.testnet`, project `zavodil2.testnet/vrf-ark`, pubkey `c0c5aeae…cfa8` | — | — |
| Demo buyers / squad members | `buyer1.gaballs.testnet`, `buyer2.gaballs.testnet`, human `swarna2003.testnet` | — | 1 each |

Flagship parameters (read with `get_machine`): pack 10 USDT, V = 3,000 USDT, vault seed 100M, creator allocation 100M,
curve 800M, cap 2,500 bps, fees 50 + 20 bps, VRF timeout 300 blocks. Full transaction log: docs/DEPLOYMENTS.md.

Legacy machines (older code, still playable under "Legacy machines" in the app): `gumball`, `bubbles` (first VRF
version), `gball`, `lfg`, `lfgg` (v1), all `<symbol>.gaballs.testnet`.

## 2. Done per phase

| Phase | What | Proof |
| --- | --- | --- |
| 0 | Economics simulation; human chose V, vault seed, cap | `sim/`, docs/PARAMETERS.md |
| 1 | Machine + token contract (curve, pull, vault, fees, events, NEP-141/145/148) | `cargo test` in contracts/machine |
| 2 | NFT contract (Machine NFT with fee balance + claim, soulbound certificates), threat model | docs/THREAT_MODEL.md, tests |
| 3 | Factory, mock USDT, sandbox tests, first testnet deploy + demo run | tests/sandbox, docs/DEPLOYMENTS.md |
| 4 | Next.js app (home, launch, machine page, reveal, my stuff, faucet, proof page), Vercel deploy | https://gaballs.vercel.app |
| 5 | Sell-back, OutLayer VRF (request → callback, refund after timeout), smart 3D default, pending-pull UX | DEPLOYMENTS "Phase 5" (GUMBALL) |
| 6B | Final machine code (VRF proof from any signer if it carries the pull's seed), GABALLS flagship, Squads on Sputnik DAO (script + app) | DEPLOYMENTS "Current"; 30-pack demo with 0 refunds; squad proposals #0–#3 executed |

Tests at the last checkpoint: machine 49 unit tests, sandbox 6 (incl. a real Sputnik DAO squad test), all green.

## 3. Frozen

- **Contracts.** The 6B change was the last one. Do not rebuild or redeploy any contract.
- Machine code in the factory (`a43447c8…`) and every deployed machine: machines have no access keys, so nobody can
  change them.
- Economics (CLAUDE.md section 2) and the flagship parameters above.

## 4. Phase 7 lock-down list (before submission, human confirms each step)

1. Verify the README judge steps on a fresh clone first; locking is irreversible.
2. Delete the full-access key on `gaballs.testnet` (factory). Because the factory's owner **is** `gaballs.testnet`,
   this alone makes `set_machine_code` and `set_vrf_config` uncallable forever, with no contract change (contracts are
   frozen). `launch()` stays open to everyone. Do any last factory-owner action (none planned) before this.
3. Delete the key on `nft.gaballs.testnet`. The NFT has no owner setters (mint is factory-only, claim is
   owner-of-token-only, `ft_on_transfer` accepts mock USDT only), so nothing is lost.
4. Delete the key on `usdt.gaballs.testnet`. No owner methods; `faucet()` keeps working.
5. Decide on `platform.gaballs.testnet`: it only receives platform fees. Keep its key (it is a plain account, not a
   contract) and say so in the README, or delete it.
6. Before deleting factory/NFT keys, make sure each account keeps enough NEAR for storage (factory launches are paid by
   the creator's deposit).
7. Update README section 10 (it lists only factory + NFT; add mock USDT and the "owner = itself" explanation) and add the
   judge check: `near account list-keys <account> network-config testnet now` for the factory, NFT, mock USDT,
   `gaballs.gaballs.testnet`, and the squad DAO; all should show no keys.
8. Record the delete-key transactions in docs/DEPLOYMENTS.md.

## 5. Known limits (for the README)

- Testnet only. Mock USDT is not real money; Intents top-up exists only on mainnet (not built yet).
- Randomness depends on OutLayer answering within 300 blocks; otherwise the buyer calls `refund_expired` and gets the
  USDT back. If OutLayer rotates its VRF key, pulls refund until a new machine is launched (the pubkey is fixed per
  machine; the factory setter is gone after Phase 7).
- A VRF proof is accepted from any signer as long as it carries the pull's unique seed (needed for squads); reasoning in
  docs/THREAT_MODEL.md.
- Public RPCs rate-limit (FastNEAR 429s); the app fails over to Intear and dRPC, so numbers can lag a few seconds.
- Lighthouse mobile: machine page median ~71 in simulated mode (83–94 with real throttling); other pages 86–93.
- The "ready to open" badge for a settled pull is remembered per browser (localStorage); another device shows the
  result in the pull log instead.
- Squad "open packs" needs 270 Tgas on the vote that executes it; Sputnik's vote gas limit leaves little room.
- Reproducible (Docker) contract build not done; wasm hashes are listed for comparison.
- Legacy machines run older code (v1 has no VRF / sell-back).

## 6. Open items

- [ ] **Squad proposal #4 ("Open 1 pack") is waiting for the human's vote on camera.** It has 1 of 2 approvals
      (buyer1, tx `5vWVBtNJinwdai1sR1ZnVyDsz4G4CqFtxEEfx4C6hf7D`). swarna2003.testnet approves in the app at
      https://gaballs.vercel.app/squads/gaballs-squad.sputnikv2.testnet, which executes it. The squad treasury must
      still hold ≥ 10 mock USDT then (chip in from the page if not). Sputnik proposals expire after the policy's
      proposal period, so record this soon.
- [ ] Art (the human provides: final machine art, icons, OG image).
- [ ] Intents "Top up from any chain" on mainnet (CLAUDE.md section 6; tiny amounts, human watching; cut list item 2:
      keep at least a dry-quote screen).
- [ ] README finish: judge quick path re-check on a fresh clone, Phase 7 results, known limits (section 5 above),
      Built with list up to date.
- [ ] Phase 7 lock-down (section 4).
- [ ] Demo video (includes the squad vote above).
- [ ] X post (human posts; never without a yes).
- [ ] Submission (re-read https://nearhackathon.com/HACKATHON.md first; human submits, repo goes public only on a yes).

## 7. How to work in this repo

- WSL for contracts and sandbox: `export PATH="$HOME/.cargo/bin:$PATH"`; sandbox runner in scripts; cargo-near with
  `--no-abi` on Windows.
- App: `cd app && npm run dev` (or `npm run dev:signer` for the dev signer as buyer1; dev only, never in production
  builds). Deploy: `vercel deploy --prod --yes` from `app/` (human's yes first).
- Keep one dev server and one browser running (limited RAM). Look at 390 px and 1440 px screenshots before calling a
  screen done.
- Never push, post, sign mainnet transactions or delete keys without the human's explicit yes.
