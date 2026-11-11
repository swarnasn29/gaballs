# Third-party contracts used by the sandbox tests

`sputnikdao2-v3.31.wasm` — the Sputnik DAO v2 contract that the testnet factory `sputnikv2.testnet` deploys by default
(`get_default_version` = [3, 31], commit `7764926cfd3c47f62b5fcde231c251f3c3892887`,
[near-daos/sputnik-dao-contract](https://github.com/near-daos/sputnik-dao-contract)). Downloaded from the factory
itself, not rebuilt:

```bash
near contract call-function as-read-only sputnikv2.testnet get_default_code_hash json-args '{}' network-config testnet now
# "AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH"
near contract call-function as-read-only sputnikv2.testnet get_code \
  json-args '{"code_hash":"AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH"}' network-config testnet now
```

Check: the base58 SHA-256 of this file is `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` (539,647 bytes), the same code
hash every DAO created by the factory reports.
