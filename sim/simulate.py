"""Gaballs Phase 0 economics simulation (CLAUDE.md section 2).

Simulates 10,000 packs for 3 parameter settings x 3 buyer behaviours, RUNS times each
with different random seeds, and writes PNG charts + a JSON summary to sim/out/.

Run:  sim/.venv/Scripts/python sim/simulate.py      (Windows)
      sim/.venv/bin/python sim/simulate.py          (macOS/Linux)
"""
import json
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ---- fixed economics (CLAUDE.md section 2) -------------------------------------------------
SUPPLY = 1_000_000_000.0
CREATOR_ALLOCATION = 100_000_000.0  # max allowed; assumed for every setting (smallest curve)
PACK_PRICE = 10.0                   # USDT
FEE_BPS = 50 + 20                   # Machine NFT + platform, taken before the curve
TIER_BPS = np.array([7_500, 2_000, 400, 100])
TIER_MULT = np.array([0.70, 1.25, 2.50, 8.00])
TIER_NAMES = ["Common", "Rare", "Epic", "Mythic"]
MYTHIC = 3

# ---- what we vary --------------------------------------------------------------------------
SETTINGS = {
    "conservative": dict(V=10_000.0, vault_seed=150_000_000.0, cap_bps=1_500),
    "default":      dict(V=3_000.0,  vault_seed=100_000_000.0, cap_bps=2_500),
    "aggressive":   dict(V=1_000.0,  vault_seed=50_000_000.0,  cap_bps=4_000),
}
BEHAVIOURS = {
    "hold":          dict(sell_frac=0.0, mythic_streak=0),
    "half_sell":     dict(sell_frac=0.5, mythic_streak=0),
    "mythic_streak": dict(sell_frac=0.5, mythic_streak=10),  # worst case: first 10 pulls Mythic + 50% sell
}
BEHAVIOUR_LABEL = {
    "hold": "Everyone holds",
    "half_sell": "50% sell immediately",
    "mythic_streak": "10 Mythics first + 50% sell",
}
PACKS = 10_000
RUNS = 200
OUT = Path(__file__).parent / "out"


def simulate(V, vault_seed, cap_bps, sell_frac, mythic_streak, rng):
    """Vectorised over RUNS independent runs. Returns per-pack series and per-run totals."""
    n = RUNS
    T = np.full(n, SUPPLY - vault_seed - CREATOR_ALLOCATION)  # tokens on curve
    R = np.zeros(n)                                            # real USDT reserve
    vault = np.full(n, vault_seed)
    held = np.zeros(n)                                         # tokens in buyers' wallets
    u = PACK_PRICE * (1 - FEE_BPS / 10_000)
    cum_bps = np.cumsum(TIER_BPS)

    price = np.empty((PACKS, n))
    vault_hist = np.empty((PACKS, n))
    sum_bought = np.zeros(n); sum_payout = np.zeros(n)
    capped = np.zeros(n); wins = np.zeros(n)
    sells = np.zeros(n); sells_rejected = np.zeros(n); sell_return = np.zeros(n)

    for i in range(PACKS):
        # buy on the curve
        k = V + R
        bought = T - k * T / (k + u)
        R += u
        T -= bought

        # roll the tier
        if i < mythic_streak:
            tier = np.full(n, MYTHIC)
        else:
            tier = np.searchsorted(cum_bps, rng.integers(0, 10_000, n), side="right")
        m = TIER_MULT[tier]

        # settle against the vault
        payout = bought * m
        loss = m < 1
        vault[loss] += bought[loss] - payout[loss]
        win = ~loss
        extra = payout - bought
        limit = vault * cap_bps / 10_000
        is_capped = win & (extra > limit)
        draw = np.where(win, np.minimum(extra, limit), 0.0)
        vault -= draw
        payout = np.where(win, bought + draw, payout)

        sum_bought += bought; sum_payout += payout
        wins += win; capped += is_capped
        held += payout

        # some buyers sell their whole payout back immediately
        if sell_frac > 0:
            seller = rng.random(n) < sell_frac
            k = V + R
            out = k - k * T / (T + payout)
            ok = seller & (out <= R)          # contract rejects a sell that would exceed R
            sells += seller; sells_rejected += seller & ~ok
            R = np.where(ok, R - out, R)
            T = np.where(ok, T + payout, T)
            held = np.where(ok, held - payout, held)
            sell_return += np.where(ok, out * (1 - FEE_BPS / 10_000) / PACK_PRICE, 0.0)

        # invariant: supply is conserved
        total = T + vault + held + CREATOR_ALLOCATION
        assert np.allclose(total, SUPPLY, rtol=1e-9), "token supply drifted"
        assert (R >= -1e-6).all() and (vault >= 0).all()

        price[i] = (V + R) / T
        vault_hist[i] = vault

    accepted = np.maximum(sells - sells_rejected, 1)
    return dict(
        price=price, vault=vault_hist,
        realized_mult=sum_payout / sum_bought,
        capped_pct=capped / PACKS * 100,
        capped_of_wins_pct=capped / np.maximum(wins, 1) * 100,
        sell_rejected_pct=np.where(sells > 0, sells_rejected / np.maximum(sells, 1) * 100, 0.0),
        avg_sell_return=np.where(sells > 0, sell_return / accepted, np.nan),
        final_R=R, final_T=T, final_vault=vault,
        final_price=(V + R) / T,
        min_vault=vault_hist.min(axis=0),
    )


# ---- charts --------------------------------------------------------------------------------
INK, INK2, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#8a8984", "#e6e5e0", "#fcfcfb"
SERIES = {"hold": "#2a78d6", "half_sell": "#eb6834", "mythic_streak": "#1baf7a"}


def style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def band_chart(results, key, fname, title, ylabel, scale=1.0, logy=False, zoom=None):
    rows = 2 if zoom else 1
    fig, axes = plt.subplots(rows, 3, figsize=(15, 4.6 * rows), facecolor=SURFACE, squeeze=False,
                             sharey="row" if logy else False)
    for c, sname in enumerate(SETTINGS):
        for r in range(rows):
            ax = axes[r][c]; style(ax)
            last = PACKS if r == 0 else zoom
            x = np.arange(1, last + 1)
            for b in BEHAVIOURS:
                d = results[sname][b][key][:last] * scale
                med = np.median(d, axis=1)
                lo, hi = np.percentile(d, [5, 95], axis=1)
                ax.fill_between(x, lo, hi, color=SERIES[b], alpha=0.15, linewidth=0)
                ax.plot(x, med, color=SERIES[b], linewidth=2, label=BEHAVIOUR_LABEL[b],
                        linestyle=(0, (4, 3)) if b == "mythic_streak" else "-")
            if logy:
                ax.set_yscale("log")
            p = SETTINGS[sname]
            sub = f"{sname}: V={p['V']:,.0f} USDT, seed={p['vault_seed']/1e6:.0f}M, cap={p['cap_bps']/100:.0f}%"
            ax.set_title(sub if r == 0 else f"{sname}: first {zoom} packs", color=INK, fontsize=10, loc="left")
            ax.set_xlabel("packs opened", color=INK2, fontsize=9)
            if c == 0:
                ax.set_ylabel(ylabel, color=INK2, fontsize=9)
    h, l = axes[0][0].get_legend_handles_labels()
    fig.legend(h, l, loc="upper right", ncol=3, frameon=False, fontsize=9, labelcolor=INK)
    fig.suptitle(title + "   (line = median of %d runs, band = 5th–95th percentile)" % RUNS,
                 x=0.01, ha="left", color=INK, fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(OUT / fname, dpi=110)
    plt.close(fig)


def bar_chart(results, key, fname, title, ylabel, ref=None, ref_label=None, fmt="{:.1f}"):
    fig, ax = plt.subplots(figsize=(11, 4.8), facecolor=SURFACE); style(ax)
    ax.grid(axis="x", visible=False)
    w = 0.26
    for j, b in enumerate(BEHAVIOURS):
        xs, meds, errs = [], [], [[], []]
        for c, sname in enumerate(SETTINGS):
            d = results[sname][b][key]
            med = np.median(d); lo, hi = np.percentile(d, [5, 95])
            xs.append(c + (j - 1) * w); meds.append(med)
            errs[0].append(med - lo); errs[1].append(hi - med)
        bars = ax.bar(xs, meds, w - 0.03, color=SERIES[b], label=BEHAVIOUR_LABEL[b],
                      yerr=errs, ecolor=INK2, capsize=3, error_kw=dict(linewidth=1))
        for x, v, e in zip(xs, meds, errs[1]):
            ax.text(x, v + e, fmt.format(v), ha="center", va="bottom", fontsize=8, color=INK)
    if ref is not None:
        ax.axhline(ref, color=MUTED, linestyle="--", linewidth=1)
        ax.text(-0.45, ref * 0.97, ref_label, va="top", ha="left", fontsize=8, color=INK2,
                bbox=dict(facecolor=SURFACE, edgecolor="none", pad=1))
    ax.set_xticks(range(3))
    ax.set_xticklabels([f"{s}\nV={SETTINGS[s]['V']:,.0f}, seed={SETTINGS[s]['vault_seed']/1e6:.0f}M, "
                        f"cap={SETTINGS[s]['cap_bps']/100:.0f}%" for s in SETTINGS], color=INK, fontsize=9)
    ax.set_ylabel(ylabel, color=INK2, fontsize=9)
    ax.legend(frameon=False, fontsize=9, ncol=3, loc="upper left", bbox_to_anchor=(0, 1.12))
    ax.set_title(title + f"   (bar = median of {RUNS} runs, whisker = 5th–95th pct)",
                 color=INK, fontsize=11, loc="left", pad=28)
    fig.tight_layout()
    fig.savefig(OUT / fname, dpi=110)
    plt.close(fig)


def main():
    OUT.mkdir(exist_ok=True)
    rng = np.random.default_rng(20261110)
    results = {s: {b: simulate(**SETTINGS[s], **BEHAVIOURS[b], rng=rng) for b in BEHAVIOURS} for s in SETTINGS}

    # sanity: odds over all random rolls of the "hold" runs should match the table
    summary = {"packs": PACKS, "runs": RUNS, "creator_allocation": CREATOR_ALLOCATION,
               "expected_multiplier": float((TIER_BPS * TIER_MULT).sum() / 10_000), "settings": {}}
    for s, p in SETTINGS.items():
        start_price = p["V"] / (SUPPLY - p["vault_seed"] - CREATOR_ALLOCATION)
        summary["settings"][s] = {"params": p, "start_price": start_price, "behaviours": {}}
        for b in BEHAVIOURS:
            r = results[s][b]
            med = lambda a: float(np.nanmedian(a))
            summary["settings"][s]["behaviours"][b] = {
                "realized_mult_median": med(r["realized_mult"]),
                "realized_mult_p5": float(np.percentile(r["realized_mult"], 5)),
                "realized_mult_p95": float(np.percentile(r["realized_mult"], 95)),
                "capped_pct_median": med(r["capped_pct"]),
                "capped_pct_max": float(r["capped_pct"].max()),
                "capped_of_wins_pct_median": med(r["capped_of_wins_pct"]),
                "sell_rejected_pct_median": med(r["sell_rejected_pct"]),
                "avg_sell_return_median": med(r["avg_sell_return"]) if BEHAVIOURS[b]["sell_frac"] else None,
                "final_price_median": med(r["final_price"]),
                "price_growth_x": med(r["final_price"]) / start_price,
                "final_R_median": med(r["final_R"]),
                "final_curve_tokens_median": med(r["final_T"]),
                "final_vault_median": med(r["final_vault"]),
                "min_vault_median": med(r["min_vault"]),
                "min_vault_p5": float(np.percentile(r["min_vault"], 5)),
                "min_vault_as_pct_of_seed_p5": float(np.percentile(r["min_vault"], 5)) / p["vault_seed"] * 100,
            }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))

    band_chart(results, "price", "price.png", "Token price (USDT per token, log scale)", "USDT per token", logy=True)
    band_chart(results, "vault", "vault.png", "Prize vault balance (million tokens)", "million tokens",
               scale=1e-6, zoom=300)
    bar_chart(results, "capped_pct", "capped.png", "% of all pulls whose prize was capped by the vault limit",
              "% of pulls", fmt="{:.2f}%")
    bar_chart(results, "realized_mult", "multiplier.png", "Realized average multiplier (tokens paid / tokens bought)",
              "multiplier", ref=0.955, ref_label="odds-table expectation 0.955", fmt="{:.3f}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
