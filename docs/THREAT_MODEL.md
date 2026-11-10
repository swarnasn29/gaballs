# Threat model: the Machine NFT "holds money" mechanic

Status: **draft for review — no NFT code written yet.**

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
| T3 | **Transfer during sweep.** A `sweep_fees` is in flight (machine → USDT → NFT contract) while the seller transfers the NFT, hoping the incoming fees land with them. | R1: the credit is keyed by `token_id`, not owner, so it lands with whoever owns the token when the credit executes. The seller has no account-level balance to receive it. | `sweep_credits_token_not_owner` (sandbox: sweep → transfer → new owner claims all) |
| T4 | **Claim, then transfer while the USDT payout is in flight.** Seller claims (balance → 0, USDT transfer pending) and transfers in the same block. If the USDT transfer fails, does the money come back to the seller? | R3: on failure the amount is added back **to the token**, so it goes to the new owner. If the transfer succeeds, the seller legitimately claimed what was theirs while they owned it. | `failed_claim_restores_to_token_after_transfer` |
| T5 | **Restore overwrites new fees.** Claim fails while a new sweep landed in between; a naive "set balance = old" would erase the new fees (or double them). | R3: restore is `balance += amount`. | `failed_claim_restore_adds_not_sets` |
| T6 | **Double claim.** Owner calls `claim` twice before the first payout settles. | R3: balance is 0 after the first call; `claim` with 0 balance panics. | `double_claim_second_fails` |
| T7 | **Fake revenue history to inflate the sale price.** Seller calls `ft_on_transfer` directly, or sends their own USDT to the NFT contract, to make the fee history look bigger. | R5: direct calls fail (predecessor ≠ USDT); USDT from anyone other than the bound machine is refunded. Real fees can only come from real packs, which are public in the machine's pull log. | `fake_ft_on_transfer_rejected`, `usdt_from_non_machine_refunded` |
| T8 | **Redirect future fees.** Creator changes the machine's sweep target to an account they keep after selling. | R6: no setter exists; the machine account has no access keys, so its code cannot be replaced. Checkable with `near account list-keys`. | factory sandbox test: `machine_has_no_access_keys` |
| T9 | **Mint a second Machine NFT** for the same machine and keep it after selling the first. | R7: only the factory can mint; token id is derived from the machine account and minting an existing id panics. | `mint_machine_nft_only_factory`, `mint_machine_nft_twice_fails` |
| T10 | **`nft_transfer_call` revert trick.** Seller uses `nft_transfer_call` to a contract that says "return it", hoping balance or approvals end up favourable. | The fee balance never moves on transfer or revert (R1); approvals are cleared on the initial transfer (R4); the standard resolver returns the token only if the receiver still owns it. | `transfer_call_revert_keeps_balance_with_token` |
| T11 | **Sell a certificate as if it were a Machine NFT**, or route fees to a certificate. | R8: certificates can't be transferred or approved, have no fee balance, and `claim` on one panics. | `certificate_transfer_fails`, `claim_on_certificate_fails` |
| T12 | **Spoofed certificate mint** by an unregistered contract. | R7: `mint_certificate` requires the predecessor to be a machine registered by the factory. | `mint_certificate_only_registered_machine` |
| T13 | **Claim by a non-owner.** | R2: predecessor must equal the token owner. | `only_owner_can_claim` |

## Residual risks (not solved by the contract — disclosed in the README)

- **Off-chain (OTC) sales.** If buyer and seller trade outside a marketplace ("send me USDT, I'll transfer"), the seller
  can claim before transferring, or never transfer. The contract cannot enforce a deal it does not see. Buyers should
  use the approval/marketplace path, where T1 is enforced.
- **Real-activity wash.** A seller can buy packs themselves to generate real fees before selling. That costs them about
  5.8% per pack and is fully visible in the machine's pull log.
- **NFT and factory contract keys.** During the hackathon, `nft.gaballs.testnet` and `gaballs.testnet` keep a
  full-access key so they can be fixed and redeployed. Whoever holds those keys could, in principle, upgrade the NFT
  contract. Before submission we can delete those keys too (making them immutable) — decision for the human.
