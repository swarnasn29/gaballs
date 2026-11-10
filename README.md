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

| Contract | Testnet account | Source |
| --- | --- | --- |
| Factory | _TBD_ | `contracts/factory` |
| Machine + token (one per launch) | _TBD_ | `contracts/machine` |
| NFT (Machine NFT + Mythic certificates) | _TBD_ | `contracts/nft` |
| Mock USDT (testnet) | _TBD_ | `contracts/mock-usdt` |

## 5. Reproduce locally

### Prerequisites
_TBD — exact versions of Rust, cargo-near, near-cli-rs, Node._

### Build and test
1. `cargo test --workspace` → `test result: ok. 23 passed` (machine) and `ok. 5 passed` (mock-usdt).
2. Build each contract to wasm:
   - macOS / Linux: `cd contracts/machine && cargo near build non-reproducible-wasm`
   - Windows: `cd contracts/machine && cargo near build non-reproducible-wasm --no-abi`
     (cargo-near's ABI step fails to link natively on Windows; the wasm itself is identical.)

   Output: `target/near/gaballs_machine/gaballs_machine.wasm`. Repeat for `contracts/mock-usdt`.

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
- `cargo near new` template (cargo-near 0.23.0) — crate manifests and toolchain pin
- Python 3.12, numpy, matplotlib — economics simulation (`sim/`)
- AI-assisted: code in this repository was written with Claude Code (Anthropic)
- _More added per phase._

## 10. License

MIT — see [LICENSE](LICENSE).
