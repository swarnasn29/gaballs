# Builds every contract to target\near\. Windows. (macOS / Linux: scripts/build-wasm.sh)
# --no-abi: cargo-near's ABI step cannot link natively on Windows; the wasm is the same.
# The test-hooks machine is ONLY for sandbox tests; it is never deployed.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
foreach ($c in "mock-usdt", "nft", "machine", "factory") {
    Push-Location "contracts\$c"
    cargo near build non-reproducible-wasm --no-abi
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
}
Push-Location "contracts\machine"
cargo near build non-reproducible-wasm --no-abi --features test-hooks --out-dir ..\..\target\near\machine_test_hooks
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location
Get-ChildItem target\near -Recurse -Filter *.wasm | Select-Object FullName, Length
