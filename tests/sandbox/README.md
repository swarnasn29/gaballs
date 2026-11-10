# Sandbox integration tests

Real contracts on a local NEAR node (`near-sandbox` + `near-api`, the stack the official `cargo near new` template
uses; it replaces the older `near-workspaces`). The NEAR sandbox node runs on Linux and macOS only — on Windows,
run step 2 inside WSL.

1. Build all wasm (from the repo root): `./scripts/build-wasm.sh` (Windows: `scripts\build-wasm.ps1`).
   This also builds `target/near/machine_test_hooks/` — a machine with a test-only `test_force_next_tier` method,
   used only by the forced-Mythic test. The deployable machine in `target/near/gaballs_machine/` does not contain it.
2. `cd tests/sandbox && cargo test -- --nocapture --test-threads=1`
   → `test result: ok. 2 passed`

Tests:
- `launch_packs_sweep_claim_transfer_claim` — launch → faucet → storage_deposit → 20 packs → sweep_fees → creator
  claims → creator transfers the Machine NFT → 10 more packs → new owner sweeps → old owner's claim fails → new
  owner claims. Also checks the machine account has zero access keys and has no test hook.
- `forced_mythic_mints_soulbound_certificate` — a forced Mythic pays 8x, mints `cert:<machine>:0` to the buyer, and
  transferring the certificate fails.
