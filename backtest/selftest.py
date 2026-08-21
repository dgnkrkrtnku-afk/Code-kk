"""
Validation suite for the Quantum Flow engine.

1. leakage    - values at bar t must not change when the series is truncated at t.
2. randomwalk - on a driftless random walk the engine must land near 50% hit
                rate. Materially above that would mean the labels leak.
3. learnable  - on a synthetic series that genuinely contains a repeating
                pattern the engine must beat 50%, otherwise it learns nothing.
"""
import math
import sys

import numpy as np

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import qfp  # noqa: E402


def ohlc_from_close(c, rng, noise=0.004):
    h = c * (1 + np.abs(rng.normal(0, noise, len(c))))
    l = c * (1 - np.abs(rng.normal(0, noise, len(c))))
    o = np.concatenate(([c[0]], c[:-1]))
    v = np.abs(rng.normal(1e6, 2e5, len(c)))
    return o, np.maximum(h, np.maximum(o, c)), np.minimum(l, np.minimum(o, c)), c, v


def random_walk(n, seed, sigma=0.02):
    rng = np.random.default_rng(seed)
    c = 100 * np.exp(np.cumsum(rng.normal(0, sigma, n)))
    return ohlc_from_close(c, rng)


def learnable_series(n, seed, sigma=0.012, strength=0.9):
    """Momentum with a deterministic 'two down days -> up day' rule buried in noise."""
    rng = np.random.default_rng(seed)
    r = rng.normal(0, sigma, n)
    for t in range(3, n):
        if r[t - 1] < 0 and r[t - 2] < 0:
            r[t] = abs(r[t]) * strength + sigma * 0.6
    c = 100 * np.exp(np.cumsum(r))
    return ohlc_from_close(c, rng)


def hit_rate(res, c, horizon=5):
    """Score each signal exactly like the Pine dashboard does."""
    n = len(c)
    rs = []
    for t in np.flatnonzero(res.signal != 0):
        if t + horizon >= n:
            continue
        rs.append(res.signal[t] * (c[t + horizon] - c[t]) / max(res.atr[t], 1e-9))
    if not rs:
        return 0, float("nan"), float("nan")
    rs = np.array(rs)
    return len(rs), float((rs > 0).mean() * 100), float(rs.mean())


def test_leakage():
    o, h, l, c, v = random_walk(900, 7)
    p = qfp.Params.preset("crypto_daily").with_mode("balanced")
    full = qfp.run(o, h, l, c, None, p)
    worst = 0.0
    checked = 0
    for t in (400, 520, 641, 733, 850):
        cut = qfp.run(o[: t + 1], h[: t + 1], l[: t + 1], c[: t + 1], None, p)
        for name in ("edge", "coherence", "med", "conv"):
            a = getattr(full, name)[t]
            b = getattr(cut, name)[t]
            if np.isnan(a) and np.isnan(b):
                continue
            worst = max(worst, abs(np.nan_to_num(a) - np.nan_to_num(b)))
        assert full.signal[t] == cut.signal[t], f"signal差 at t={t}"
        checked += 1
    print(f"[leakage]   {checked} cut-points, max |full-truncated| = {worst:.3e}")
    assert worst < 1e-9, "look-ahead leakage detected"
    return True


def test_random_walk():
    """No edge exists in noise, so the engine must not manufacture one."""
    p = qfp.Params.preset("crypto_daily").with_mode("balanced")
    rates, trades = [], 0
    for seed in range(12):
        o, h, l, c, v = random_walk(2500, 100 + seed)
        res = qfp.run(o, h, l, c, None, p)
        nt, wr, _ = hit_rate(res, c, horizon=5)
        if nt >= 10:
            rates.append(wr)
            trades += nt
    m = float(np.mean(rates))
    print(f"[randomwalk] {len(rates)} runs, {trades} signals, mean hit rate = {m:.1f}%")
    assert 42.0 < m < 58.0, f"suspicious edge on noise: {m:.1f}%"
    return True


def test_learnable():
    p = qfp.Params.preset("crypto_daily").with_mode("balanced")
    rates, trades = [], 0
    for seed in range(8):
        o, h, l, c, v = learnable_series(2500, 300 + seed)
        res = qfp.run(o, h, l, c, None, p)
        nt, wr, _ = hit_rate(res, c, horizon=3)
        if nt >= 10:
            rates.append(wr)
            trades += nt
    m = float(np.mean(rates))
    print(f"[learnable]  {len(rates)} runs, {trades} signals, mean hit rate = {m:.1f}%")
    assert m > 55.0, f"engine failed to learn a planted pattern: {m:.1f}%"
    return True


def test_latency_vs_baseline():
    """The old design fired on EMA(EMA(EMA)) crossovers. Measure reaction lag on
    a step change: how many bars until each method flags the new direction."""
    n = 700
    rng = np.random.default_rng(11)
    r = np.concatenate([rng.normal(0, 0.01, n // 2), rng.normal(0.012, 0.01, n // 2)])
    c = 100 * np.exp(np.cumsum(r))
    o, h, l, c, v = ohlc_from_close(c, rng)
    turn = n // 2

    def lag_of(par):
        res = qfp.run(o, h, l, c, None, par)
        a = np.flatnonzero((res.signal == 1) & (np.arange(n) >= turn))
        return int(a[0] - turn) if len(a) else 99

    par = qfp.Params.preset("crypto_daily").with_mode("balanced")
    new_lag = lag_of(par)
    no_ign = qfp.Params(**{**par.__dict__})
    no_ign.use_ign = False
    cloud_only_lag = lag_of(no_ign)

    # baseline: EMA(5) of EMA(3) of EMA(5) crossover, as in the original script
    pred = qfp.ema(np.log(c) - np.log(np.concatenate(([c[0], c[0]], c[:-2]))), 5)
    osc = qfp.ema(pred, 3)
    sig = qfp.ema(osc, 5)
    cross = np.flatnonzero((osc[1:] > sig[1:]) & (osc[:-1] <= sig[:-1]) & (np.arange(n - 1) >= turn))
    old_lag = int(cross[0] + 1 - turn) if len(cross) else -1
    print(f"[latency]    regime shift at bar {turn}: engine +{new_lag} bars, "
          f"cloud-only +{cloud_only_lag} bars, stacked-EMA baseline +{old_lag} bars")
    assert new_lag <= old_lag, "engine reacts slower than the stacked-EMA baseline"
    return True


if __name__ == "__main__":
    ok = True
    for fn in (test_leakage, test_random_walk, test_learnable, test_latency_vs_baseline):
        try:
            fn()
        except AssertionError as e:
            ok = False
            print(f"  FAILED: {e}")
    print("\nRESULT:", "all checks passed" if ok else "FAILURES above")
    sys.exit(0 if ok else 1)
