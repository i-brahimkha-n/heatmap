#!/usr/bin/env python3
"""
HeatMap data pipeline: harmonize MODIS + VIIRS active-fire hotspots.

Input  (NASA FIRMS country archives, one CSV per year; folder names are free,
        sensor is detected from the columns):
    raw/modis/*.csv          MODIS C6.1 (Terra + Aqua)   - any years, e.g. 2000-2025
    raw/viirs-snpp/*.csv     VIIRS S-NPP 375 m           - 2012-2025
    raw/viirs-noaa20/*.csv   VIIRS NOAA-20 375 m         - optional (2018+), cross-check only

Output (static files the web app loads):
    public/data/calendar.json        monthly hotspot counts per 0.1 degree cell, per sensor,
                                     plus the harmonized (VIIRS-equivalent) count `h`
    public/data/harmonization.json   method, ratios, validation scores, yearly totals
    public/data/points/YYYY-MM.csv.gz  individual hotspots (for the CSV download)

Method
    1. Same definition of "hotspot" for every sensor
         MODIS : type == 0 (presumed vegetation fire) and confidence >= 30
         VIIRS : type == 0 and confidence is nominal or high (low is dropped)
    2. Same grid and time step: 0.1 degree cells, calendar months.
    3. VIIRS S-NPP is the reference (continuous 2012 -> today). VIIRS 375 m sees many
       more small fires than MODIS 1 km, so raw MODIS counts are NOT comparable.
    4. Transfer function (fit on the overlap period):
         ratio(block, month-of-year) = (VIIRS + K * national_ratio) / (MODIS + K)
       using 1 degree blocks, shrunk toward the national month-of-year ratio (K = 30)
       so sparse blocks do not give noisy ratios.
    5. Harmonized count h = VIIRS count where VIIRS exists, otherwise MODIS * ratio.
       After this step the sensor of origin no longer matters.
    6. Validation: fit on 2012-2018, test on 2019-2025 (held-out years).

Run:  python3 pipeline/build_data.py --raw raw --out public/data
"""
import argparse
import datetime as dt
import glob
import gzip
import io
import json
import os
import re
import sys

import numpy as np
import pandas as pd

K_SHRINK = 30.0
VIIRS_START = "2012-02"   # first full S-NPP month (S-NPP data begin 2012-01-20)
TRAIN_END_YEAR = 2018
CELL = 10                 # cells per degree (0.1 degree)


def load_polygon(js_path):
    src = open(js_path, encoding="utf-8").read()
    m = re.search(r"PK_POLY = (\[.*?\n\]);", src, re.S)
    if not m:
        sys.exit(f"Could not read PK_POLY from {js_path}")
    poly = json.loads(m.group(1).replace("\n", " "))
    assert len(poly) > 10
    return poly


def inside(poly, lat, lng):
    ins = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


def read_dir(folder):
    files = sorted(glob.glob(os.path.join(folder, "**", "*.csv"), recursive=True))
    if not files:
        return None
    frames = [pd.read_csv(f, dtype={"acq_time": str}, low_memory=False) for f in files]
    return pd.concat(frames, ignore_index=True)


def prepare(df, kind):
    """Return a tidy frame with one common schema."""
    out = pd.DataFrame({
        "date": df["acq_date"].astype(str),
        "time": df["acq_time"].astype(str).str.zfill(4),
        "latitude": df["latitude"].round(4),
        "longitude": df["longitude"].round(4),
        "frp": pd.to_numeric(df["frp"], errors="coerce"),
        "daynight": df["daynight"],
        "type": df["type"].fillna(0).astype(int),
    })
    if kind == "MODIS":
        conf = pd.to_numeric(df["confidence"], errors="coerce")
        out["sensor"] = "MODIS"
        out["satellite"] = df["satellite"].map({"Terra": "Terra", "Aqua": "Aqua"}).fillna(df["satellite"])
        out["confidence"] = conf.round().astype("Int64").astype(str)
        out["counted"] = ((out["type"] == 0) & (conf >= 30)).astype(int)
    else:
        conf = df["confidence"].astype(str).str.lower()
        out["sensor"] = "VIIRS"
        out["satellite"] = df["satellite"].map({"N": "S-NPP", "N20": "NOAA-20", "N21": "NOAA-21"}).fillna(df["satellite"])
        out["confidence"] = conf
        out["counted"] = ((out["type"] == 0) & conf.isin(["n", "h", "nominal", "high"])).astype(int)
    out["ym"] = out["date"].str[:7]
    out["ci"] = np.floor(out["latitude"] * CELL).astype(int)
    out["cj"] = np.floor(out["longitude"] * CELL).astype(int)
    return out


def metrics(Av, P, test, rows):
    res = []
    for i in rows:
        v, p = Av[i, test], P[i, test]
        if v.sum() < 50:
            continue
        r = np.corrcoef(v, p)[0, 1] if p.std() > 0 and v.std() > 0 else np.nan
        res.append((r, np.abs(v - p).sum() / v.sum(), (p.sum() - v.sum()) / v.sum()))
    a = np.array(res)
    return {"blocks": int(len(a)), "r": float(np.nanmedian(a[:, 0])),
            "nmae": float(np.median(a[:, 1])), "bias": float(np.median(a[:, 2]))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--poly", default=os.path.join(os.path.dirname(__file__), "..", "src", "heatmapData.js"))
    args = ap.parse_args()
    poly = load_polygon(args.poly)

    sources = {"modis": "MODIS", "viirs-snpp": "VIIRS", "viirs-noaa20": "VIIRS"}
    frames = {}
    for name, kind in sources.items():
        raw = read_dir(os.path.join(args.raw, name))
        if raw is None:
            print(f"  (no files in {args.raw}/{name})")
            continue
        frames[name] = prepare(raw, kind)
        print(f"  {name}: {len(raw):,} rows, {frames[name].date.min()} -> {frames[name].date.max()}")
    if "modis" not in frames or "viirs-snpp" not in frames:
        sys.exit("Need at least raw/modis and raw/viirs-snpp")

    # keep only cells whose centre is inside Pakistan
    allc = pd.concat([f[["ci", "cj"]] for f in frames.values()]).drop_duplicates()
    ok = {(a, b): inside(poly, (a + 0.5) / CELL, (b + 0.5) / CELL) for a, b in zip(allc.ci, allc.cj)}
    dropped = 0
    for k, f in frames.items():
        keep = np.fromiter((ok[(a, b)] for a, b in zip(f.ci, f.cj)), bool, len(f))
        dropped += int((~keep).sum())
        frames[k] = f[keep].reset_index(drop=True)
    print(f"  dropped {dropped:,} detections outside Pakistan")

    M, S = frames["modis"], frames["viirs-snpp"]
    N = frames.get("viirs-noaa20")

    # ---------------- monthly counts per cell ----------------
    def counts(f, name):
        g = f[f.counted == 1].groupby(["ci", "cj", "ym"]).size().rename(name)
        return g
    cm = pd.concat([counts(M, "m"), counts(S, "s")] + ([counts(N, "n")] if N is not None else []), axis=1).fillna(0).reset_index()
    for c in ("m", "s", "n"):
        if c not in cm:
            cm[c] = 0
        cm[c] = cm[c].astype(int)
    cm["bi"] = cm.ci // CELL
    cm["bj"] = cm.cj // CELL
    cm["moy"] = cm.ym.str[5:].astype(int)
    months = sorted(cm.ym.unique())
    # make the month axis gap-free
    y0, m0 = map(int, months[0].split("-"))
    y1, m1 = map(int, months[-1].split("-"))
    months = [f"{y}-{m:02d}" for y in range(y0, y1 + 1) for m in range(1, 13) if (y, m) >= (y0, m0) and (y, m) <= (y1, m1)]
    mi = {m: i for i, m in enumerate(months)}

    # ---------------- ratios on the overlap period ----------------
    ov = cm[cm.ym >= VIIRS_START]
    nat = ov.groupby("moy").agg(m=("m", "sum"), s=("s", "sum"))
    mr = (nat.s / nat.m).reindex(range(1, 13)).fillna(nat.s.sum() / nat.m.sum())
    blk = ov.groupby(["bi", "bj", "moy"]).agg(m=("m", "sum"), s=("s", "sum")).reset_index()
    blk["ratio"] = (blk.s + K_SHRINK * blk.moy.map(mr)) / (blk.m + K_SHRINK)
    ratio_map = {(r.bi, r.bj, r.moy): r.ratio for r in blk.itertuples(index=False)}

    def ratio_for(bi, bj, moy):
        return ratio_map.get((bi, bj, moy), float(mr[moy]))

    # ---------------- harmonized count ----------------
    rat = np.array([ratio_for(a, b, c) for a, b, c in zip(cm.bi, cm.bj, cm.moy)])
    native = (cm.ym >= VIIRS_START).to_numpy()
    cm["h"] = np.where(native, cm.s, cm.m * rat).round(1)
    cm = cm[(cm.m > 0) | (cm.s > 0) | (cm.n > 0) | (cm.h > 0)].copy()

    cells = cm[["ci", "cj"]].drop_duplicates().sort_values(["ci", "cj"]).reset_index(drop=True)
    cid = {(a, b): i for i, (a, b) in enumerate(zip(cells.ci, cells.cj))}
    cm["c"] = [cid[(a, b)] for a, b in zip(cm.ci, cm.cj)]
    cm["t"] = cm.ym.map(mi)
    cm = cm.sort_values(["c", "t"])

    os.makedirs(args.out, exist_ok=True)
    cal = {
        "meta": {
            "grid_deg": 1 / CELL,
            "first_month": months[0], "last_month": months[-1],
            "viirs_start": VIIRS_START,
            "generated": dt.date.today().isoformat(),
            "columns": {"c": "cell index", "t": "month index", "m": "MODIS hotspots", "s": "VIIRS S-NPP hotspots",
                        "n": "VIIRS NOAA-20 hotspots (cross-check only)", "h": "harmonized hotspots (VIIRS-equivalent)"},
            "cell_lat": "(ci + 0.5) / 10", "cell_lng": "(cj + 0.5) / 10",
        },
        "months": months,
        "cells": {"ci": cells.ci.tolist(), "cj": cells.cj.tolist()},
        "rows": {k: cm[k].tolist() for k in ("c", "t", "m", "s", "n", "h")},
    }
    with open(os.path.join(args.out, "calendar.json"), "w") as f:
        json.dump(cal, f, separators=(",", ":"))

    # ---------------- validation (train 2012-2018, test 2019-2025) ----------------
    ovm = [m for m in months if m >= VIIRS_START]
    oi = {m: i for i, m in enumerate(ovm)}
    blocks = sorted(set(zip(cm.bi, cm.bj)))
    bidx = {b: i for i, b in enumerate(blocks)}
    Am = np.zeros((len(blocks), len(ovm)))
    Av = np.zeros_like(Am)
    for r in ov.itertuples(index=False):
        i, j = bidx[(r.bi, r.bj)], oi[r.ym]
        Am[i, j] += r.m
        Av[i, j] += r.s
    yrs = np.array([int(m[:4]) for m in ovm])
    moy = np.array([int(m[5:]) for m in ovm])
    train, test = yrs <= TRAIN_END_YEAR, yrs > TRAIN_END_YEAR
    g_ratio = Av[:, train].sum() / Am[:, train].sum()
    mr_t = np.array([Av[:, (moy == k) & train].sum() / max(Am[:, (moy == k) & train].sum(), 1) for k in range(1, 13)])
    bs = np.zeros((len(blocks), 12))
    for k in range(1, 13):
        sel = (moy == k) & train
        bs[:, k - 1] = (Av[:, sel].sum(1) + K_SHRINK * mr_t[k - 1]) / (Am[:, sel].sum(1) + K_SHRINK)
    pred = {
        "Raw MODIS (no harmonization)": Am,
        "Single national ratio": Am * g_ratio,
        "Month-of-year ratio": Am * mr_t[moy - 1][None, :],
        "Block x month ratio (used)": Am * bs[:, moy - 1],
    }
    big = [i for i in range(len(blocks)) if Av[i, train].sum() >= 300]
    tot_v = Av[:, test].sum(0)
    val = []
    for name, P in pred.items():
        p = P[:, test].sum(0)
        val.append({
            "method": name,
            "national": {"r": float(np.corrcoef(tot_v, p)[0, 1]),
                         "nmae": float(np.abs(tot_v - p).sum() / tot_v.sum()),
                         "bias": float((p.sum() - tot_v.sum()) / tot_v.sum())},
            "blocks": metrics(Av, P, test, big),
        })
    test_months = [m for m, t in zip(ovm, test) if t]

    # N20 vs S-NPP consistency
    n20 = None
    if N is not None:
        both = cm[(cm.n > 0) & (cm.ym >= "2018-05")].groupby("ym").agg(s=("s", "sum"), n=("n", "sum"))
        n20 = {"months": both.index.tolist(), "snpp": both.s.astype(int).tolist(), "noaa20": both.n.astype(int).tolist(),
               "r": float(np.corrcoef(both.s, both.n)[0, 1]), "ratio_mean": float((both.n / both.s).mean())}

    yearly = cm.assign(y=cm.ym.str[:4]).groupby("y").agg(m=("m", "sum"), s=("s", "sum"), n=("n", "sum"), h=("h", "sum")).round(1)
    harm = {
        "definition": {
            "MODIS": "type = 0 (presumed vegetation fire) and confidence >= 30",
            "VIIRS": "type = 0 and confidence nominal or high (low dropped)",
            "grid": "0.1 degree cells, calendar months",
            "reference": "VIIRS S-NPP",
            "transfer": "ratio(block, month) = (VIIRS + K*national_ratio) / (MODIS + K), 1 degree blocks, K = 30",
            "harmonized": "VIIRS count where VIIRS exists; otherwise MODIS count x ratio",
        },
        "viirs_start": VIIRS_START,
        "national_month_ratio": {str(k): float(v) for k, v in mr.items()},
        "validation": {"train": f"{ovm[0]} to {TRAIN_END_YEAR}-12", "test": f"{TRAIN_END_YEAR + 1}-01 to {ovm[-1]}",
                       "methods": val,
                       "series": {"months": test_months, "viirs_actual": tot_v.astype(int).tolist(),
                                  "modis_raw": pred["Raw MODIS (no harmonization)"][:, test].sum(0).astype(int).tolist(),
                                  "modis_harmonized": pred["Block x month ratio (used)"][:, test].sum(0).round(1).tolist()}},
        "noaa20_check": n20,
        "yearly": {y: {k: float(v) for k, v in row.items()} for y, row in yearly.iterrows()},
        "excluded_outside_pakistan": dropped,
    }
    with open(os.path.join(args.out, "harmonization.json"), "w") as f:
        json.dump(harm, f, separators=(",", ":"))

    # ---------------- individual hotspots, one gz CSV per month ----------------
    pts = pd.concat([M, S] + ([N] if N is not None else []), ignore_index=True)
    cols = ["date", "time", "latitude", "longitude", "sensor", "satellite", "frp", "confidence", "daynight", "type", "counted"]
    pdir = os.path.join(args.out, "points")
    os.makedirs(pdir, exist_ok=True)
    for old in glob.glob(os.path.join(pdir, "*.csv.gz")):
        os.remove(old)
    n_files = 0
    for ym, g in pts.groupby("ym"):
        g = g.sort_values(["date", "time", "sensor"])[cols]
        buf = io.StringIO()
        g.to_csv(buf, index=False, float_format="%g")
        with open(os.path.join(pdir, f"{ym}.csv.gz"), "wb") as raw_f:
            with gzip.GzipFile(fileobj=raw_f, mode="wb", mtime=0, compresslevel=9) as gz:
                gz.write(buf.getvalue().encode())
        n_files += 1

    def mb(p):
        return os.path.getsize(p) / 1e6
    tot_pts = sum(mb(p) for p in glob.glob(os.path.join(pdir, "*.csv.gz")))
    print(f"\ncalendar.json: {mb(os.path.join(args.out, 'calendar.json')):.1f} MB, {len(cm):,} cell-months, {len(cells):,} cells")
    print(f"harmonization.json: {mb(os.path.join(args.out, 'harmonization.json')):.2f} MB")
    print(f"points/: {n_files} files, {tot_pts:.1f} MB total, {len(pts):,} hotspots")


if __name__ == "__main__":
    main()
