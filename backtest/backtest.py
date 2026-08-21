#!/usr/bin/env python3
"""
Backtest the Quantum Flow engine on real data.

    python3 backtest.py --binance BTCUSDT --interval 1d
    python3 backtest.py --yahoo THYAO.IS --interval 1d --long-only
    python3 backtest.py --csv XU100_daily.csv --preset bist_daily --modes

Data sources
    --binance SYM   Binance public klines (BTCUSDT, ETHUSDT, ...)
    --yahoo   SYM   Yahoo Finance (THYAO.IS, XU100.IS, ASELS.IS, BTC-USD, ...)
    --csv     PATH  any CSV with open/high/low/close[/volume] columns,
                    including a TradingView chart export

The engine is online: at bar t its memory only holds patterns whose outcome was
already known at t. There is no fitting pass, so everything after the warm-up is
walk-forward out-of-sample by construction. `selftest.py` proves that formally.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
import urllib.request

import numpy as np

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import qfp  # noqa: E402

UA = {"User-Agent": "Mozilla/5.0 (compatible; qfp-backtest/1.0)"}


# ------------------------------------------------------------------ loaders
def _get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()


def load_binance(symbol, interval, bars=3000):
    out, end = [], None
    while len(out) < bars:
        url = (f"https://api.binance.com/api/v3/klines?symbol={symbol.upper()}"
               f"&interval={interval}&limit=1000")
        if end:
            url += f"&endTime={end}"
        chunk = json.loads(_get(url))
        if not chunk:
            break
        out = chunk + out
        end = chunk[0][0] - 1
        if len(chunk) < 1000:
            break
    out = out[-bars:]
    a = np.array([[float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in out])
    ts = [r[0] for r in out]
    return a[:, 0], a[:, 1], a[:, 2], a[:, 3], a[:, 4], ts


def load_yahoo(symbol, interval, rng="10y"):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?range={rng}&interval={interval}")
    j = json.loads(_get(url))["chart"]["result"][0]
    q = j["indicators"]["quote"][0]
    ts = j["timestamp"]
    cols = [np.array([np.nan if x is None else float(x) for x in q[k]])
            for k in ("open", "high", "low", "close", "volume")]
    ok = ~np.isnan(cols[3])
    ts = [t for t, k in zip(ts, ok) if k]
    return (*[c[ok] for c in cols], ts)


def load_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise SystemExit(f"{path}: no rows")
    keys = {k.strip().lower(): k for k in rows[0]}

    def col(*names, required=True):
        for n in names:
            if n in keys:
                return np.array([float(r[keys[n]] or "nan") for r in rows])
        if required:
            raise SystemExit(f"{path}: missing column {names[0]!r} (have {list(keys)})")
        return None

    o, h, l, c = col("open"), col("high"), col("low"), col("close", "close/last", "adj close")
    v = col("volume", "vol", required=False)
    tkey = keys.get("time") or keys.get("date") or keys.get("datetime")
    ts = [r[tkey] for r in rows] if tkey else list(range(len(rows)))
    ok = ~np.isnan(c)
    return o[ok], h[ok], l[ok], c[ok], (v[ok] if v is not None else None), \
        [t for t, k in zip(ts, ok) if k]


# ------------------------------------------------------------------ metrics
def max_drawdown(eq):
    peak = np.maximum.accumulate(eq)
    return float((eq / peak - 1.0).min())


def backtest(c, res, cost_bps=10.0, long_only=False, warm=0):
    """Position taken at bar t is applied from bar t+1: no same-bar fills."""
    n = len(c)
    pos = res.pos.astype(float).copy()
    if long_only:
        pos[pos < 0] = 0.0
    eff = np.concatenate(([0.0], pos[:-1]))
    eff[:warm] = 0.0

    ret = np.zeros(n)
    ret[1:] = c[1:] / c[:-1] - 1.0
    gross = eff * ret
    turn = np.abs(np.diff(np.concatenate(([0.0], eff))))
    net = gross - turn * cost_bps / 10_000.0

    eq = np.cumprod(1.0 + net)
    bh = c / c[warm] if warm < n else c / c[0]

    # per-signal outcome, measured the same way the on-chart dashboard does
    horizon = 5
    rs = []
    for t in np.flatnonzero(res.signal != 0):
        if t < warm or t + horizon >= n:
            continue
        d = res.signal[t]
        if long_only and d < 0:
            continue
        rs.append(d * (c[t + horizon] - c[t]) / max(res.atr[t], 1e-9))
    rs = np.array(rs) if rs else np.array([0.0])

    # round-trip trades from the position series
    trades, entry = [], None
    for t in range(1, n):
        if eff[t] != eff[t - 1]:
            if entry is not None and eff[t - 1] != 0:
                trades.append(eff[t - 1] * (c[t] / c[entry] - 1.0) - 2 * cost_bps / 10_000)
            entry = t if eff[t] != 0 else None
    trades = np.array(trades) if trades else np.array([])

    wins = trades[trades > 0]
    lose = trades[trades <= 0]
    years = max((n - warm) / 252.0, 1e-9)
    return dict(
        bars=n - warm,
        signals=int((res.signal[warm:] != 0).sum()),
        exposure=float((eff[warm:] != 0).mean() * 100),
        hit_rate=float((rs > 0).mean() * 100),
        avg_R=float(rs.mean()),
        trades=len(trades),
        trade_win=float(len(wins) / len(trades) * 100) if len(trades) else float("nan"),
        profit_factor=float(wins.sum() / abs(lose.sum())) if len(lose) and lose.sum() else float("inf"),
        total_return=float(eq[-1] - 1) * 100,
        cagr=float(eq[-1] ** (1 / years) - 1) * 100,
        max_dd=max_drawdown(eq) * 100,
        bh_return=float(bh[-1] - 1) * 100,
        bh_dd=max_drawdown(bh) * 100,
        equity=eq,
    )


def report(name, m):
    print(f"\n=== {name} ===")
    print(f"  bars {m['bars']}   signals {m['signals']}   round trips {m['trades']}   "
          f"time in market {m['exposure']:.0f}%")
    print(f"  signal hit rate (5 bars) {m['hit_rate']:.1f}%   avg result {m['avg_R']:+.2f} ATR")
    print(f"  trade win rate {m['trade_win']:.1f}%   profit factor {m['profit_factor']:.2f}")
    print(f"  strategy  return {m['total_return']:+.1f}%   CAGR {m['cagr']:+.1f}%   max DD {m['max_dd']:.1f}%")
    print(f"  buy&hold  return {m['bh_return']:+.1f}%                    max DD {m['bh_dd']:.1f}%")


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--binance", metavar="SYMBOL")
    src.add_argument("--yahoo", metavar="SYMBOL")
    src.add_argument("--csv", metavar="PATH")
    ap.add_argument("--interval", default="1d")
    ap.add_argument("--bars", type=int, default=3000)
    ap.add_argument("--range", default="10y", help="Yahoo range, e.g. 5y / 10y / max")
    ap.add_argument("--preset", default="crypto_daily",
                    choices=["bist_daily", "bist_weekly", "crypto_daily", "crypto_intraday"])
    ap.add_argument("--mode", default="balanced", choices=["early", "balanced", "conservative"])
    ap.add_argument("--modes", action="store_true", help="compare all three signal modes")
    ap.add_argument("--cost-bps", type=float, default=10.0, help="round-trip cost per side, bps")
    ap.add_argument("--long-only", action="store_true", help="no shorts (BIST cash accounts)")
    ap.add_argument("--no-volume", action="store_true")
    a = ap.parse_args()

    if a.binance:
        o, h, l, c, v, ts = load_binance(a.binance, a.interval, a.bars)
        label = f"{a.binance} {a.interval}"
    elif a.yahoo:
        o, h, l, c, v, ts = load_yahoo(a.yahoo, a.interval, a.range)
        label = f"{a.yahoo} {a.interval}"
    else:
        o, h, l, c, v, ts = load_csv(a.csv)
        label = a.csv
    if a.no_volume:
        v = None

    print(f"loaded {len(c)} bars of {label}   {ts[0]} -> {ts[-1]}")
    modes = ["early", "balanced", "conservative"] if a.modes else [a.mode]
    for mode in modes:
        p = qfp.Params.preset(a.preset).with_mode(mode)
        res = qfp.run(o, h, l, c, v, p)
        warm = int(np.argmax(res.solved)) if res.solved.any() else len(c)
        m = backtest(c, res, cost_bps=a.cost_bps, long_only=a.long_only, warm=warm)
        report(f"{label} | {a.preset} | {mode}" + (" | long-only" if a.long_only else ""), m)
    print("\nNote: costs are modelled per side; slippage on illiquid BIST names is often larger.")


if __name__ == "__main__":
    main()
