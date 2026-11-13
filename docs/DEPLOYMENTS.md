# Deployments (testnet)

## No wallet needed: welcome kit + Google/email login (Privy), 2026-11-12 UTC

Frontend and server only; no contract changed. Explorer: testnet.nearblocks.io.

| Step | Tx |
| --- | --- |
| `gaballs-welcome.testnet` created by the testnet faucet (10 NEAR) | [3q9jB3p6…](https://testnet.nearblocks.io/txns/3q9jB3p64tUsZHfs1YyeJubtJWUJtKVm7D1bHLpe5JMr) |

**Google/email proof run** (Privy test account, fresh; localhost, one browser tab, no window besides Privy's login).
Player account `97da1618685fc6abd8388fcd09c2927144e6854e01af8c21caa14c944ed52d8b`. Screenshots: docs/proof/google-login/.

| Step | Tx |
| --- | --- |
| Welcome kit: 0.5 NEAR for gas (creates the implicit account) | [4HLceLHf…](https://testnet.nearblocks.io/txns/4HLceLHfiE5C6tYAzzpKWMJonnZPCWdnBYhzW56fyVbN) |
| Welcome kit: storage registration on mock USDT | [7xbkjkMN…](https://testnet.nearblocks.io/txns/7xbkjkMNj94Ri1gC8tMLWUjTX1ZU1RQsmDWCWF5NbKCp) |
| Welcome kit: storage registration on GABALLS | [2HLoaqPk…](https://testnet.nearblocks.io/txns/2HLoaqPktbkbrLLTBQhbRRBKKs4P9zAcp6Fu4TgLt9zG) |
| Faucet: 100 mock USDT (signed silently by Privy) | [4SNjRGYS…](https://testnet.nearblocks.io/txns/4SNjRGYSqAA2r9X85xJZHpexp45n77xeor9brNUsUUzZ) |
| Open 1 pack on GABALLS (signed silently by Privy) | [4hyB6thn…](https://testnet.nearblocks.io/txns/4hyB6thnJPH5azWnyv2FJFkWbiYdhZz9egYqL8VLdDcV) |
| Result: pull #38, Common 0.70x, 1,539,753 GABALLS, VRF request #10, block 277345073 | `get_recent_pulls` on gaballs.gaballs.testnet |

First run (the human's own fresh email, before the kit was raised from 0.1 to 0.5 NEAR): account `43a58c5a…bfee74`,
kit [CoYFSfYs…](https://testnet.nearblocks.io/txns/CoYFSfYstDNno7GjcwTF6n5jTwLR7QXTNRQE47f4WJdq), faucet
[BrkQxnYu…](https://testnet.nearblocks.io/txns/BrkQxnYujNj5hnjQoMcy9sE11ya4MxTgghexMisemHfG). The pack was refused
before sending: a 300 Tgas pack needs ~0.30 NEAR available (gas is held at a pessimistic price, most is refunded).
Manual top-up 0.4 NEAR [BQmJWCrK…](https://testnet.nearblocks.io/txns/BQmJWCrKBdPBzpwRneJYb2haMfRbNph5cvk456m5MjB9),
then pack [GohpAdX9…](https://testnet.nearblocks.io/txns/GohpAdX9yPaLABcGULhysGGRJgY9xMKU7SVTZCaNwP1Q) → pull #37,
Common, VRF request #9.

## MetaMask / Ethereum wallet (near-connect "Ethereum Wallets", evm-on-near.dev), 2026-11-12 UTC

Frontend only (commit 2571e94); no contract changed. Played on https://gaballs.vercel.app in Chrome with a throwaway
MetaMask account. Player account `0xd4513c89ebf7c665d972960730422d6a54f372eb` (an Ethereum-style NEAR account: the
0x address itself). One MetaMask approval per transaction; Gaballs never sees a key.

Two fixes were needed in the app, both found in evm-on-near.dev's own code: (1) its wallet picker (Reown AppKit) asks
MetaMask to switch to chain 398 and gives up with "Connection declined" if MetaMask doesn't know the chain, so the
connect dialog now adds "NEAR Protocol Testnet" first ("Step 1 of 2"); (2) it refuses any action above 270 Tgas
("Amount exceeds protocol limit"), so transactions sent through this wallet are capped at 270 Tgas (squad packs
already use 270 Tgas, see below).

| Step | Signed by | Tx |
| --- | --- | --- |
| NEAR account created for the 0x address (Ethereum Wallets relayer) | `b-eth-wallet.testnet` | [HQp8sWu2…](https://testnet.nearblocks.io/txns/HQp8sWu2JN7DRpsSuAn2ZdiyNPgXokymvtAU5ND1zCax) |
| "Set up your NEAR account": relayer adds a key that can only call `rlp_execute` | `h-eth-wallet.testnet` | [7EYjVafh…](https://testnet.nearblocks.io/txns/7EYjVafhWPD9SAmT9ghc9E9uUyExAuewv3HmBqxWnwmR) |
| Welcome kit: 0.5 NEAR for gas | `gaballs-welcome.testnet` | [GQtCqE1f…](https://testnet.nearblocks.io/txns/GQtCqE1fQuHCbdpxrVPZfJTzJNYa9BD7ksZP9JTPMmPo) |
| Welcome kit: storage registration on mock USDT | `gaballs-welcome.testnet` | [BnasRQyA…](https://testnet.nearblocks.io/txns/BnasRQyAASRSQq4WtXSWV7D7xkmbH9xyatWuZn3bb2f7) |
| Welcome kit: storage registration on GABALLS | `gaballs-welcome.testnet` | [5GWeg2G4…](https://testnet.nearblocks.io/txns/5GWeg2G4xeLkZ8bZR9WUbMEpFin5Amggr3G5NQkUMsUk) |
| Faucet: 100 mock USDT (`ft_mint` event, memo "faucet") | 0x account (MetaMask) | [EygvLFtC…](https://testnet.nearblocks.io/txns/EygvLFtCfjQdSauvuCxvnTpSfQe97ZjtTJSF2Kvtadw4) |
| Open 1 pack: `pack_requested` #11 → OutLayer VRF → `pack_opened` pull #39, **Rare** 1.25x, 2,733,044 GABALLS | 0x account (MetaMask) | [HyooQGpa…](https://testnet.nearblocks.io/txns/HyooQGpaX1iPVaQHRrdb25423QRnaaZXnwmYGQa2RpvS) |
| Sell 2,733,044 GABALLS back to the curve → 12.316366 mock USDT (`tokens_sold`) | 0x account (MetaMask) | [6iShdneT…](https://testnet.nearblocks.io/txns/6iShdneTrtgPnMqbWaDY7G3iA26a2RHasFoEZxbgc3eN) |

Each 0x-signed transaction is an `rlp_execute` call on the player's own account; the Gaballs calls run inside it, so
the events above are in the same transaction.

## Variable pack size: factory update + Gaballs Max ($GBMAX), 2026-11-13 UTC

A pack can now be any amount from 10 to 1,000 USDT (one draw, same odds; docs/PARAMETERS.md "Pack size"). The factory
was redeployed (no re-init: its state did not change) and the new machine code uploaded; machines launched from here on
get the range. Earlier machines, including `gaballs.gaballs.testnet`, keep fixed 10 USDT packs: they have no keys and
cannot be changed. Reproduce: `scripts/build-wasm.ps1` (or `.sh`), `ROOT=gaballs.testnet ./scripts/deploy-testnet.sh`,
`./scripts/launch-gbmax.sh`.

| Account | Contract | Code SHA-256 (hex) | Access keys |
| --- | --- | --- | --- |
| [`gaballs.testnet`](https://testnet.nearblocks.io/address/gaballs.testnet) | Factory (passes `max_pack_price` = 1,000 USDT) | `e90f782bc8e3dc41ea7551bc6f15c513e20584db8f43e4bcde6d319f6452facb` | 1 full-access (locked in Phase 7) |
| machine code stored in the factory | Machine + token (variable pack size) | `f8a79babcb536ce40464f64ea462f2835ab4726f73466a227899277aa214cde5` | — |
| [`gbmax.gaballs.testnet`](https://testnet.nearblocks.io/address/gbmax.gaballs.testnet) | Machine + token GBMAX ("Gaballs Max") | `f8a79babcb536ce40464f64ea462f2835ab4726f73466a227899277aa214cde5` (= factory `machine_code_sha256`) | **0 — no keys** |
| `usdt.gaballs.testnet`, `nft.gaballs.testnet` | unchanged (same hashes as below; redeployed byte-identical by the script) | `6343ee95…`, `afb4e0ee…` | 1 full-access each |

| Step | Transaction |
| --- | --- |
| redeploy factory to gaballs.testnet (no init) | [CXsFj3FY…](https://testnet.nearblocks.io/txns/CXsFj3FYFRHFTCTuh8rsnC757zA6UndWUmtHLtmdvKTp) |
| factory.set_machine_code(gaballs_machine.wasm) | [FBwj5Fcb…](https://testnet.nearblocks.io/txns/FBwj5FcbZRVr3pjiR6tHkGLEDyCEBTv963qqwv8nhToM) |
| factory.set_vrf_config (same OutLayer project and key as before) | [GYyfQnRK…](https://testnet.nearblocks.io/txns/GYyfQnRKPUuGgkDxnBuiw3EZYBNWwBDMbsiKgkGLJiTa) |
| (redeploy mock USDT / NFT, byte-identical) | [GuEFbWEk…](https://testnet.nearblocks.io/txns/GuEFbWEkhB644NEKQZdTEf4QyX7wsDYwccTLBhGAF2Vi), [9mAyZXdK…](https://testnet.nearblocks.io/txns/9mAyZXdKVzE2QCBTpLyhhZp8qGW34aL5wR9eYdXZMPvj) |
| testnet NEAR for the launch: gaballs-welcome.testnet → gaballs.testnet, 6 NEAR | [DNBAXFRq…](https://testnet.nearblocks.io/txns/DNBAXFRqdmzvMzgydHhAtSsAH36hg6Sr1XuYD3mBXTzc) |
| gaballs.testnet launches GBMAX (attached 4.312 NEAR) | [9TEj99e6…](https://testnet.nearblocks.io/txns/9TEj99e6yP7zDwY8cVGkzZ3tst5b1jKydExFMnnnvas1) |
| check: gbmax.gaballs.testnet has 0 access keys; code = factory machine_code_sha256; pack range 10000000 to 1000000000 | — |
| buyer1 opens ONE pack of 100 USDT → OutLayer run failed → **refunded in full** (`pack_refunded`) | [EvEkc9M8…](https://testnet.nearblocks.io/txns/EvEkc9M8JwWuQgJyByUjuQ2wGGFL8fqE1SxkJSAEaqoY) |
| buyer2 opens ONE pack of 37.5 USDT → OutLayer run failed → **refunded in full** | [6qxocprV…](https://testnet.nearblocks.io/txns/6qxocprVcpd5b75VJ8PS1w2rRewU4Ur2CUfw5QXam8YU) |
| retry: 100 USDT and 37.5 USDT → OutLayer failed again → both refunded in full | [2FnjELuu…](https://testnet.nearblocks.io/txns/2FnjELuuXcRTN3KtCEkrTsSB22R3hkaaPy2LHEkrhuno), [64x3ZAGf…](https://testnet.nearblocks.io/txns/64x3ZAGfuPBpZamUbMy1YGUGgxgqZijtYiLjcK4dW38c) |
| health check: one 10 USDT pack on gaballs.gaballs.testnet → pull #62 opened (OutLayer back) | [EbYdyos7…](https://testnet.nearblocks.io/txns/EbYdyos7VPQ9hfQAAfdxNZCJ3iiihHzKx3m4NBt3DLws) |
| buyer1: 10 USDT as `{"action":"open_pack","count":1}` → pull #0 opened | [AqcNQMwz…](https://testnet.nearblocks.io/txns/AqcNQMwz9y7XQUNv4vy5YcfHeZ7yVKQqnMrzskAE5jm3) |
| buyer1: 10 USDT as `{"action":"open_pack"}` → pull #1 opened | [FkUQQDjj…](https://testnet.nearblocks.io/txns/FkUQQDjjie2QQXt7SDA5usYFfQ3eQUZRLGYEMfo2oLB8) |
| buyer1 opens ONE pack of **75 USDT** → pull #2, Common 0.7×, `usdt_in` 75000000, bought 19.13M, payout 13.39M | [Dd6akMzR…](https://testnet.nearblocks.io/txns/Dd6akMzRB7XXavkNuAauAybBFfDwJp9u29BUwqJCtxFe) |
| buyer2 opens ONE pack of **37.5 USDT** → pull #3, Rare 1.25×, `usdt_in` 37500000, bought 9.22M, payout 11.53M | [C9rxJJo3…](https://testnet.nearblocks.io/txns/C9rxJJo3kcTwC6t3KXtNMKN7jYNikZEhnixDvJnv4XtS) |
| after: packs_opened 4, total_usdt_in 132.5 USDT, vault 105.01M, refunds 4 | — |

The four refunds are OutLayer's intermittent failures (its run returned "Execution promise failed"); the contract
did what it promises: no pack, full USDT back in the same transaction.

## Current: flagship GABALLS + Squads, 2026-11-11/12 UTC

**`gaballs.gaballs.testnet` ($GABALLS) is the single flagship** for individuals and squads. It runs the last machine
code: verifiable randomness, sell-back, and a VRF check that accepts a proof signed by any account as long as it carries
this pull's unique seed (needed for Sputnik DAO squads; see docs/THREAT_MODEL.md). Machines launched with earlier code
stay playable under "Legacy machines" in the app: `gumball`, `bubbles` (first VRF version) and `gball`, `lfg`, `lfgg` (v1).

| Account | Contract | Code SHA-256 (hex) | Access keys |
| --- | --- | --- | --- |
| [`gaballs.testnet`](https://testnet.nearblocks.io/address/gaballs.testnet) | Factory (unchanged since the NFT-deposit fix) | `291af832af06fe62057bc7ed2578daeadc17c2591441464c1afadd81f0c70539` | 1 full-access (locked in Phase 7) |
| machine code stored in `gaballs.testnet` | Machine (final) | `a43447c8f8323d0643fc70e0cb6108b5be63b14083f805e40ea7e6d81a025935` | — |
| [`gaballs.gaballs.testnet`](https://testnet.nearblocks.io/address/gaballs.gaballs.testnet) | Machine + token GABALLS (flagship) | `a43447c8f8323d0643fc70e0cb6108b5be63b14083f805e40ea7e6d81a025935` (= factory `machine_code_sha256`) | **0 — no keys** |
| [`nft.gaballs.testnet`](https://testnet.nearblocks.io/address/nft.gaballs.testnet), [`usdt.gaballs.testnet`](https://testnet.nearblocks.io/address/usdt.gaballs.testnet) | NFT, mock USDT (unchanged) | `afb4e0ee…2e75`, `6343ee95…8f47` | 1 full-access each (locked in Phase 7) |
| [`gaballs-squad.sputnikv2.testnet`](https://testnet.nearblocks.io/address/gaballs-squad.sputnikv2.testnet) | Squad: Sputnik DAO v2 (factory `sputnikv2.testnet`, default code v3.31) | `880bae9a58c99ec1efe8b10cf834b3f0c0ebc7a05d71206f3c1202c4280952da` (base58 `AA4nA45v…dgcH`, the factory's default) | 0 |

### New machine code

| Step | Transaction |
| --- | --- |
| factory.set_machine_code(machine with signer-agnostic VRF check) | [AnaVSGA6…](https://testnet.nearblocks.io/txns/AnaVSGA6W1tBg1m9eMxdxV9SutbgUxKtfBGYAkszpRG3) |

### Launch and demo run: GABALLS (30 VRF packs + a sell)

`SYMBOL=GABALLS scripts/demo-run.sh`, then `RESUME=1 SYMBOL=GABALLS scripts/demo-run.sh` after fixing a script bug
(a `(( short += 0 ))` under `set -e` ended the first run silently right after the faucet step).

| Step | Transaction |
| --- | --- |
| gaballs.testnet launches GABALLS (attached 4.2702 NEAR; get_launch_cost = 4260250000000000000000000 yocto) | [F9372pxn…](https://testnet.nearblocks.io/txns/F9372pxnGfyXLdj5ajwhsdQR6RK2M7xLjmdbeDmgkQ52) |
| buyer1.gaballs.testnet uses the faucet (+100 USDT) | [DpDFXXkV…](https://testnet.nearblocks.io/txns/DpDFXXkVipDUPDMYXrYSHvvyvDfXdGSWiAoPAftLwAcL) |
| buyer2.gaballs.testnet uses the faucet (+100 USDT) | [F76Dinjy…](https://testnet.nearblocks.io/txns/F76DinjygQo19ymWjyDXCLPjC2gWxzAhMoqHYGAtUKnH) |
| check: gaballs.gaballs.testnet has 0 access keys | — |
| check: gaballs.gaballs.testnet code sha256 `a43447c8f8323d0643fc70e0cb6108b5be63b14083f805e40ea7e6d81a025935` == factory machine_code_sha256 `a43447c8f8323d0643fc70e0cb6108b5be63b14083f805e40ea7e6d81a025935`: yes | — |
| gaballs.testnet sends 18.400000 USDT to buyer2.gaballs.testnet | [DqUSnce3…](https://testnet.nearblocks.io/txns/DqUSnce3QJ5U8Wu1o8TK9W7jofPK14pYyWJXHYdbwcRx) |
| buyer1.gaballs.testnet registers on the GABALLS token (storage_deposit) | [7aBNBAdT…](https://testnet.nearblocks.io/txns/7aBNBAdTMAPv7kJe6BgjwsposT7s2P97krSzqNDzHC5e) |
| buyer2.gaballs.testnet registers on the GABALLS token (storage_deposit) | [FLcp6i7Q…](https://testnet.nearblocks.io/txns/FLcp6i7QR1HQuJrYyZzHqrhESD75WHTc36XPzmQtUPTh) |
| buyer1.gaballs.testnet opens 5 packs | [4EgeK8Pn…](https://testnet.nearblocks.io/txns/4EgeK8PnG7SLbnEudPGxku6fr1M4dNzhtQFU2q1o66dj) |
| ↳ Common, Common, Rare, Rare, Common — VRF alpha `vrf:25482:buyer1.gaballs.testnet:gaballs.gaballs.testnet-0` (request 0) | — |
| buyer2.gaballs.testnet opens 5 packs | [Hd2KCK8C…](https://testnet.nearblocks.io/txns/Hd2KCK8CSzwoD5JjArMoBVRDJe8uL7bMcN8SCeHVCve6) |
| ↳ Common, Common, Common, Common, Common — VRF alpha `vrf:25502:buyer2.gaballs.testnet:gaballs.gaballs.testnet-1` (request 1) | — |
| buyer1.gaballs.testnet opens 5 packs | [3zJjmZUM…](https://testnet.nearblocks.io/txns/3zJjmZUMMr8EkPb7ip9kBmuJMWfNvnP1Zx48ZuPUouJe) |
| ↳ Common, Common, Common, Common, Common — VRF alpha `vrf:25519:buyer1.gaballs.testnet:gaballs.gaballs.testnet-2` (request 2) | — |
| buyer2.gaballs.testnet opens 5 packs | [AxCRSx43…](https://testnet.nearblocks.io/txns/AxCRSx43aw7wkjXta5ypDaUrkizdzjcVVJuopMcJFPHf) |
| ↳ Common, Rare, Common, Common, Common — VRF alpha `vrf:25538:buyer2.gaballs.testnet:gaballs.gaballs.testnet-3` (request 3) | — |
| buyer1.gaballs.testnet calls sweep_fees | [6hGQiwAX…](https://testnet.nearblocks.io/txns/6hGQiwAXxSDmLDjHXumagqcVjjsgwyJe39W9fFouiWmS) |
| NFT fee balance after sweep: 1.000000 USDT | — |
| gaballs.testnet claims the Machine NFT fees | [D6uCgv7C…](https://testnet.nearblocks.io/txns/D6uCgv7C8d3hiadyYp4YBCnZDVR7Q1drpq88Xtg7xL8i) |
| gaballs.testnet transfers the Machine NFT to buyer2.gaballs.testnet | [C5Wxta5V…](https://testnet.nearblocks.io/txns/C5Wxta5V5rL9NYAJhizEakZboPTEjPQUEYT4dyPd2Xv2) |
| buyer1.gaballs.testnet opens 5 packs | [3LkqKoZ1…](https://testnet.nearblocks.io/txns/3LkqKoZ1nK9K4ngXUM9ArWN1N6WXJosqd82r9PtjWX9b) |
| ↳ Common, Common, Common, Common, Epic — VRF alpha `vrf:25556:buyer1.gaballs.testnet:gaballs.gaballs.testnet-4` (request 4) | — |
| buyer2.gaballs.testnet opens 5 packs | [61fb8fEu…](https://testnet.nearblocks.io/txns/61fb8fEu6WkHxmb6sZMyNG6Don6E6auMGXR93byyk817) |
| ↳ Common, Common, Common, Common, Common — VRF alpha `vrf:25570:buyer2.gaballs.testnet:gaballs.gaballs.testnet-5` (request 5) | — |
| buyer2.gaballs.testnet calls sweep_fees | [GwR6yZkC…](https://testnet.nearblocks.io/txns/GwR6yZkC248snHHbN5RPtzRrjAJ3cZNu59NixADwHpXE) |
| NFT fee balance after second sweep: 0.500000 USDT | — |
| gaballs.testnet (old owner) tries to claim — rejected as expected (Only the current owner can claim) | [5XDZCnPg…](https://testnet.nearblocks.io/txns/5XDZCnPg51umch6kijuMu4BCu8YZzsg8QVtoxE4HwGwv) |
| buyer2.gaballs.testnet (new owner) claims | [DvEVgWP6…](https://testnet.nearblocks.io/txns/DvEVgWP6cn83jxeSH4azaqihS7Z5YBAzQVQLkMzeggco) |
| buyer1.gaballs.testnet sells half its GABALLS (quote: 71.799190 USDT; min_usdt_out = quote) | [Do4hPb7o…](https://testnet.nearblocks.io/txns/Do4hPb7oYPV3vaVUjbYYMvRzer2oSVdK15SWMLg2ugHq) |
| ↳ sold 16313015 tokens: 72.305326 USDT out of the curve, fees 0.506136, buyer1.gaballs.testnet received 71.799190 USDT | — |

Result:

- machine: `gaballs.gaballs.testnet` (Machine NFT `machine:gaballs.gaballs.testnet`, owner now `buyer2.gaballs.testnet`)
- randomness: OutLayer VRF (outlayer.testnet, project zavodil2.testnet/vrf-ark); pending pulls: 0; refunds: 0
- sells: 1; tokens sold back: 16313015; USDT paid to sellers: 71.799190
- packs opened: 30; tiers (Common, Rare, Epic, Mythic): 26, 3, 1, 0; capped pulls: 0
- best multiplier hit: 2.4999x
- price: 0.0000043352 USDT/token; market cap: 4335.192082 USDT; vault: 113435797 tokens
- fee history of machine:gaballs.gaballs.testnet: Credit 1.00 → Claim 1.00 → Credit 0.50 → Claim 0.50
- platform fees received by platform.gaballs.testnet: 2.360000 USDT
- gaballs.gaballs.testnet access keys: 0; gaballs.testnet NEAR left: 14.417210731736621799999989 NEAR

## Squads

Group gacha on **Sputnik DAO** (`sputnikv2.testnet`), no custom multisig: `scripts/squad-demo.sh`. The council is
`swarna2003.testnet` (the human, who votes from the app), `buyer1` and `buyer2`; the script votes with buyer1 + buyer2,
2 of 3. The "open packs" action uses 270 Tgas (the sandbox test found 230 Tgas to be the minimum that funds USDT →
machine → VRF request + callback inside the 300 Tgas vote).

| Step | Transaction |
| --- | --- |
| gaballs.testnet creates gaballs-squad.sputnikv2.testnet on sputnikv2.testnet (6 NEAR; council swarna2003.testnet, buyer1.gaballs.testnet, buyer2.gaballs.testnet; 2 of 3; bond 0.1 NEAR) | [A5F78LhA…](https://testnet.nearblocks.io/txns/A5F78LhAyrPhAeWXhgVSfoenHJBDKNoKztxQnoeCEMf8) |
| check: threshold 2, council buyer2.gaballs.testnet, buyer1.gaballs.testnet, swarna2003.testnet, bond 100000000000000000000000 yocto; DAO code hash `880bae9a58c99ec1efe8b10cf834b3f0c0ebc7a05d71206f3c1202c4280952da` | — |
| gaballs.testnet pays the DAO's storage on mock USDT | [CY5sM5vy…](https://testnet.nearblocks.io/txns/CY5sM5vy4SaTQpV62QjN9vCE2y1VjxZ8qvJAcgMH6Pdz) |
| gaballs.testnet pays the DAO's storage on the gaballs.gaballs.testnet token | [2dgU55dC…](https://testnet.nearblocks.io/txns/2dgU55dCFjLwxzpfPrQ2fph1imTuBY6WAYZkfK5TZTXG) |
| buyer1.gaballs.testnet chips in 49.500000 USDT | [cc2imGtc…](https://testnet.nearblocks.io/txns/cc2imGtcwSYPAUWp5ViaA2H3KVBSFWsyvxxPnB1noZH) |
| buyer2.gaballs.testnet chips in 0.500000 USDT | [HNk2bcCe…](https://testnet.nearblocks.io/txns/HNk2bcCeNN7MpKHYERvB2tz6oY55A4fLjD7RnNz5hkHL) |
| treasury: 50.000000 USDT | — |
| buyer1.gaballs.testnet proposes: open 5 packs (ft_transfer_call, 270 Tgas) | [3rwRrc2g…](https://testnet.nearblocks.io/txns/3rwRrc2gym4QvGVxR1Bomkedo4rFdxGQ1eaKcHLiZLBe) |
| ↳ proposal #0: Open 5 packs on gaballs.gaballs.testnet | — |
| buyer1.gaballs.testnet approves proposal #0 | [FnvttJ31…](https://testnet.nearblocks.io/txns/FnvttJ31E5dckiCigb5ME5YghhRQBtnWzjLw531TehuW) |
| buyer2.gaballs.testnet approves proposal #0 | [79uiAjGR…](https://testnet.nearblocks.io/txns/79uiAjGRp9S5rZKADjxuSWWNEmXoLBQkBx2B1P8ujHm5) |
| ↳ proposal #0 status: Approved | — |
| ↳ Common 0.7x, Common 0.7x, Rare 1.25x, Common 0.7x, Rare 1.25x — VRF alpha `vrf:25598:buyer2.gaballs.testnet:gaballs.gaballs.testnet-6` (signed by the deciding voter, paid to the DAO) | — |
| ↳ prize in the treasury: 10,361,670 GABALLS | — |
| buyer2.gaballs.testnet proposes: split 2,072,334 GABALLS to each member | [Bi3fbJkY…](https://testnet.nearblocks.io/txns/Bi3fbJkY5zSAJXGL72uEixw5LZgq23iwVf9JTjJC3cNb) |
| ↳ proposal #1: Split the prize: 20% each | — |
| buyer1.gaballs.testnet approves proposal #1 | [2PTnsY7R…](https://testnet.nearblocks.io/txns/2PTnsY7Rq2YLiuMEt66Hp7gN4AFinugL6y4jSS1Q4vr6) |
| buyer2.gaballs.testnet approves proposal #1 | [66iYxDdV…](https://testnet.nearblocks.io/txns/66iYxDdVN5GLD2hsZATshZQdDk1qTg1rnMkuV18FK85G) |
| ↳ proposal #1 status: Approved; balances: swarna2003.testnet 2,072,334, buyer1.gaballs.testnet 18,385,349, buyer2.gaballs.testnet 28,274,673 | — |
| buyer1.gaballs.testnet proposes: sell the remaining 4,144,668 GABALLS (quote 18.292192 USDT, min 99%) | [2B5ucVd2…](https://testnet.nearblocks.io/txns/2B5ucVd2MVDNwiz1ZszNVZf4HPbfQN5cVjv5otvfHdKR) |
| ↳ proposal #2: Sell the rest back to the curve | — |
| buyer1.gaballs.testnet approves proposal #2 | [5iuR7dLt…](https://testnet.nearblocks.io/txns/5iuR7dLt8PqPQH55zCdMHCRnQQdL5ZFfPUfFxnnCpmuY) |
| buyer2.gaballs.testnet approves proposal #2 | [9F2Dh8M5…](https://testnet.nearblocks.io/txns/9F2Dh8M5Pp3XpEWLMZ3idXvqAxo4eBRfCMsimAeUdpET) |
| ↳ proposal #2 status: Approved; USDT back in the treasury: 18.292192 | — |
| buyer2.gaballs.testnet gives the Machine NFT machine:gaballs.gaballs.testnet to the DAO | [3ppyf6q4…](https://testnet.nearblocks.io/txns/3ppyf6q4m4QaT3ekB5VZW87fVd8G6Cemmd4mXSyYwGaj) |
| buyer1.gaballs.testnet opens 1 pack (fees for the squad's machine) | [9k7dCBKj…](https://testnet.nearblocks.io/txns/9k7dCBKjF9TK3Jx6poHMB74cXxyy571bH7myJVDdG91E) |
| buyer2.gaballs.testnet calls sweep_fees (accrued fees → the Machine NFT) | [mFJ2VdBv…](https://testnet.nearblocks.io/txns/mFJ2VdBvTb573XeFEAvQ54tWqsuPu2GC5hvdf78PWEU) |
| ↳ fee balance on machine:gaballs.gaballs.testnet (owned by the DAO): 0.753631 USDT | — |
| buyer2.gaballs.testnet proposes: claim the machine's fees | [5ir1EMXP…](https://testnet.nearblocks.io/txns/5ir1EMXPpDt7srLziHmzMNDzoZ4Mm6BYFhi4V9UWdYSj) |
| ↳ proposal #3: Claim machine fees | — |
| buyer1.gaballs.testnet approves proposal #3 | [EZLPnbTU…](https://testnet.nearblocks.io/txns/EZLPnbTU4Ls6oEXHBhD8Fer9Bqe5HTQnYk2gA91d2gXv) |
| buyer2.gaballs.testnet approves proposal #3 | [BN7DPkci…](https://testnet.nearblocks.io/txns/BN7DPkci2FjwGCAXubxdfdvAh72MULLMwmZEHvhtrHwa) |
| ↳ proposal #3 status: Approved; fees claimed into the treasury: 0.753631 USDT | — |

Result:

- DAO: `gaballs-squad.sputnikv2.testnet` (Sputnik DAO v2 via `sputnikv2.testnet`), council swarna2003.testnet, buyer1.gaballs.testnet, buyer2.gaballs.testnet; 2 of 3
- treasury: 19.045823 USDT, 0 GABALLS; owns `machine:gaballs.gaballs.testnet` (fee balance 0.000000 USDT)
- proposals: open packs #0, split #1, sell #2, claim fees #3 — all Approved 
- certificates owned by the DAO: none

Through the app (dev signer as buyer1): proposal #4 "Open 1 pack" made and approved in the Squads page
([5vWVBtNJ…](https://testnet.nearblocks.io/txns/5vWVBtNJinwdai1sR1ZnVyDsz4G4CqFtxEEfx4C6hf7D) is buyer1's vote); it waits at 1 of 2 approvals for the next member.

---

## Phase 5 deployment: GUMBALL (now legacy: first VRF version)

The live app (https://gaballs.vercel.app) lists **`gumball.gaballs.testnet`** first. Machines launched before Phase 5
(`gball`, `lfg`, `lfgg`) are keyless, so they cannot be upgraded: they keep block randomness, have no sell-back, and the
app labels them "v1 · block randomness". Their records are further down.

| Account | Contract | Code SHA-256 (hex) | Access keys |
| --- | --- | --- | --- |
| [`gaballs.testnet`](https://testnet.nearblocks.io/address/gaballs.testnet) | Factory (VRF config, NFT mint deposit 0.1 NEAR) | `291af832af06fe62057bc7ed2578daeadc17c2591441464c1afadd81f0c70539` | 1 full-access (locked in Phase 7) |
| [`nft.gaballs.testnet`](https://testnet.nearblocks.io/address/nft.gaballs.testnet) | NFT (unchanged) | `afb4e0ee6c264e567b061c86cffae9df35d89a23fe3e1e29bf57469937832e75` | 1 full-access (locked in Phase 7) |
| [`usdt.gaballs.testnet`](https://testnet.nearblocks.io/address/usdt.gaballs.testnet) | Mock USDT (unchanged) | `6343ee95c28931a9247ee8ecb4e77d89b6398689a7a21e2deb7068372a3a8f47` | 1 full-access (locked in Phase 7) |
| [`gumball.gaballs.testnet`](https://testnet.nearblocks.io/address/gumball.gaballs.testnet) | Machine + token GUMBALL (VRF, sell-back) | `d4b45866fa19e7adc3b6f48ad28ce907198103d8f607f45efdd2a07cfa24b657` (= factory `machine_code_sha256`) | **0 — no keys** |

Randomness: OutLayer `outlayer.testnet`, project `zavodil2.testnet/vrf-ark`, VRF public key
`c0c5aeae1688c2f7cc2350aae1ee3ce96eddc0de84d678db873de48268f8cfa8` (from `https://testnet-api.outlayer.ai/vrf/pubkey`;
stored in the machine at launch, see `get_machine().config.vrf`).

### Before deploying: OutLayer VRF checked on testnet

| Step | Transaction |
| --- | --- |
| Direct `outlayer.testnet.request_execution` with `count: 2` — failed in the VRF module ("user_seed must not contain ':'"; it appends `:i` for counts above 1), charged 0.00105 NEAR | [7o6Bq2y7…](https://testnet.nearblocks.io/txns/7o6Bq2y7WkYHJZEFP1XD83REHgLTNYGXBL9wUHSUjnfL) |
| Direct request with `count: 1` — alpha `vrf:23766:buyer1.gaballs.testnet:gaballs-probe-2`, signature verified off-chain against the testnet key; 0.0011 NEAR charged, rest refunded | [D4tce1r7…](https://testnet.nearblocks.io/txns/D4tce1r7TRYiPjvTcAfuTaB8RtMb5FaLeWqsYEie6wAb) |
| Staging copy of the new machine (`vrfstage.gaballs.testnet`, deployed directly, never in the factory): 1 pack, roll 7574 → Rare; 19.6 Tgas for the whole chain; OutLayer refunded 0.0088 NEAR to the machine | [26b7Ufpz…](https://testnet.nearblocks.io/txns/26b7Ufpz8xcK92poLMteBTfgtwCsdnAbdXnVnnVUwmkJ) |
| Staging: 5 packs on one proof (4 Common, 1 Rare) | [Fh88is9R…](https://testnet.nearblocks.io/txns/Fh88is9RbaYgD58UGte2eBvYbEc2C1xZodzPTe5iHWbF) |
| Staging: sell 7.74M tokens, received exactly the quoted 26.418110 USDT | [2ojVefXp…](https://testnet.nearblocks.io/txns/2ojVefXpduugdF8JQs4dt7KtVFxdt7CTGZqmCMQ8W1DV) |
| Staging account deleted (NEAR back to `gaballs.testnet`) | [4ev2QV8H…](https://testnet.nearblocks.io/txns/4ev2QV8HJTgpN7PVPURrXqmVHLYU3Za1MFU3awhxt5AJ) |

### Deploy (`scripts/deploy-testnet.sh`)

| Step | Transaction |
| --- | --- |
| redeploy mock USDT to usdt.gaballs.testnet (no init) | [8RyDHFeP…](https://testnet.nearblocks.io/txns/8RyDHFePSiX6SfTGn4umKycBVNZ4bfY67UWBgZFDYcuS) |
| redeploy NFT to nft.gaballs.testnet (no init) | [CJznWgBe…](https://testnet.nearblocks.io/txns/CJznWgBeAcDGYUpPSsJCTW1okVLiuU3qLZeDUw7GrS3L) |
| redeploy factory to gaballs.testnet (no init) | [CYFMSSu9…](https://testnet.nearblocks.io/txns/CYFMSSu98nWZhGDnBW7xZM9uABskkAE2VELT3EtEVEx3) |
| factory.set_machine_code(gaballs_machine.wasm) | [4CzRsavx…](https://testnet.nearblocks.io/txns/4CzRsavxLBwJb6wLbYx8aCSE6it7oUxfXRdQo33iFgBc) |
| factory.set_vrf_config(outlayer.testnet, zavodil2.testnet/vrf-ark, key from https://testnet-api.outlayer.ai/vrf/pubkey) | [EGBTzgxH…](https://testnet.nearblocks.io/txns/EGBTzgxHzA3reakW2MDqyrW5cbAnAfTYm3A4CFf3jKnQ) |
| VRF public key: `c0c5aeae1688c2f7cc2350aae1ee3ce96eddc0de84d678db873de48268f8cfa8` (factory get_vrf_config: `c0c5aeae1688c2f7cc2350aae1ee3ce96eddc0de84d678db873de48268f8cfa8`) | — |
| Account | Deployed | Local build | Match |
| usdt.gaballs.testnet | `6343ee95c28931a9247ee8ecb4e77d89b6398689a7a21e2deb7068372a3a8f47` | `6343ee95c28931a9247ee8ecb4e77d89b6398689a7a21e2deb7068372a3a8f47` | yes |
| nft.gaballs.testnet | `afb4e0ee6c264e567b061c86cffae9df35d89a23fe3e1e29bf57469937832e75` | `afb4e0ee6c264e567b061c86cffae9df35d89a23fe3e1e29bf57469937832e75` | yes |
| gaballs.testnet | `d291724daa40932613f40f887a6a24a5160f2aa822514199936e0179ba630011` | `d291724daa40932613f40f887a6a24a5160f2aa822514199936e0179ba630011` | yes |
| machine code stored in gaballs.testnet | `d4b45866fa19e7adc3b6f48ad28ce907198103d8f607f45efdd2a07cfa24b657` | `d4b45866fa19e7adc3b6f48ad28ce907198103d8f607f45efdd2a07cfa24b657` | yes |

### Fix found during the launch: Machine NFT mint deposit

GUMBALL's Machine NFT mint needed 0.051 NEAR of storage; the factory attached 0.05 (the cost grows with the machine
account's length). The factory now attaches 0.1 NEAR (the NFT contract refunds the unused part), with a sandbox test
that launches a 12-character symbol. The machine itself was unaffected; the factory minted its NFT with
`retry_machine_setup`.

| Step | Transaction |
| --- | --- |
| redeploy factory (NFT_MINT_DEPOSIT 0.05 → 0.1 NEAR) to gaballs.testnet (no init) | [6idcaNp1…](https://testnet.nearblocks.io/txns/6idcaNp1yLBWqEXvwbuCA5bJhQbb5sgXTfuyt3ZZzxvZ) |
| factory.retry_machine_setup(gumball.gaballs.testnet) — mint the Machine NFT (attached 0.100 NEAR) | [6QjNhUTm…](https://testnet.nearblocks.io/txns/6QjNhUTmb6GC9GNJYhGPWwLrnk4wz5JsGbdcLK9DLjUE) |

### Demo run: GUMBALL (30 VRF packs + a sell)

`SYMBOL=GUMBALL scripts/demo-run.sh`, then `RESUME=1 SYMBOL=GUMBALL scripts/demo-run.sh` after the fix above. Every
"opens 5 packs" step returned only after OutLayer's proof was verified on-chain; the script checks each pull carries a
VRF alpha and signature.

| Step | Transaction |
| --- | --- |
| `gaballs.testnet` launches GUMBALL (4.2215 NEAR attached; `get_launch_cost` = 4.2116 NEAR) — machine created; its Machine NFT mint failed (0.05 NEAR too little, fixed below) | [CjgzAFd6…](https://testnet.nearblocks.io/txns/CjgzAFd6dpqvGuvKu6aFGehXAaJZAqo2ZfU5JS2YfJkk) |
| resuming with the already-launched gumball.gaballs.testnet (launch skipped) | — |
| check: gumball.gaballs.testnet has 0 access keys | — |
| check: gumball.gaballs.testnet code sha256 `d4b45866fa19e7adc3b6f48ad28ce907198103d8f607f45efdd2a07cfa24b657` == factory machine_code_sha256 `d4b45866fa19e7adc3b6f48ad28ce907198103d8f607f45efdd2a07cfa24b657`: yes | — |
| buyer2.gaballs.testnet uses the faucet (+100 USDT) | [6kSaMKeZ…](https://testnet.nearblocks.io/txns/6kSaMKeZecFv7ZyH1gkxvxEiQMphpJKFUiDGJEyPu5w5) |
| gaballs.testnet uses the faucet (+100 USDT) | [FYKHwMSw…](https://testnet.nearblocks.io/txns/FYKHwMSwY5hV3MhaAj64cgPyQYxFvfFxF3ZU3HUnCWZk) |
| gaballs.testnet sends 73.581890 USDT to buyer1.gaballs.testnet | [DRxfkKjD…](https://testnet.nearblocks.io/txns/DRxfkKjDpEDTLoDsRtyFJUJF1TkVYQbpNVmiAn3CJjmd) |
| buyer1.gaballs.testnet registers on the GUMBALL token (storage_deposit) | [94PWCPxr…](https://testnet.nearblocks.io/txns/94PWCPxrCHqtSKwwWhiYTgnp88k333N7MZytQsmwySmR) |
| buyer2.gaballs.testnet registers on the GUMBALL token (storage_deposit) | [7d1R8Mrg…](https://testnet.nearblocks.io/txns/7d1R8MrgR2nJ7ha1Moya8c6HzfXQprW4iJwS3jTbahiB) |
| buyer1.gaballs.testnet opens 5 packs | [7CKfLCMk…](https://testnet.nearblocks.io/txns/7CKfLCMkbUjDXEAVVwW6RPdQM2XX6JvohZKMEWqFR237) |
| ↳ Common, Common, Common, Common, Rare — VRF alpha `vrf:23935:buyer1.gaballs.testnet:gumball.gaballs.testnet-0` (request 0) | — |
| buyer2.gaballs.testnet opens 5 packs | [5ME5fNEV…](https://testnet.nearblocks.io/txns/5ME5fNEVghwSZVkUZ4aCT9vHiMvLk7EGetgYwGKqHtay) |
| ↳ Common, Common, Common, Epic, Rare — VRF alpha `vrf:23937:buyer2.gaballs.testnet:gumball.gaballs.testnet-1` (request 1) | — |
| buyer1.gaballs.testnet opens 5 packs | [4JrVVEBe…](https://testnet.nearblocks.io/txns/4JrVVEBeWwvxd4FsAam7sdKgNhZmW9cp9V1qTwfabVna) |
| ↳ Common, Common, Common, Common, Common — VRF alpha `vrf:23939:buyer1.gaballs.testnet:gumball.gaballs.testnet-2` (request 2) | — |
| buyer2.gaballs.testnet opens 5 packs | [CEAH4dXE…](https://testnet.nearblocks.io/txns/CEAH4dXEkFM6YRuCkPofGf67goQXwB5Q28di1Lsf4BUR) |
| ↳ Rare, Common, Common, Common, Rare — VRF alpha `vrf:23941:buyer2.gaballs.testnet:gumball.gaballs.testnet-3` (request 3) | — |
| buyer1.gaballs.testnet calls sweep_fees | [6YtVWfFB…](https://testnet.nearblocks.io/txns/6YtVWfFBGQJ9AQQWyk2WiMn7Mj7ot7jtzAGRfvVLS3y5) |
| NFT fee balance after sweep: 1.000000 USDT | — |
| gaballs.testnet claims the Machine NFT fees | [689tSNoH…](https://testnet.nearblocks.io/txns/689tSNoHPYhL14DRq2oTDJWy4eok6EfG7zu4Y9kHH2kZ) |
| gaballs.testnet transfers the Machine NFT to buyer2.gaballs.testnet | [oX3mAbwT…](https://testnet.nearblocks.io/txns/oX3mAbwTbk4NVuEL322AjfJkHvBBhkYyq8KGKz5SbGN) |
| buyer1.gaballs.testnet opens 5 packs | [GSZouK1u…](https://testnet.nearblocks.io/txns/GSZouK1usVHRB7my8tgCMZPmG7Nzux6VQqYLhrNnwwrs) |
| ↳ Common, Common, Common, Common, Common — VRF alpha `vrf:23943:buyer1.gaballs.testnet:gumball.gaballs.testnet-4` (request 4) | — |
| buyer2.gaballs.testnet opens 5 packs | [ATPTRknc…](https://testnet.nearblocks.io/txns/ATPTRknciHgYuVLDGvLzbXJpbgZQjEgtehCvayiUkpmV) |
| ↳ Rare, Common, Epic, Common, Mythic — VRF alpha `vrf:23944:buyer2.gaballs.testnet:gumball.gaballs.testnet-5` (request 5) | — |
| buyer2.gaballs.testnet calls sweep_fees | [5oUSSagV…](https://testnet.nearblocks.io/txns/5oUSSagVybjakMtz25NDfxY6zZhh1Yv1gu5peddZ3kQp) |
| NFT fee balance after second sweep: 0.500000 USDT | — |
| gaballs.testnet (old owner) tries to claim — rejected as expected (Only the current owner can claim) | [121MqTPP…](https://testnet.nearblocks.io/txns/121MqTPPDqs2bDSYqKczPXxC98FPR2x9wC1iQ7iCkx4v) |
| buyer2.gaballs.testnet (new owner) claims | [86dxkydg…](https://testnet.nearblocks.io/txns/86dxkydgoPCjyXEKGJG8k8M1fDqMN7nzJyUmz5s8ZJrK) |
| buyer1.gaballs.testnet sells half its GUMBALL (quote: 59.873534 USDT; min_usdt_out = quote) | [QW3RfMiq…](https://testnet.nearblocks.io/txns/QW3RfMiq2wpkn5KGTeX3ymexFXp9N7kvT3Reb4CMpBa) |
| ↳ sold 13553005 tokens: 60.295603 USDT out of the curve, fees 0.422069, buyer1.gaballs.testnet received 59.873534 USDT | — |

Result:

- machine: `gumball.gaballs.testnet` (Machine NFT `machine:gumball.gaballs.testnet`, owner now `buyer2.gaballs.testnet`)
- randomness: OutLayer VRF (outlayer.testnet, project zavodil2.testnet/vrf-ark); pending pulls: 0; refunds: 0
- sells: 1; tokens sold back: 13553005; USDT paid to sellers: 59.873534
- packs opened: 30; tiers (Common, Rare, Epic, Mythic): 22, 5, 2, 1; capped pulls: 0
- best multiplier hit: 8x
- price: 0.0000043675 USDT/token; market cap: 4367.534262 USDT; vault: 90497373 tokens
- fee history of machine:gumball.gaballs.testnet: Credit 1.00 → Claim 1.00 → Credit 0.50 → Claim 0.50
- platform fees received by platform.gaballs.testnet: 1.760000 USDT
- gumball.gaballs.testnet access keys: 0; gaballs.testnet NEAR left: 8.580830972424107399999992 NEAR

The Mythic was pull #29 (roll 9924, 8x uncapped, certificate `cert:gumball.gaballs.testnet:29` minted to buyer2).

### Through the app (dev signer as buyer1, Playwright)

| Step | Transaction |
| --- | --- |
| Pull through the 3D machine (crank drag → wobble while waiting for the proof → capsule) — Common | [AFhEeRXq…](https://testnet.nearblocks.io/txns/AFhEeRXqjbHVYxgdN2Ves5EY3kdy8UvzwAaXpCe3Cxwg) |
| Second pull — Common | [HkvUTsNA…](https://testnet.nearblocks.io/txns/HkvUTsNAxyZFYmWgh6yDdC3pa11ZAoM5hWfdnV9o6Vm6) |
| Sell panel: 25% (3.39M GUMBALL) for the quoted $14.63 | [GSzvELsa…](https://testnet.nearblocks.io/txns/GSzvELsa9Kci7GFkumb3QNxA8Pz6REKoVr1w33hiBmdY) |
| Sell panel: 25% (3.34M GUMBALL) for the quoted $14.46 | [UfpHuGtM…](https://testnet.nearblocks.io/txns/UfpHuGtMHmfWZQjeQiisrXLS2wT84JLWjTsR8SQ1S67) |

---

## Phase 3 deployment (v1 machines: block randomness)

### Contract accounts (as deployed in Phase 3)

| Account | Contract | Code SHA-256 (hex) | Access keys |
| --- | --- | --- | --- |
| [`gaballs.testnet`](https://testnet.nearblocks.io/address/gaballs.testnet) | Factory | `7680403539029ab746e620cc6d33102cc7be4a080437ce5c19d0ffa2498587f4` | 1 full-access (locked in Phase 7) |
| [`nft.gaballs.testnet`](https://testnet.nearblocks.io/address/nft.gaballs.testnet) | NFT (Machine NFTs + Mythic certificates) | `afb4e0ee6c264e567b061c86cffae9df35d89a23fe3e1e29bf57469937832e75` | 1 full-access (locked in Phase 7) |
| [`usdt.gaballs.testnet`](https://testnet.nearblocks.io/address/usdt.gaballs.testnet) | Mock USDT (testnet) | `6343ee95c28931a9247ee8ecb4e77d89b6398689a7a21e2deb7068372a3a8f47` | 1 full-access (locked in Phase 7) |
| [`gball.gaballs.testnet`](https://testnet.nearblocks.io/address/gball.gaballs.testnet) | Machine + token GBALL (launched by the factory) | `5ddeac423eaf7e01c9544eb875d8dccb269482b5e5bb51781a27f8263858d286` | **0 — none** |
| [`platform.gaballs.testnet`](https://testnet.nearblocks.io/address/platform.gaballs.testnet) | — (receives platform fees) | — | 1 full-access |

Test users (not contracts): `buyer1.gaballs.testnet`, `buyer2.gaballs.testnet` (1 full-access key each).

All deployed wasm is the normal build: the machine code contains no `test_force_next_tier` (the deploy script
refuses to upload a build that does).

### Verify it yourself

| Claim | Command | Expected |
| --- | --- | --- |
| The machine has no access keys (nobody can change its code or parameters) | `near account list-keys gball.gaballs.testnet network-config testnet now` | an empty table |
| The launched machine runs exactly the code stored in the factory | `near account view-account-summary gball.gaballs.testnet network-config testnet now` → "Local Contract (SHA-256 checksum hex)" | `5ddeac42…d286` |
| | `near contract call-function as-read-only gaballs.testnet get_config json-args '{}' network-config testnet now` → `machine_code_sha256` | `5ddeac42…d286` (same) |
| That code is this repo's machine | `./scripts/build-wasm.sh && sha256sum target/near/gaballs_machine/gaballs_machine.wasm` | `5ddeac42…d286` ¹ |
| Odds and multipliers are fixed and public | `near contract call-function as-read-only gball.gaballs.testnet get_odds json-args '{}' network-config testnet now` | 7500/2000/400/100 bps; 0.7x/1.25x/2.5x/8x; expected 9550 |

¹ `non-reproducible-wasm` builds on the same toolchain (Rust 1.95.0, cargo-near 0.23.0) produced these hashes here; a
reproducible Docker build for byte-exact verification on any machine is planned before submission.

### Deployment transactions

| Step | Transaction |
| --- | --- |
| create `usdt.gaballs.testnet` (2.5 NEAR) | [3n3w8nWF…](https://testnet.nearblocks.io/txns/3n3w8nWFwnR26x2sWn2jPJ38nRnFofLpVDQUEoP6hfu9) |
| create `nft.gaballs.testnet` (4 NEAR) | [3eMPJYMz…](https://testnet.nearblocks.io/txns/3eMPJYMzXug7CXpKfu9J7LhYPtX7tHHCdZ6mp1WvoCA2) |
| create `platform.gaballs.testnet` (0.1 NEAR) | [bDGUng2b…](https://testnet.nearblocks.io/txns/bDGUng2bvb8fUQEC2fUSvRUcifCiPjarCN5qaLXgPoK) |
| deploy mock USDT + `new()` | [EJURyfFn…](https://testnet.nearblocks.io/txns/EJURyfFnbyQ7E7s5Cyg5QPqeFbSRdtSXgac5ihAGpzjQ) |
| deploy NFT + `new(factory, usdt_contract)` | [D8sGVfkf…](https://testnet.nearblocks.io/txns/D8sGVfkfJ9PLcUD45b9Ujxd8eArNWn9L1gAtuzCpzmTu) |
| deploy factory to `gaballs.testnet` + `new(...)` | [4PrT6o2P…](https://testnet.nearblocks.io/txns/4PrT6o2P1RsPnRbDWeofGoLTmNTj1DLb7Z132DyzwYJ2) |
| `set_machine_code` (upload machine wasm to the factory) | [mEfKatzd…](https://testnet.nearblocks.io/txns/mEfKatzdcj53qfEqsHGLjxJmy7ukELbK8A2MRZsrEfW) |
| register `nft.gaballs.testnet` on mock USDT | [BSsGP2Sz…](https://testnet.nearblocks.io/txns/BSsGP2Sz8JmqPiHN45CcA3Ddpkdr9PR2DRjM2rCJ8pJq) |
| register `platform.gaballs.testnet` on mock USDT | [GJjnx8Bz…](https://testnet.nearblocks.io/txns/GJjnx8Bznm7kUG92MjnRXezXbLmjp4PDF5PtSoeXEznA) |
| register `gaballs.testnet` on mock USDT | [ERSUHR3G…](https://testnet.nearblocks.io/txns/ERSUHR3G8dJKuPyRSRohRZNbz1xjBhe8JszhqiYmLTAY) |
| register `buyer1.gaballs.testnet` on mock USDT | [9twDoEXz…](https://testnet.nearblocks.io/txns/9twDoEXzooXHRuAN21rZNDwr6XQV1hKGF6vmWmKUnd9V) |
| register `buyer2.gaballs.testnet` on mock USDT | [8ygxaXtT…](https://testnet.nearblocks.io/txns/8ygxaXtTzbUQBpnv7LbDVR8dQntEkvhZsKBgfVce9wxU) |

### Demo run: GBALL (30 packs)

Mock USDT funding: the faucet gives 100 USDT per account per hour and each buyer needs 150 for 15 packs. Each
buyer used its own faucet, and `gaballs.testnet` used its faucet once and sent 50 to each buyer. No minting
outside the faucet.

| Step | Transaction |
| --- | --- |
| `gaballs.testnet` launches GBALL (3.55 NEAR attached; `get_launch_cost` = 3.54 NEAR) | [2YaHYRdk…](https://testnet.nearblocks.io/txns/2YaHYRdkfLYyXzQi7v3hhqxwMAessmEsf9iu5rKkbAxZ) |
| check: `gball.gaballs.testnet` has 0 access keys; code SHA-256 = factory `machine_code_sha256` | — |
| buyer1 faucet (+100 USDT) | [7uKuyLzu…](https://testnet.nearblocks.io/txns/7uKuyLzue8fAdDBPg6B21CB1LidbB9CmwwcnxQb7agya) |
| buyer2 faucet (+100 USDT) | [6kuXJ9MQ…](https://testnet.nearblocks.io/txns/6kuXJ9MQPe8NHskz3KErq9CyDfJBd9U5Wb3s4KdZrYX4) |
| `gaballs.testnet` faucet (+100 USDT) | [DibhKNv8…](https://testnet.nearblocks.io/txns/DibhKNv8fxQuxWpWYSaNBb2d1E4NmJSnZNrtQCRPC8Zw) |
| `gaballs.testnet` sends 50 USDT to buyer1 | [FBaZUQ75…](https://testnet.nearblocks.io/txns/FBaZUQ75zHr5HEGRhQs58BS6C9SKSG4XfsXoCHdaQkSM) |
| `gaballs.testnet` sends 50 USDT to buyer2 | [DmQytvDo…](https://testnet.nearblocks.io/txns/DmQytvDo5mdQ1RrduppBMEYjsMxdwyoL1MfWkFHJo8j3) |
| buyer1 registers on the GBALL token (`storage_deposit`) | [NqAHrnCj…](https://testnet.nearblocks.io/txns/NqAHrnCjhVkVUh5ki4CkMbiiJRDe4PV7aS2bis6xmVd) |
| buyer2 registers on the GBALL token | [8TtGCGWS…](https://testnet.nearblocks.io/txns/8TtGCGWS2gStnTtSgy9mEvAp4ZeFNkDjitBrSviJVrs1) |
| buyer1 opens 5 packs: Common, Common, Common, Rare, Common | [BNeMwWAt…](https://testnet.nearblocks.io/txns/BNeMwWAtnit3B6xsLYNQrx5ggVDx7s9tk3xTRw1DJYEc) |
| buyer2 opens 5 packs: 5 × Common | [GYQxD2xD…](https://testnet.nearblocks.io/txns/GYQxD2xDMYryeuTJthUCgh9xqYhNJKwCtK8FLdiTwmjU) |
| buyer1 opens 5 packs: 5 × Common | [8Y5iLYYz…](https://testnet.nearblocks.io/txns/8Y5iLYYzdWhTsJpnYDT7UABS8AeUqAGGDhJDj78FHAjp) |
| buyer2 opens 5 packs: 5 × Common | [9uwMUgCg…](https://testnet.nearblocks.io/txns/9uwMUgCgaRSLw7NUSnbuBSvx61Bp1TWSyRYYWXxQsJy4) |
| buyer1 calls `sweep_fees` → NFT fee balance 1.00 USDT, platform +0.40 | [FpyU36xZ…](https://testnet.nearblocks.io/txns/FpyU36xZZcRMWWExgRn7kvY1ArNUbiGu8NiNjAXJFwNB) |
| `gaballs.testnet` claims 1.00 USDT | [3e8AaxqB…](https://testnet.nearblocks.io/txns/3e8AaxqBFA19koG2Lw2ZCHB1ZupM6YBRSU7TYPxX5CwG) |
| `gaballs.testnet` transfers the Machine NFT to buyer2 | [FqyrhLxC…](https://testnet.nearblocks.io/txns/FqyrhLxCktxZb6s6z8WiJ7zw4hXsrNE7ydnZWmAdhvvT) |
| buyer1 opens 5 packs: Common, Rare, Common, Epic, **Mythic** (pull #24, 8x, certificate minted) | [7B8gBLQU…](https://testnet.nearblocks.io/txns/7B8gBLQUMZcQoWCpA5mpwMrQvQVki9cDPrNVWatJpdEe) |
| buyer2 opens 5 packs: Common, Rare, Common, Common, Common | [B2BNfwXe…](https://testnet.nearblocks.io/txns/B2BNfwXey3H2HEui4uSJtjfZ5SnAuVbbfjekf7oRGHNS) |
| buyer2 calls `sweep_fees` → NFT fee balance 0.50 USDT, platform +0.20 | [8T14XXh4…](https://testnet.nearblocks.io/txns/8T14XXh4PDnkiTNDUKuUVSoj3K53ZfTwo8cPnoUrNuGy) |
| `gaballs.testnet` (old owner) tries to claim — **rejected**: "Only the current owner can claim" | [8znDTTVk…](https://testnet.nearblocks.io/txns/8znDTTVkUX8bJrBoKgph2pZdaZ8xU5UT7gfuoFeYVqnb) |
| buyer2 (new owner) claims 0.50 USDT | [HJ3QBoKf…](https://testnet.nearblocks.io/txns/HJ3QBoKfwkdKfMbAMnvYJGaRmUU86AX7j9DmCjFkSHoi) |

### Result (`get_machine` after the run)

- Packs opened: 30 — Common 25, Rare 3, Epic 1, Mythic 1; capped pulls: 0
- Best multiplier hit: 8x (pull #24: bought 2,265,642 GBALL, paid 18,125,136)
- Price: 0.0000045317 USDT/token (launch: 0.00000375); market cap: 4,531.73 USDT; vault: 97,113,289 GBALL
- Mythic certificate `cert:gball.gaballs.testnet:24` owned by buyer1 (soulbound)
- Machine NFT `machine:gball.gaballs.testnet` owned by buyer2; fee history: Credit 1.00 → Claim 1.00 → Credit 0.50 → Claim 0.50
- Platform fees received by `platform.gaballs.testnet`: 0.60 USDT (0.2% of 300 USDT)

## Testnet NEAR balances after the demo

| Account | NEAR |
| --- | --- |
| `gaballs.testnet` | 17.80 |
| `gball.gaballs.testnet` | 3.48 (holds its own code storage) |
| `nft.gaballs.testnet` | 4.06 |
| `usdt.gaballs.testnet` | 2.51 |
| `platform.gaballs.testnet` | 0.10 |
| `buyer1.gaballs.testnet` / `buyer2.gaballs.testnet` | 0.99 / 0.99 |

## Earlier setup

| Account | Role | Created by (tx) |
| --- | --- | --- |
| `gaballs.testnet` | Root; factory | [3MiCxjFC…](https://testnet.nearblocks.io/txns/3MiCxjFCY4iLG6GQgNduks27CqcUTjoZApejGuGiEE9W) (faucet) |
| `buyer1.gaballs.testnet` | Test buyer | [EwqBQBwp…](https://testnet.nearblocks.io/txns/EwqBQBwpiHipLP4Y5MdHM4hqFcEwFV2RFyZLvZqyq3FW) |
| `buyer2.gaballs.testnet` | Test buyer | [7FB8ZNUX…](https://testnet.nearblocks.io/txns/7FB8ZNUXcUVEtrYhcZeBT9iBz6XTU7Fq7UGGiJkQnUpM) |

Testnet NEAR top-ups: throwaway faucet accounts deleted with `gaballs.testnet` as beneficiary (deleting an account sends
its whole balance there).

| Date | Helper account | Created (faucet) | Deleted → gaballs.testnet |
| --- | --- | --- | --- |
| 2026-11-11 | `gaballs-topup1.testnet` | [9h3qZi46…](https://testnet.nearblocks.io/txns/9h3qZi46rNPQk38Wj7T4UwNDEGB8SuQdmvGEFyaBptfC) | [4XFUPHHo…](https://testnet.nearblocks.io/txns/4XFUPHHoMXnxfVDFXwURBEyBDUZz2uuN8fb3EfGcuQU8) |
| 2026-11-11 | `gaballs-topup2.testnet` | [FRjm8XzA…](https://testnet.nearblocks.io/txns/FRjm8XzARf4Dj2JdX7mSYSuVctxQQLdSgS4KfbyYrzxS) | [Aw3nUWkW…](https://testnet.nearblocks.io/txns/Aw3nUWkWBbMtYVkQFU3pQJBimUWB22Q73uh3shVBTXBY) |

Before judging, 2026-11-14: the welcome kit and the flagship machine (which pays OutLayer's VRF fee from its own NEAR)
were topped up the same way, each helper deleted with the target as beneficiary. After: `gaballs-welcome.testnet`
27.45 NEAR free (about 50 kits), `gaballs.gaballs.testnet` 10.71 NEAR free. (`gaballs-topup4.testnet` already
existed under someone else's key, so it was skipped.)

| Date | Helper account | Created (faucet) | Deleted → beneficiary |
| --- | --- | --- | --- |
| 2026-11-14 | `gaballs-topup5.testnet` | [7fLV7UeB…](https://testnet.nearblocks.io/txns/7fLV7UeBkGeemwk1VWkHyFgbpohcFL9DtCwUzjkbG7Cf) | [EqkWKSn2…](https://testnet.nearblocks.io/txns/EqkWKSn2krm6PSztPQtMgdzoXQSbnPPb4hZXp1ZvB6KU) → gaballs-welcome.testnet |
| 2026-11-14 | `gaballs-kit-topup7.testnet` | [CDc49VfE…](https://testnet.nearblocks.io/txns/CDc49VfEnucch8bE8akAAHf42ARLz7BFYwLHdCv4Hjq8) | [9tiY3xdN…](https://testnet.nearblocks.io/txns/9tiY3xdNiziuCexybADWkhFff3BPkFxMyNAKZjnCsuBt) → gaballs-welcome.testnet |
| 2026-11-14 | `gaballs-topup6.testnet` | [3fTyoQCd…](https://testnet.nearblocks.io/txns/3fTyoQCdejTxQ8d5ritfxPEjJ29kmtwwkSUmCH9VyPdY) | [F3TtKsEq…](https://testnet.nearblocks.io/txns/F3TtKsEqJn5hte6Ne8J6WActRH2bo4gq7dmEE5M5XMMP) → gaballs.gaballs.testnet |
