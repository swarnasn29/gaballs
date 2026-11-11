# Sandbox integration tests

Real contracts on a local NEAR node (`near-sandbox` + `near-api`, the stack the official `cargo near new` template
uses; it replaces the older `near-workspaces`). The NEAR sandbox node runs on Linux and macOS only — on Windows,
run step 2 inside WSL.

1. Build all wasm (from the repo root): `./scripts/build-wasm.sh` (Windows: `scripts\build-wasm.ps1`).
   This also builds `target/near/machine_test_hooks/` — a machine with a test-only `test_force_next_tier` method,
   used only by the forced-Mythic test. The deployable machine in `target/near/gaballs_machine/` does not contain it.
2. `cd tests/sandbox && cargo test -- --nocapture --test-threads=1`
   → `test result: ok. 5 passed`

Tests:
- `launch_packs_sweep_claim_transfer_claim` — launch → faucet → storage_deposit → 20 packs → sweep_fees → creator
  claims → creator transfers the Machine NFT → 10 more packs → new owner sweeps → old owner's claim fails → new
  owner claims. Also checks the machine account has zero access keys and has no test hook.
- `forced_mythic_mints_soulbound_certificate` — a forced Mythic pays 8x, mints `cert:<machine>:0` to the buyer, and
  transferring the certificate fails.
- `vrf_valid_forged_failed_and_timeout_on_chain` — Phase 5 VRF against `contracts/mock-outlayer` (proofs signed by a
  test key): a valid proof settles 2 packs (and verifies off-chain), a forged proof and an OutLayer failure are both
  refunded, and a pull whose callback never arrives (test-only `test_drop_next_vrf_callback`) is refused a refund before
  the timeout and refunded by a stranger after a 301-block fast-forward.
- `sell_back_on_chain` — 10 packs, a sell with `min_usdt_out` one unit above the quote fails and changes nothing, the sell
  at the quote pays exactly `quote_sell().usdt_out`, and the machine's USDT equals R + unswept fees.
- `longest_symbol_launch_mints_the_machine_nft` — a 12-character symbol (the maximum) still mints its Machine NFT at
  launch (regression: 0.05 NEAR for the mint was too little for longer machine accounts).
