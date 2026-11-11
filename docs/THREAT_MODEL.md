# Threat model: the Machine NFT "holds money" mechanic

Status: **approved 2026-11-11; every threat below has a passing test** (unit tests in `contracts/nft/src/tests.rs`,
sandbox tests in `tests/sandbox/tests/flow.rs`).

## What is being protected

Each machine has exactly one transferable **Machine NFT** (`machine:<machine_account>`) on `nft.gaballs.testnet`.
Creator fees (0.5% of every pack) are swept from the machine into the NFT contract and credited to
`fee_balance[token_id]`. Only the **current owner** can `claim(token_id)`. Unclaimed balance stays with the token when it
changes hands — so a buyer of the NFT is buying its unclaimed USDT plus all future fees.

The question: **how could someone who sells a Machine NFT try to keep money that should go to the buyer, and what stops
them?** Secondary: how could anyone else steal or fake a fee balance?

## Design rules that follow from this

| # | Rule |
| --- | --- |
| R1 | Fees are credited to the **token id**, never to an owner account. Whoever owns the token when they claim gets it. |
| R2 | `claim` is callable only by the current owner (not approved accounts), and only when the token has **no active approvals**. |
| R3 | `claim` sets the balance to 0 **before** sending USDT; the failure callback **adds back** the amount (not "sets"), so fees credited meanwhile are not lost. |
| R4 | Every transfer clears all approvals (NEP-178) and is rejected if `approval_id` does not match. |
| R5 | `ft_on_transfer` on the NFT contract accepts USDT only from the configured USDT contract and only when `sender_id` is the machine bound to `token_id`. |
| R6 | The machine's sweep target (`nft_token_id`, NFT contract) is fixed at launch; the machine account has no access keys. |
| R7 | One Machine NFT per machine, minted only by the factory. Certificates minted only by machines the factory registered. |
| R8 | Certificates are soulbound: transfer, transfer_call and approve all panic. They carry no fee balance. |

## Threats

| # | Attack (seller or third party) | What stops it | Test |
| --- | --- | --- | --- |
| T1 | **Claim front-run on a listed sale.** Seller lists the NFT on a marketplace showing a 500 USDT balance, then claims it just before the buyer's purchase lands. Buyer gets an empty NFT. | R2: while any approval (a listing) exists, `claim` panics. To claim, the seller must first revoke approvals, which kills the listing (its `approval_id` becomes invalid, R4). So while listed, the balance can only grow. | `claim_blocked_while_approved`, `revoke_invalidates_listing_approval_id` |
| T2 | **Approval left behind.** Seller approves an alt account, sells the NFT, then uses the alt's leftover approval to transfer the NFT back (or claim). | R4: every transfer clears all approvals. R2: approved accounts can never claim, only the owner. | `transfer_clears_approvals`, `old_approved_account_cannot_transfer_or_claim` |
| T3 | **Transfer during sweep.** A `sweep_fees` is in flight (machine → USDT → NFT contract) while the seller transfers the NFT, hoping the incoming fees land with them. | R1: the credit is keyed by `token_id`, not owner, so it lands with whoever owns the token when the credit executes. The seller has no account-level balance to receive it. | `sweep_credits_token_not_owner`; sandbox `launch_packs_sweep_claim_transfer_claim` |
| T4 | **Claim, then transfer while the USDT payout is in flight.** Seller claims (balance → 0, USDT transfer pending) and transfers in the same block. If the USDT transfer fails, does the money come back to the seller? | R3: on failure the amount is added back **to the token**, so it goes to the new owner. If the transfer succeeds, the seller legitimately claimed what was theirs while they owned it. | `failed_claim_restores_to_token_after_transfer` |
| T5 | **Restore overwrites new fees.** Claim fails while a new sweep landed in between; a naive "set balance = old" would erase the new fees (or double them). | R3: restore is `balance += amount`. | `failed_claim_restore_adds_not_sets` |
| T6 | **Double claim.** Owner calls `claim` twice before the first payout settles. | R3: balance is 0 after the first call; `claim` with 0 balance panics. | `double_claim_second_fails` |
| T7 | **Fake revenue history to inflate the sale price.** Seller calls `ft_on_transfer` directly, or sends their own USDT to the NFT contract, to make the fee history look bigger. | R5: direct calls fail (predecessor ≠ USDT); USDT from anyone other than the bound machine is refunded. Real fees can only come from real packs, which are public in the machine's pull log. | `fake_ft_on_transfer_rejected`, `usdt_from_non_machine_refunded` |
| T8 | **Redirect future fees.** Creator changes the machine's sweep target to an account they keep after selling. | R6: no setter exists; the machine account has no access keys, so its code cannot be replaced. Checkable with `near account list-keys`. | sandbox `launch_packs_sweep_claim_transfer_claim` (asserts the machine has 0 access keys) |
| T9 | **Mint a second Machine NFT** for the same machine and keep it after selling the first. | R7: only the factory can mint; token id is derived from the machine account and minting an existing id panics. | `mint_machine_nft_only_factory`, `mint_machine_nft_twice_fails` |
| T10 | **`nft_transfer_call` revert trick.** Seller uses `nft_transfer_call` to a contract that says "return it", hoping balance or approvals end up favourable. | The fee balance never moves on transfer or revert (R1); approvals are cleared on the initial transfer (R4); the standard resolver returns the token only if the receiver still owns it. | `transfer_call_revert_keeps_balance_with_token` |
| T11 | **Sell a certificate as if it were a Machine NFT**, or route fees to a certificate. | R8: certificates can't be transferred or approved, have no fee balance, and `claim` on one panics. | `certificate_transfer_fails`, `certificate_transfer_call_fails`, `certificate_approve_fails`, `claim_on_certificate_fails`; sandbox `forced_mythic_mints_soulbound_certificate` |
| T12 | **Spoofed certificate mint** by an unregistered contract. | R7: `mint_certificate` requires the predecessor to be a machine registered by the factory. | `mint_certificate_only_registered_machine` |
| T13 | **Claim by a non-owner.** | R2: predecessor must equal the token owner. | `only_owner_can_claim` |

## Phase 5: verifiable randomness and sell-back

Who could try to bend a pull or a sale, and what stops them. Tests are in `contracts/machine/src/tests.rs` unless
marked sandbox (`tests/sandbox/tests/flow.rs`, real contracts on a local node with a mock OutLayer).

| # | Attack | What stops it | Test |
| --- | --- | --- | --- |
| V1 | **Forged proof.** Anyone (or a dishonest OutLayer worker) returns a made-up "random" result. | The callback runs `env::ed25519_verify` against the OutLayer VRF public key fixed at launch. Without OutLayer's key the signature cannot verify; the pull is refunded instead of settled. | `vrf_forged_proof_is_rejected_and_refunded`; sandbox `vrf_valid_forged_failed_and_timeout_on_chain` |
| V2 | **Proof shopping.** A worker holds several genuine proofs and delivers the one with the best outcome for some request. | The alpha must end in *this* request's seed (`{machine}-{request_id}`, unique per machine and request); a genuine proof for any other request, or from another machine, is rejected. Each proof is deterministic (same key + alpha = same signature), so there is nothing to re-roll. | `vrf_proof_for_another_request_or_a_tampered_alpha_is_rejected`, `vrf_proof_for_another_request_of_the_same_buyer_is_rejected`, `vrf_proof_from_another_machine_is_rejected` |
| V3 | **Fake "value".** OutLayer's response includes a convenient `value` field. | Ignored. The rolls are computed by the contract from SHA-256 of the verified signature. | `vrf_valid_proof_settles_with_rolls_derived_from_the_signature` |
| V4 | **Duplicate or late callback** pays twice. | Settle and refund both start by removing the pending entry; whichever runs first wins, the other finds nothing and does nothing. `on_vrf_result` is `#[private]`. | `vrf_duplicate_callback_is_ignored`, `vrf_timeout_refund_by_anyone_and_late_result_is_ignored` |
| V5 | **USDT stuck** because OutLayer never answers. | OutLayer failure → callback refunds. No callback at all → after 300 blocks anyone can call `refund_expired`. A refund whose transfer fails goes back to pending, flagged, and can be retried at once. | `vrf_garbage_or_failed_result_is_refunded`, `failed_refund_goes_back_to_pending_and_can_be_retried_at_once`; sandbox step 4 (301-block fast-forward) |
| V6 | **Seeing the roll first.** The buyer (or a validator) predicts the outcome and only pays when it is good. | The roll depends on OutLayer's signature over a request id assigned by OutLayer after the payment is final; it cannot be computed before. (Block randomness in v1 machines could be influenced by block producers.) | by construction |
| V7 | **Machine runs out of NEAR** for VRF fees and payments strand. | `ft_on_transfer` refunds immediately when the free balance is below 0.1 NEAR + 0.01 NEAR; anyone can top the machine up with a plain NEAR transfer. | `payment_is_refunded_when_the_machine_cannot_pay_for_vrf` |
| V8 | **Squad pulls.** A Sputnik DAO (no keys) pays; the member whose vote executes the proposal signs the transaction, and OutLayer names that signer in the alpha. | The signer name is not checked (see below); the prize goes to the pending pull's recorded buyer (the DAO), never to the signer. | `vrf_proof_naming_a_different_signer_with_the_right_seed_is_accepted_and_pays_the_buyer`; sandbox `sputnik_dao_squad_opens_packs_by_vote_and_receives_the_prize` |
| S1 | **Sell more USDT than the curve holds** (e.g. the creator dumps the 100M allocation at launch). | `quote_sell` rejects any sale whose `usdt_out` exceeds R. | `sell_that_would_push_the_reserve_below_zero_is_rejected` |
| S2 | **Sandwich / price moves** between quote and sale. | `min_usdt_out`: the contract rejects the sale if it would pay less; the app sends quote − 1%. | `sell_slippage_guard`; sandbox `sell_back_on_chain` |
| S3 | **USDT transfer fails** after the tokens were taken. | The callback returns the tokens and restores R and the fees (fees already swept away are not double-counted). | `failed_sell_transfer_restores_everything`, `failed_sell_after_a_sweep_restores_what_the_machine_still_holds` |
| S4 | **Rounding drain** through many small sells. | Sell rounds in the contract's favour (the curve's remaining V+R is rounded up); the constant product never shrinks. | `curve_sell_matches_reference_and_rounds_for_the_contract` |

**Why not checking the signer's name is safe.** OutLayer's alpha is `vrf:{request_id}:{signer}:{seed}`, where
`signer` is whoever signed the transaction that paid. The first Phase 5 machine (`gumball`) also required `signer` to be
the buyer or the machine; that made squad pulls impossible, because a Sputnik DAO has no keys and its proposals are
executed by a member's vote. The current machine accepts any valid account there and keeps every other check: the
signature must verify against the OutLayer key fixed at launch; the alpha must end in exactly this pending request's
seed `{machine}-{request_id}`, which names this machine and is never reused; the request must still be pending (settled
or refunded requests ignore late or duplicate answers); and the timeout refund is unchanged. The seed is what binds a
proof to one pull: a proof for another request or another machine carries another seed and is rejected whoever signed
it, and the signer cannot change who is paid, because the payout goes to the buyer recorded when the USDT arrived. The
signer name added no protection the seed does not already give; it only tied a proof to the paying account's own
signature, which a DAO can never produce.

## Residual risks (not solved by the contract — disclosed in the README)

- **Off-chain (OTC) sales.** If buyer and seller trade outside a marketplace ("send me USDT, I'll transfer"), the seller
  can claim before transferring, or never transfer. The contract cannot enforce a deal it does not see. Buyers should
  use the approval/marketplace path, where T1 is enforced.
- **Real-activity wash.** A seller can buy packs themselves to generate real fees before selling. That costs them about
  5.8% per pack and is fully visible in the machine's pull log.
- **NFT and factory contract keys.** During the hackathon, `nft.gaballs.testnet` and `gaballs.testnet` keep a
  full-access key so they can be fixed and redeployed. Whoever holds those keys could, in principle, upgrade the NFT
  contract. Before submission we can delete those keys too (making them immutable) — decision for the human.
- **Trusting OutLayer's key.** VRF proves the result came from OutLayer's key and was not chosen per request; it does
  not prove OutLayer keeps that key private. The key is fixed per machine at launch: if OutLayer ever rotates it, that
  machine's pulls stop verifying and every payment is refunded (no funds lost, but the machine stops opening packs).
- **v1 machines** (`gball`, `lfg`, `lfgg`, launched before Phase 5) still use block randomness and have no sell-back.
  They are keyless and cannot be upgraded; the app labels them "v1 · block randomness".
