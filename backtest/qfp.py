"""
Faithful Python port of indicators/quantum_flow_predictor.pine.

The point of this file is validation: Pine cannot be unit tested, so the exact
same bar-by-bar logic lives here where it can be fed real or synthetic data and
checked for look-ahead leakage.

Every value at bar t is computed from bars <= t only. `selftest.py` proves it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

NF = 6          # features per slice
MOM_N = 5       # momentum lookback
CRV_N = 3       # curvature step


# --------------------------------------------------------------------------
# Pine `ta.*` equivalents
# --------------------------------------------------------------------------
def ema(x: np.ndarray, length: int) -> np.ndarray:
    a = 2.0 / (length + 1.0)
    out = np.empty_like(x, dtype=float)
    acc = x[0]
    for i, v in enumerate(x):
        acc = v if i == 0 else a * v + (1 - a) * acc
        out[i] = acc
    return out


def rma(x: np.ndarray, length: int) -> np.ndarray:
    a = 1.0 / length
    out = np.empty_like(x, dtype=float)
    acc = float(np.mean(x[:length])) if len(x) >= length else float(x[0])
    for i, v in enumerate(x):
        if i < length:
            acc = float(np.mean(x[: i + 1]))
        else:
            acc = a * v + (1 - a) * acc
        out[i] = acc
    return out


def sma(x: np.ndarray, length: int) -> np.ndarray:
    out = np.empty_like(x, dtype=float)
    csum = np.cumsum(np.insert(x, 0, 0.0))
    for i in range(len(x)):
        lo = max(0, i - length + 1)
        out[i] = (csum[i + 1] - csum[lo]) / (i + 1 - lo)
    return out


def stdev(x: np.ndarray, length: int) -> np.ndarray:
    out = np.zeros_like(x, dtype=float)
    for i in range(len(x)):
        lo = max(0, i - length + 1)
        out[i] = float(np.std(x[lo : i + 1]))
    return out


def atr(high, low, close, length=14):
    prev = np.concatenate(([close[0]], close[:-1]))
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev), np.abs(low - prev)))
    return rma(tr, length)


def rsi(close, length=14):
    d = np.diff(close, prepend=close[0])
    up = rma(np.maximum(d, 0.0), length)
    dn = rma(np.maximum(-d, 0.0), length)
    rs = np.where(dn == 0, np.inf, up / np.where(dn == 0, 1.0, dn))
    return np.where(dn == 0, 100.0, 100.0 - 100.0 / (1.0 + rs))


# --------------------------------------------------------------------------
@dataclass
class Params:
    length: int = 24
    slices: int = 4
    mem: int = 260
    k: int = 28
    hz: int = 2
    kernel: float = 1.0
    recency: float = 0.6
    tdecay: float = 0.7
    weights: tuple = (1.0, 1.0, 0.8, 1.0, 1.2, 0.6)

    thr_edge: float = 0.22
    thr_coh: float = 0.32
    thr_move: float = 0.20
    adaptive: bool = True
    need_curv: bool = True
    cool: int = 2
    cloud_sm: int = 2
    use_ign: bool = True
    ign_thr: float = 1.25
    ign_edge: float = 0.08
    ign_coh_frac: float = 0.60

    @staticmethod
    def preset(name: str) -> "Params":
        core = {
            "bist_daily":      dict(length=24, slices=4, mem=260, k=28, hz=2, kernel=1.0, recency=0.6),
            "bist_weekly":     dict(length=16, slices=3, mem=160, k=18, hz=2, kernel=1.2, recency=0.4),
            "crypto_daily":    dict(length=28, slices=4, mem=320, k=32, hz=2, kernel=1.0, recency=0.8),
            "crypto_intraday": dict(length=32, slices=4, mem=420, k=40, hz=3, kernel=0.9, recency=1.0),
        }[name]
        return Params(**core)

    def with_mode(self, mode: str) -> "Params":
        packs = {
            "early":        dict(thr_edge=0.13, thr_coh=0.22, thr_move=0.10, cool=1,
                                 need_curv=False, use_ign=True, ign_thr=0.85),
            "balanced":     dict(thr_edge=0.20, thr_coh=0.34, thr_move=0.18, cool=2,
                                 need_curv=True, use_ign=True, ign_thr=1.05),
            "conservative": dict(thr_edge=0.30, thr_coh=0.48, thr_move=0.30, cool=4,
                                 need_curv=True, use_ign=False, ign_thr=1.40),
        }[mode]
        p = Params(**{**self.__dict__})
        for kk, vv in packs.items():
            setattr(p, kk, vv)
        return p


@dataclass
class Result:
    p_up: np.ndarray
    coherence: np.ndarray
    edge: np.ndarray
    med: np.ndarray            # smoothed median forecast, ATR units
    conv: np.ndarray           # smoothed conviction
    q05: np.ndarray
    q95: np.ndarray
    solved: np.ndarray
    signal: np.ndarray         # +1 new long, -1 new short, 0 nothing
    flat: np.ndarray           # True where the state machine stood aside
    pos: np.ndarray            # position state after the bar
    atr: np.ndarray
    features: np.ndarray = field(default=None)


def _clamp(x):
    if not np.isfinite(x):
        return 0.0
    return max(-4.0, min(4.0, x))


def build_features(o, h, l, c, v) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = len(c)
    px = np.maximum(c, 1e-10)
    atr_r = atr(h, l, c, 14)
    atrp = np.maximum(atr_r / px, 1e-5)

    prev = np.concatenate(([c[0]], c[:-1]))
    lr = np.log(px / np.maximum(prev, 1e-10))
    rsi_v = rsi(c, 14)
    ema_f, ema_s, sm_p = ema(c, 8), ema(c, 21), ema(c, 5)

    has_vol = v is not None and np.nanstd(v) > 0
    if has_vol:
        vol_a, vol_d = sma(v, 20), stdev(v, 20)

    F = np.zeros((n, NF))
    for t in range(n):
        cm = c[t - MOM_N] if t >= MOM_N else c[t]
        s1 = sm_p[t - CRV_N] if t >= CRV_N else sm_p[t]
        s2 = sm_p[t - 2 * CRV_N] if t >= 2 * CRV_N else sm_p[t]
        rng = max(h[t] - l[t], 1e-10)

        F[t, 0] = _clamp(lr[t] / atrp[t])
        F[t, 1] = _clamp((c[t] - cm) / px[t] / (atrp[t] * math.sqrt(MOM_N)))
        F[t, 2] = _clamp((rsi_v[t] - 50.0) / 25.0)
        F[t, 3] = _clamp((ema_f[t] - ema_s[t]) / px[t] / atrp[t])
        F[t, 4] = _clamp((sm_p[t] - 2.0 * s1 + s2) / px[t] / atrp[t])
        if has_vol and vol_d[t] > 0:
            F[t, 5] = _clamp((v[t] - vol_a[t]) / vol_d[t] * (1.0 if lr[t] >= 0 else -1.0))
        else:
            F[t, 5] = _clamp(((c[t] - l[t]) - (h[t] - c[t])) / rng * 2.0)
    return F, atrp, atr_r


def _zlema(x: np.ndarray, length: int) -> np.ndarray:
    if length <= 1:
        return x.copy()
    lag = max((length - 1) // 2, 0)
    de = np.array([x[t] + (x[t] - x[max(t - lag, 0)]) for t in range(len(x))])
    return ema(de, length)


def run(o, h, l, c, v, p: Params) -> Result:
    n = len(c)
    F, atrp, atr_r = build_features(o, h, l, c, v)
    dims = p.slices * NF

    # per-dimension weights: feature weight x slice time-decay ("light cone")
    dw = np.zeros(dims)
    den_s = max(p.slices - 1, 1)
    for s in range(p.slices):
        tw = math.exp(-p.tdecay * s / den_s)
        for j in range(NF):
            dw[s * NF + j] = max(tw * p.weights[j], 0.0)
    if dw.sum() > 0:
        dw *= dims / dw.sum()

    # geometric spacing: the recent past is resolved finely, the distant past coarsely
    lags = np.array([int(round((p.length - 1) * (s / den_s) ** 1.6)) for s in range(p.slices)])

    MEM = np.zeros((p.mem, dims))
    OUT = np.zeros(p.mem)
    MBAR = np.zeros(p.mem, dtype=int)
    cnt, wp = 0, 0

    p_up = np.full(n, np.nan)
    coh = np.full(n, np.nan)
    edge = np.full(n, np.nan)
    med = np.full(n, np.nan)
    q05 = np.full(n, np.nan)
    q95 = np.full(n, np.nan)
    conv_raw = np.zeros(n)
    solved = np.zeros(n, dtype=bool)

    warm_from = p.length + p.hz + 40

    def vec(t, off):
        out = np.zeros(dims)
        for s in range(p.slices):
            src = t - lags[s] - off
            if src < 0:
                src = 0
            out[s * NF : s * NF + NF] = F[src]
        return out

    for t in range(n):
        warm = t > warm_from
        if warm and cnt >= max(p.k, 20):
            q = vec(t, 0)
            M = MEM[:cnt]
            d = np.sqrt((((q - M) ** 2) * dw).sum(axis=1))
            useK = min(p.k, cnt)
            idx = np.argpartition(d, useK - 1)[:useK]
            idx = idx[np.argsort(d[idx])]
            dk = max(d[idx[-1]], 1e-6)
            band = max(p.kernel * dk, 1e-6)

            age = t - MBAR[idx]
            rw = np.exp(-p.recency * age / max(p.mem, 1))
            r = d[idx] / band
            w = np.exp(-r * r) * rw
            ys = OUT[idx]

            sw = max(w.sum(), 1e-9)
            pu = float(w[ys > 0].sum() / sw)
            mu = float((ys * w).sum() / sw)
            sd = math.sqrt(max(float((w * (ys - mu) ** 2).sum() / sw), 0.0))

            order = np.argsort(ys)
            cw = np.cumsum(w[order])
            ysort = ys[order]

            def wq(qq):
                tgt = sw * qq
                j = int(np.searchsorted(cw, tgt, side="left"))
                return float(ysort[min(j, len(ysort) - 1)])

            pc = min(max(pu, 1e-6), 1 - 1e-6)
            H = -(pc * math.log(pc) + (1 - pc) * math.log(1 - pc)) / math.log(2.0)
            # binary entropy is almost flat around p=0.5, so take its root to get a
            # usable 0..1 scale instead of values permanently pinned near zero
            coh_d = math.sqrt(max(1.0 - H, 0.0))
            # Kish effective sample size -> t-statistic of the weighted mean
            n_eff = (sw * sw) / max(float((w * w).sum()), 1e-12)
            tstat = abs(mu) * math.sqrt(n_eff) / max(sd, 1e-9)
            coh_t = tstat / (tstat + 1.5)

            p_up[t] = pu
            coh[t] = min(1.0, max(0.0, 0.5 * coh_d + 0.5 * coh_t))
            edge[t] = 2.0 * pu - 1.0
            med[t] = wq(0.50)
            q05[t] = wq(0.05)
            q95[t] = wq(0.95)
            conv_raw[t] = edge[t] * coh[t]
            solved[t] = True
        else:
            conv_raw[t] = conv_raw[t - 1] if t > 0 else 0.0

        # ---- learn: store the pattern whose outcome is now known (no leakage:
        #      the label uses close[t] against close[t-hz], both already past)
        if warm and t - p.hz - lags[-1] >= 0:
            pv = vec(t, p.hz)
            ref = max(c[t - p.hz], 1e-10)
            ap = max(atrp[t - p.hz], 1e-5)
            yv = max(-8.0, min(8.0, math.log(max(c[t], 1e-10) / ref) / ap))
            if cnt < p.mem:
                MEM[cnt], OUT[cnt], MBAR[cnt] = pv, yv, t
                cnt += 1
            else:
                MEM[wp], OUT[wp], MBAR[wp] = pv, yv, t
                wp = (wp + 1) % p.mem

    med_s = _zlema(np.nan_to_num(med), p.cloud_sm)
    conv_s = _zlema(conv_raw, p.cloud_sm)
    edge0 = np.nan_to_num(edge)
    edge_sd = stdev(edge0, 150)

    signal = np.zeros(n, dtype=int)
    flat = np.zeros(n, dtype=bool)
    pos_arr = np.zeros(n, dtype=int)
    pos, last_sig = 0, -10_000

    for t in range(n):
        if solved[t]:
            a_edge = max(p.thr_edge, edge_sd[t] * 0.9) if p.adaptive else p.thr_edge
            long_ok = (edge0[t] >= a_edge and coh[t] >= p.thr_coh and med_s[t] >= p.thr_move
                       and (not p.need_curv or F[t, 4] > -0.10))
            short_ok = (edge0[t] <= -a_edge and coh[t] >= p.thr_coh and med_s[t] <= -p.thr_move
                        and (not p.need_curv or F[t, 4] < 0.10))
            # Momentum ignition: acceleration leads velocity leads price, so a
            # strong thrust can open a trade before the memory has analogues for
            # a brand-new regime. The cloud still holds a veto.
            thrust = 0.5 * F[t, 0] + 0.3 * F[t, 1] + 0.2 * F[t, 4]
            if p.use_ign:
                ign_coh = coh[t] >= p.thr_coh * p.ign_coh_frac
                if (thrust >= p.ign_thr and F[t, 3] > 0
                        and edge0[t] >= p.ign_edge and ign_coh):
                    long_ok = True
                if (thrust <= -p.ign_thr and F[t, 3] < 0
                        and edge0[t] <= -p.ign_edge and ign_coh):
                    short_ok = True

            cooled = t - last_sig >= p.cool
            if long_ok and pos <= 0 and cooled:
                pos, last_sig, signal[t] = 1, t, 1
            elif short_ok and pos >= 0 and cooled:
                pos, last_sig, signal[t] = -1, t, -1
            elif pos != 0:
                gone = (coh[t] < p.thr_coh * 0.45
                        or (pos == 1 and conv_s[t] < 0)
                        or (pos == -1 and conv_s[t] > 0))
                if gone:
                    pos, flat[t] = 0, True
        pos_arr[t] = pos

    return Result(p_up=p_up, coherence=coh, edge=edge, med=med_s, conv=conv_s,
                  q05=q05, q95=q95, solved=solved, signal=signal, flat=flat,
                  pos=pos_arr, atr=atr_r, features=F)
