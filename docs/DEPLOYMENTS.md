# Deployments (testnet)

## Current: Phase 5 (verifiable randomness + sell-back), 2026-11-11 UTC

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
