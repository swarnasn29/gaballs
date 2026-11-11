# Deployments (testnet)

Deployed 2026-11-10 (UTC) with `scripts/deploy-testnet.sh`; demo run with `SYMBOL=GBALL scripts/demo-run.sh`.
Explorer: [testnet.nearblocks.io](https://testnet.nearblocks.io). Raw script logs are written to `scripts/out/` (not committed).

## Contract accounts

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

## Verify it yourself

| Claim | Command | Expected |
| --- | --- | --- |
| The machine has no access keys (nobody can change its code or parameters) | `near account list-keys gball.gaballs.testnet network-config testnet now` | an empty table |
| The launched machine runs exactly the code stored in the factory | `near account view-account-summary gball.gaballs.testnet network-config testnet now` → "Local Contract (SHA-256 checksum hex)" | `5ddeac42…d286` |
| | `near contract call-function as-read-only gaballs.testnet get_config json-args '{}' network-config testnet now` → `machine_code_sha256` | `5ddeac42…d286` (same) |
| That code is this repo's machine | `./scripts/build-wasm.sh && sha256sum target/near/gaballs_machine/gaballs_machine.wasm` | `5ddeac42…d286` ¹ |
| Odds and multipliers are fixed and public | `near contract call-function as-read-only gball.gaballs.testnet get_odds json-args '{}' network-config testnet now` | 7500/2000/400/100 bps; 0.7x/1.25x/2.5x/8x; expected 9550 |

¹ `non-reproducible-wasm` builds on the same toolchain (Rust 1.95.0, cargo-near 0.23.0) produced these hashes here; a
reproducible Docker build for byte-exact verification on any machine is planned before submission.

## Deployment transactions

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

## Demo run: GBALL (30 packs)

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
