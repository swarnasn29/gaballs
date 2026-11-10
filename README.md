# Gaballs

A gacha launchpad on NEAR. A creator launches a memecoin together with a gacha machine. Every 10 USDT pack is a
market buy of that coin on the machine's own bonding curve; a random draw from a fixed, public odds table then
multiplies what the buyer receives. Commons feed a prize vault; Rare/Epic/Mythic pulls draw from it. The creator
holds a transferable Machine Ownership NFT that accrues creator fees in its own balance.

Built at NEAR HACKATHON 2026. Tracks: `memecoins` (primary), `nfts` (secondary).

> Status: Phase 0 (economics simulation). Sections marked _TBD_ are filled in as each phase lands.

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

How the money flows: buyer → `usdt.ft_transfer_call(machine, 10 USDT)` → machine keeps 9.93 USDT in its curve, accrues
0.05 USDT for the Machine NFT and 0.02 USDT for the platform → `sweep_fees()` → `usdt.ft_transfer_call(nft, fees,
{"token_id":"machine:<machine>"})` → the NFT contract credits that token → its current owner calls `claim`.

## 5. Reproduce locally

### Prerequisites
_TBD — exact versions of Rust, cargo-near, near-cli-rs, Node._

### Build and test
1. Unit tests: `cargo test --workspace` → four `test result: ok` lines: factory 10, machine 23, mock-usdt 5, nft 27.
2. Build all contracts to wasm:
   - macOS / Linux: `./scripts/build-wasm.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts\build-wasm.ps1` (adds `--no-abi`: cargo-near's ABI
     step fails to link natively on Windows; the wasm itself is identical.)

   Output: `target/near/{gaballs_factory,gaballs_machine,gaballs_nft,gaballs_mock_usdt}/*.wasm`, plus
   `target/near/machine_test_hooks/gaballs_machine.wasm` (sandbox tests only, never deployed).
3. Sandbox integration tests (Linux/macOS, or WSL on Windows): `cd tests/sandbox && cargo test -- --nocapture --test-threads=1`
   → `test result: ok. 2 passed`. See [tests/sandbox/README.md](tests/sandbox/README.md).

Windows note: `.cargo/config.toml` sets `AWS_LC_SYS_PREBUILT_NASM_x86_64_pc_windows_msvc` so the test
dependencies build without installing NASM. The variable is target-specific and is ignored on macOS/Linux.

## 6. Verify the trust claims

_TBD — e.g. `near account list-keys <machine>.testnet` shows no full-access key; odds readable via `get_odds`._

## 7. Deployments and transaction links

See [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

## 8. Security notes

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## 9. Built with

- near-sdk 5.30.1 and near-contract-standards 5.30.1 (NEP-141/145/148 implementation) — contracts
- uint 0.10.2 — 256-bit integers for the curve maths
- near-sandbox 0.4.0 + near-api 0.8 — sandbox integration tests (`tests/sandbox`)
- `cargo near new` template (cargo-near 0.23.0) — crate manifests and toolchain pin
- Python 3.12, numpy, matplotlib — economics simulation (`sim/`)
- AI-assisted: code in this repository was written with Claude Code (Anthropic)
- _More added per phase._

## 10. Phase 7 checklist (Saturday, before submission — not done yet)

Only after the README steps above have been verified on a fresh clone:

- [ ] Delete the access keys on the NFT contract account and the factory account.
- [ ] Make sure no owner-only method can still change anything afterwards (e.g. `set_machine_code` becomes
      one-time-only or the owner role is removed). Report any owner method that remains.
- [ ] Add a judge command that shows every contract account has no access keys, e.g.
      `near account list-keys <account> network-config testnet now` for the factory, NFT, mock USDT and each machine.

## 11. License

MIT — see [LICENSE](LICENSE).
