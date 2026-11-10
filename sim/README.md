# sim — economics simulation

Simulates the CLAUDE.md §2 economics (curve, odds, vault, cap, fees) for 10,000 packs, 3 parameter settings x
3 buyer behaviours, 200 random runs each. Asserts after every pack that total token supply stays at 1B.

1. `python -m venv sim/.venv`
2. `sim/.venv/Scripts/pip install numpy matplotlib` (Windows) or `sim/.venv/bin/pip install numpy matplotlib`
3. `sim/.venv/Scripts/python sim/simulate.py` — takes ~1 minute, prints the summary JSON.
4. See `sim/out/price.png`, `vault.png`, `capped.png`, `multiplier.png` and `summary.json`.

The random seed is fixed (`20261110`), so the output is identical on every run.
Results and the recommendation: [../docs/PARAMETERS.md](../docs/PARAMETERS.md).
