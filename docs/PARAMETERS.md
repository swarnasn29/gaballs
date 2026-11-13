# Gaballs launch parameters (Phase 0 simulation)

Status: **chosen 2026-11-10 — Default (see bottom).**

## What was simulated

- 10,000 packs of 10 USDT (≈ 99,300 USDT into the curve after the 0.7% fees), 200 random runs per case.
- Odds and multipliers exactly as CLAUDE.md §2 (expected multiplier 0.955). Creator allocation 100M (the maximum),
  so the curve gets `1B − vault seed − 100M`.
- Three buyer behaviours: **everyone holds**; **50% sell their whole payout right after the pull**; **worst case** =
  the first 10 pulls are all Mythic, then 50% sell.
- Reproduce: `sim/.venv/Scripts/python sim/simulate.py` → charts and `summary.json` in `sim/out/`.

| Setting | Virtual reserve V | Vault seed | Cap per draw | Start price (USDT/token) | Vault = how many first packs |
| --- | --- | --- | --- | --- | --- |
| Conservative | 10,000 USDT | 150M | 15% | 0.0000133 | ~200 |
| Default | 3,000 USDT | 100M | 25% | 0.00000375 | ~38 |
| Aggressive | 1,000 USDT | 50M | 40% | 0.00000118 | ~6 |

## Results (median of 200 runs)

| | Conservative | Default | Aggressive |
| --- | --- | --- | --- |
| Price after 100 packs (all hold) | 1.2x | 1.8x | 4.0x |
| Price after 10,000 packs (all hold / 50% sell) | 119x / 38x | 1,163x / 335x | 10,060x / 2,798x |
| Realized avg multiplier (hold) | 0.956 | 0.953 | 0.948 |
| Lowest vault, normal play (bad 5% of runs) | 91% of seed | 63% of seed | 30% of seed |
| Lowest vault, worst case (median) | 64% of seed | **6% of seed** | **0.6% of seed** |
| Pulls capped, normal play | 0% | 0% | 0% (max 0.1%) |
| Pulls capped, worst case | 0% | 0.11% (~11 pulls) | 0.13% (~13 pulls) |
| Flipper gets back per 10 USDT (sell right away) | 9.42 | 9.42 | 9.41 |

Charts: `sim/out/price.png`, `sim/out/vault.png`, `sim/out/capped.png`, `sim/out/multiplier.png`.

## What this means in plain words

1. **The odds table works as designed.** Across every setting the realized multiplier lands on ~0.955, and the vault
   grows over time because Commons put more in than winners take out.
2. **The cap almost never bites.** In normal play no pull was capped. Only the "10 Mythics in a row" nightmare
   triggers it, for ~11 pulls, after which the vault refills. The cap is a safety net, not part of normal play.
3. **The real difference between settings is how fast the price moves and how fragile the first ~50 packs are.**
   - Conservative: very safe vault, but the price barely moves during a demo (1.2x after 100 packs) — weak memecoin feel.
   - Aggressive: exciting price, but one unlucky early streak empties the vault to almost nothing, and normal bad
     luck takes it down to 30% of its seed.
   - Default: price visibly moves in a demo (1.8x after 100 packs), the vault survives normal bad luck with ~60%
     left, and even the worst case leaves something in the vault and recovers within a few hundred packs.
4. **Someone who flips every pack gets back about 9.42 USDT per 10 USDT** (4.5% from the odds, 0.7% fee in,
   0.7% fee out). That is the honest "house edge" to show in the risk notice.
5. **Early big winners may not be able to sell right away** (under 0.1% of sells were rejected, all in the very first
   packs): the curve only holds the USDT that has been paid in so far. They can sell later. The UI should say so.

## Recommendation

**Default: V = 3,000 USDT, vault seed = 100M tokens, cap = 25% per draw.** It is the only setting that is both
visibly alive in a short demo and survives the worst case without the vault going to zero.

## Chosen values

Chosen by the human on 2026-11-10: **Default**.

| Parameter | Value |
| --- | --- |
| Virtual USDT reserve `V` | 3,000 USDT (`3_000_000_000` in 6-decimal units) |
| `vault_seed` | 100,000,000 tokens |
| `max_vault_draw_bps` | 2,500 (25%) |
| `curve_inventory` | 800,000,000 tokens with creator allocation 100M (remainder of 0–100M allocation goes to the curve) |

Later (not this phase): offer Conservative and Aggressive as launch presets. Each machine still fixes its values
at launch, with no setters afterwards.

## Pack size (added 2026-11-14)

Chosen by the human on 2026-11-14: a pack can be any amount from **10 USDT** (`pack_price`) to **1,000 USDT**
(`max_pack_price`), one draw per pack, same odds, fees and vault cap. Fixed at launch like everything else
(`get_machine().config`); only machines launched after this change have it. Older machines (including
`gaballs.gaballs.testnet`) keep fixed 10 USDT packs; their contracts cannot be changed.

What a single pack does on a **fresh** machine (V = 3,000 USDT, curve 800M, vault 100M, cap 25%). Reproduce with the
`quote_pack_amount` view, or the one-liner below.

| Pack | Tokens bought | Price impact | Best case (Mythic) | Effective best multiplier |
| --- | --- | --- | --- | --- |
| 10 USDT | 2.64M | +0.7% | 21.1M | 8.00× |
| 50 USDT | 13.0M | +3.3% | 38.0M | 2.92× (vault cap) |
| 200 USDT | 49.7M | +13.7% | 74.7M | 1.50× (vault cap) |
| 500 USDT | 113.6M | +35.8% | 138.6M | 1.22× (vault cap) |
| 1,000 USDT | 198.9M | +77.2% | 224.0M | 1.13× (vault cap) |

In plain words: the vault cap protects the prize pool, so on a young machine a big pack mostly buys the coin and
moves its price; the big multipliers only become reachable for big packs once the vault has grown (every Common
adds to it). The machine page shows the exact "Best case" for the chosen size and says when the cap applies.

```bash
python -c "V=3000e6;T=800e6;vault=100e6
for a in [10,50,200,500,1000]:
  u=a*1e6*0.993; b=T-V*T/(V+u); mx=b+min(7*b,0.25*vault); print(a, round(b/1e6,2), round(mx/b,2))"
```
